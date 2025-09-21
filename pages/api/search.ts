import type { NextApiRequest, NextApiResponse } from "next";

type Item = {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  shop: string | null;
  source: "rakuten";
  url: string;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const q = String(req.query.q || "").trim();
    const mode = (String(req.query.mode || "normal") as "normal" | "gift");
    if (!q) return res.status(400).json({ error: "q is required" });

    // 価格レンジパラメータを受け取り
    const minPrice = Number(req.query.minPrice ?? "");
    const maxPrice = Number(req.query.maxPrice ?? "");
    const priceParams = [
      Number.isFinite(minPrice) ? `minPrice=${minPrice}` : "",
      Number.isFinite(maxPrice) ? `maxPrice=${maxPrice}` : "",
    ].filter(Boolean).join("&");

    const appId = process.env.RAKUTEN_APP_ID;
    if (!appId) return res.status(500).json({ error: "RAKUTEN_APP_ID missing" });

    const url = `${RAKUTEN_BASE}?applicationId=${appId}&keyword=${encodeURIComponent(q)}&hits=30&imageFlag=1${priceParams ? `&${priceParams}` : ""}`;
    const r = await fetch(url, { headers: { "User-Agent": "japanese-sake-ai" } });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(502).json({ error: "rakuten_fetch_failed", status: r.status, body: txt.slice(0, 500) });
    }

    const data = (await r.json()) as RakutenResponse;
    if (data.error) return res.status(502).json({ error: "rakuten_api_error", detail: data });

    const rawItems = Array.isArray(data.Items) ? data.Items : [];
    const items: Item[] = rawItems.map(({ Item: it }) => {
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
        url: wrapMoshimo(it.itemUrl),
      };
    });

    const noFilter = process.env.NO_FILTER === "1";
    const allowSets = mode === "gift";
    const filtered = noFilter ? items : items.filter((it) => passAllRules(it, { allowSets }));
    const result = filtered.length > 0 ? filtered : fallbackItems();

    return res.status(200).json({
      items: result,
      total: items.length,
      afterFilter: filtered.length,
      noFilter,
      mode,
    });
  } catch (e: unknown) {
    console.error("[SEARCH_CATCH]", e);
    return res.status(500).json({ error: "search_failed", message: String(e instanceof Error ? e.message : e) });
  }
}

function passAllRules(it: Item, opts: { allowSets: boolean }): boolean {
  if (it.price != null && (it.price < 1000 || it.price > 20000)) return false;

  const ng = [
    "箱のみ","化粧箱のみ","カートン","ケース","段ボール","専用箱",
    "お猪口","徳利","ぐい呑","グラス","酒器","袋のみ","ギフト袋",
    "梅酒","みりん","焼酎","ビール","ワイン"
  ];
  if (ng.some((w) => it.title.includes(w))) return false;

  const setNg = ["セット","飲み比べ","詰め合わせ","3本","5本","6本"];
  if (!opts.allowSets && setNg.some((w) => it.title.includes(w))) return false;

  if (!it.title || !it.image) return false;
  return true;
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
      url: wrapMoshimo("https://search.rakuten.co.jp/search/mall/%E7%8D%BA%E7%A5%AD+39/"),
    },
    {
      id: "fallback-kubota-senju",
      title: "【フォールバック】久保田 千寿",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
      url: wrapMoshimo("https://search.rakuten.co.jp/search/mall/%E4%B9%85%E4%BF%9D%E7%94%B0+%E5%8D%83%E5%AF%BF/"),
    },
    {
      id: "fallback-hakkaisan",
      title: "【フォールバック】八海山 特別本醸造",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
      url: wrapMoshimo("https://search.rakuten.co.jp/search/mall/%E5%85%AB%E6%B5%B7%E5%B1%B1+%E7%89%B9%E5%88%A5%E6%9C%AC%E9%86%B8%E9%80%A0/"),
    },
  ];
}

