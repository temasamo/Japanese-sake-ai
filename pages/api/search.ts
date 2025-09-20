import type { NextApiRequest, NextApiResponse } from "next";

type Item = {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  shop: string | null;
  source: "rakuten";
  url: string;
  _idx?: number; // 元順序保持用
};

type RakutenImage = { imageUrl: string };
type RakutenItem = {
  itemCode: string;
  itemName: string;
  itemPrice?: number;
  itemUrl: string;
  affiliateUrl?: string;
  shopName?: string;
  mediumImageUrls?: RakutenImage[];
  smallImageUrls?: RakutenImage[];
};
type RakutenResponse = {
  Items?: { Item: RakutenItem }[];
  count?: number;
  error?: string;
  error_description?: string;
};

const RAKUTEN_BASE =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

function wrapMoshimo(targetUrl: string) {
  const aid = process.env.MOSHIMO_A_ID!;
  const pid = process.env.MOSHIMO_P_ID!;
  const pcid = process.env.MOSHIMO_PC_ID!;
  const plid = process.env.MOSHIMO_PL_ID!;
  return `https://af.moshimo.com/af/c/click?a_id=${aid}&p_id=${pid}&pc_id=${pcid}&pl_id=${plid}&url=${encodeURIComponent(
    targetUrl
  )}`;
}

// ========= ここからハンドラ =========
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });

    const mode = String(req.query.mode || "normal"); // "gift" ならギフトモード

    const appId = process.env.RAKUTEN_APP_ID;
    if (!appId) return res.status(500).json({ error: "RAKUTEN_APP_ID missing" });

    const url = `${RAKUTEN_BASE}?applicationId=${appId}&keyword=${encodeURIComponent(
      q
    )}&hits=20&imageFlag=1`;

    const r = await fetch(url, { headers: { "User-Agent": "japanese-sake-ai" } });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res
        .status(502)
        .json({ error: "rakuten_fetch_failed", status: r.status, body: txt.slice(0, 500) });
    }

    const data = (await r.json()) as RakutenResponse;
    if ("error" in data && data.error) return res.status(502).json({ error: "rakuten_api_error", detail: data });

    const rawItems = Array.isArray(data.Items) ? data.Items : [];
    const items: Item[] = rawItems.map(({ Item: it }, idx) => {
      const img =
        it.mediumImageUrls?.[0]?.imageUrl ??
        it.smallImageUrls?.[0]?.imageUrl ??
        null;
      return {
        id: String(it.itemCode),
        title: it.itemName ?? "",
        price: typeof it.itemPrice === "number" ? it.itemPrice : null,
        image: img,
        shop: it.shopName ?? null,
        source: "rakuten",
        _idx: 0, // フォールバック用
        // affiliateUrl は使わず、もしもで統一
        url: wrapMoshimo(it.itemUrl),
      };
    });

    const noFilter = process.env.NO_FILTER === "1";
    const allowSets = mode === "gift";
    const filtered = noFilter ? items : items.filter((it) => passAllRules(it, { allowSets }));

    // モード別スコアリングで並び替え
    const sorted =
      filtered.length > 0
        ? [...filtered].sort((a, b) => {
            const s = scoreByMode(b, mode as "normal" | "gift") - scoreByMode(a, mode as "normal" | "gift");
            if (s !== 0) return s;
            return (a._idx ?? 0) - (b._idx ?? 0); // 元順に
          })
        : fallbackItems();

    const result = sorted;

    return res
      .status(200)
      .json({ items: result, total: items.length, afterFilter: filtered.length, noFilter, mode });
  } catch (e: unknown) {
    console.error("[SEARCH_CATCH]", e);
    return res.status(500).json({ error: "search_failed", message: e instanceof Error ? e.message : String(e) });
  }
}
// ========= ここまでハンドラ =========

function passAllRules(it: Item, opts: { allowSets: boolean }): boolean {
  // 価格帯
  if (it.price != null && (it.price < 1000 || it.price > 20000)) return false;

  // 箱・ケース・グッズ・他ジャンル除外
  const ng = [
    "箱のみ","化粧箱のみ","カートン","ケース","段ボール","専用箱",
    "お猪口","徳利","ぐい呑","グラス","酒器","袋のみ","ギフト袋",
    "梅酒","みりん","焼酎","ビール","ワイン"
  ];
  if (ng.some(w => it.title.includes(w))) return false;

  // セット系：通常は除外、ギフトは許可
  const setNg = ["セット","飲み比べ","詰め合わせ","3本","5本","6本"];
  if (!opts.allowSets && setNg.some(w => it.title.includes(w))) return false;

  if (!it.title || !it.image) return false;
  return true;
}

// ===== モード別スコアリング =====
function scoreByMode(it: Item, mode: "normal" | "gift"): number {
  const title = it.title ?? "";

  // 共通: ふるさと納税は検索文脈ではだいたいノイズ
  let score = /ふるさと納税/.test(title) ? -5 : 0;

  if (mode === "gift") {
    // ギフトで上げたいワード（強い順）
    const giftPos = [
      { re: /(ギフト|贈|贈答|御祝|お祝い|のし|熨斗)/, pts: 6 },
      { re: /(化粧箱|木箱|箱入り)/, pts: 5 },
      { re: /(セット|飲み比べ|詰め合わせ)/, pts: 5 },
      { re: /(限定|御中元|お歳暮|敬老)/, pts: 2 },
    ];
    for (const { re, pts } of giftPos) if (re.test(title)) score += pts;

    // 価格帯調整
    if (it.price != null) {
      if (it.price >= 3000 && it.price <= 5000) score += 4;   // 3–5k
      else if (it.price >= 8000 && it.price <= 12000) score += 2; // 8–12k
      else if (it.price > 15000) score -= 1; // 緩めに
    }
  } else {
    // 通常は単品重視：セット/飲み比べ/本数表記は下げる
    const normalNeg = [
      { re: /(セット|飲み比べ|詰め合わせ)/, pts: -8 },
      { re: /(\b[2-9]本\b|×\d+本)/, pts: -6 }, // 2本以上や×○本表記
      { re: /(ギフト|のし|熨斗|化粧箱|箱入り)/, pts: -3 },
    ];
    for (const { re, pts } of normalNeg) if (re.test(title)) score += pts;

    // 単品らしい語（四合瓶/720ml/一升/1800ml 等）があれば少し上げる
    if (/(720ml|1800ml|一升|四合)/.test(title)) score += 2;

    // 価格帯調整
    if (it.price != null) {
      if (it.price >= 2000 && it.price <= 6000) score += 3;  // 2–6k
      if (it.price < 1000) score -= 4;                       // 1k未満
    }
  }

  return score;
}

function fallbackItems(): Item[] {
  return [
    {
      id: "fallback-dassai-39",
      title: "【フォールバック】獺祭 純米大吟醸 39",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
        _idx: 0, // フォールバック用
      url: wrapMoshimo("https://search.rakuten.co.jp/search/mall/%E7%8D%BA%E7%A5%AD+39/")
    },
    {
      id: "fallback-kubota-senju",
      title: "【フォールバック】久保田 千寿",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
        _idx: 0, // フォールバック用
      url: wrapMoshimo("https://search.rakuten.co.jp/search/mall/%E4%B9%85%E4%BF%9D%E7%94%B0+%E5%8D%83%E5%AF%BF/")
    },
    {
      id: "fallback-hakkaisan",
      title: "【フォールバック】八海山 特別本醸造",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
        _idx: 0, // フォールバック用
      url: wrapMoshimo("https://search.rakuten.co.jp/search/mall/%E5%85%AB%E6%B5%B7%E5%B1%B1+%E7%89%B9%E5%88%A5%E6%9C%AC%E9%86%B8%E9%80%A0/")
    },
  ];
}

// ===== モード別スコアリング =====
