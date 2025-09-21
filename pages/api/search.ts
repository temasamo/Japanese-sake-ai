// pages/api/search.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  buildYahooParamsStages,
  YAHOO_ENDPOINT_V3,
  YAHOO_ENDPOINT_V1,
  type YahooBaseParams,
} from "@/lib/search/yahooQuery";
import { slog } from "@/lib/search/logger";

/** 統一アイテム型 */
type Item = {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  shop: string | null;
  source: "rakuten" | "yahoo";
  url: string; // アフィ化済みURL
  _idx?: number; // 安定ソート用の元順序
};

/* -------------------- 共通ユーティリティ -------------------- */

const RAKUTEN_BASE =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

const PRICE_TOL = 300;
const PRICE_RATE = 0.05;
const HITS = 30;

const noFilterEnv = process.env.NO_FILTER === "1";

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const timeout = (ms: number) =>
  new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
const withTimeout = <T,>(p: Promise<T>, ms = 2500) =>
  Promise.race([p, timeout(ms)]) as Promise<T>;

function extractVolumeMl(title: string): number | null {
  const m = title.match(/(\d{3,4})\s?ml/i);
  if (m) return Number(m[1]);
  const m2 = title.match(/(\d(?:\.\d)?)\s?l/i);
  if (m2) return Math.round(Number(m2[1]) * 1000);
  return null;
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[【】［］\[\]()（）]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isNearPrice(a: number, b: number) {
  const diff = Math.abs(a - b);
  const tol = Math.max(PRICE_TOL, Math.round(Math.min(a, b) * PRICE_RATE));
  return diff <= tol;
}

/* -------------------- アフィ用ラッパ -------------------- */
function wrapMoshimo(targetUrl: string) {
  const aid = process.env.MOSHIMO_A_ID!;
  const pid = process.env.MOSHIMO_P_ID!;
  const pcid = process.env.MOSHIMO_PC_ID!;
  const plid = process.env.MOSHIMO_PL_ID!;
  return `https://af.moshimo.com/af/c/click?a_id=${aid}&p_id=${pid}&pc_id=${pcid}&pl_id=${plid}&url=${encodeURIComponent(
    targetUrl
  )}`;
}
function wrapVC(yahooItemUrl: string) {
  const sid = process.env.YAHOO_VC_SID!;
  const pid = process.env.YAHOO_VC_PID!;
  return `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${sid}&pid=${pid}&vc_url=${encodeURIComponent(
    yahooItemUrl
  )}`;
}

/* -------------------- 楽天の取得 -------------------- */

type RakutenImage = { imageUrl: string };
type RakutenItem = {
  itemCode: string;
  itemName: string;
  itemPrice?: number;
  itemUrl: string;
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

async function fetchRakuten(
  keyword: string,
  minPrice?: number,
  maxPrice?: number
): Promise<Item[]> {
  const appId = process.env.RAKUTEN_APP_ID!;
  const params = new URLSearchParams({
    applicationId: appId,
    keyword,
    hits: String(HITS),
    imageFlag: "1",
  });
  if (Number.isFinite(minPrice!)) params.set("minPrice", String(minPrice));
  if (Number.isFinite(maxPrice!)) params.set("maxPrice", String(maxPrice));
  // 価格指定ありのときは価格順
  if (params.has("minPrice") || params.has("maxPrice")) {
    params.set("sort", "+itemPrice");
  }

  const r = await fetch(`${RAKUTEN_BASE}?${params.toString()}`, {
    headers: { "User-Agent": "japanese-sake-ai" },
  });
  if (!r.ok) return [];

  const data = (await r.json()) as RakutenResponse;
  if (data.error) return [];

  const raw = Array.isArray(data.Items) ? data.Items : [];
  return raw.map(({ Item: it }, i) => {
    const img =
      it.mediumImageUrls?.[0]?.imageUrl ??
      it.smallImageUrls?.[0]?.imageUrl ??
      null;
    return {
      id: `rakuten:${it.itemCode || it.itemUrl}`,
      title: it.itemName ?? "",
      price: typeof it.itemPrice === "number" ? it.itemPrice : null,
      image: img,
      shop: it.shopName ?? null,
      source: "rakuten" as const,
      url: wrapMoshimo(it.itemUrl),
      _idx: i,
    };
  });
}

/* -------------------- Yahooの取得（段階的フォールバック） -------------------- */

type YahooV3Item = {
  name: string;
  price: number;
  url: string;
  image?: { small?: string; medium?: string };
  seller?: { name?: string };
  code?: string;
};
type YahooV3Response = { totalResultsAvailable: number; hits?: YahooV3Item[] };

type YahooV1Hit = {
  name?: string; price?: number; url?: string; image?: string;
  store?: { name?: string }; code?: string;
};
type YahooV1Response = { totalResultsAvailable: number; hits?: YahooV1Hit[] };

function imgV3(i: YahooV3Item) {
  return i.image?.medium || i.image?.small || null;
}

async function fetchYahooOnce(params: Record<string, string | number | boolean>, endpoint: string) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v != null && qs.set(k, String(v)));
  const url = `${endpoint}?${qs.toString()}`;

  const res = await fetch(url, {
    headers: {
      "X-Yahoo-App-Id": process.env.YAHOO_APP_ID || "",
      "Accept": "application/json",
    },
  });

  const text = await res.text();
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return { totalResultsAvailable: 0, hits: [] };
  }
  try { return JSON.parse(text); } catch { return { totalResultsAvailable: 0, hits: [] }; }
}

async function fetchYahooWithStages(inputQuery: string, base: YahooBaseParams): Promise<Item[]> {
  const stages = buildYahooParamsStages(inputQuery, base);

  for (const st of stages) {
    const v3 = await fetchYahooOnce(st.params, YAHOO_ENDPOINT_V3) as YahooV3Response;
    const total = v3?.totalResultsAvailable ?? 0;
    slog("info", `Yahoo V3 stage=${st.stage} total=${total}`, { params: st.params, q: st.queryForView });

    if (total > 0 && v3.hits?.length) {
      return v3.hits.map((h, idx) => ({
        id: h.code || `${st.stage}-${idx}`,
        title: h.name,
        price: typeof h.price === "number" ? h.price : null,
        image: imgV3(h),
        shop: h.seller?.name || null,
        source: "yahoo",
        url: wrapVC(h.url),
        _idx: idx,
      }));
    }
  }

  // V1 fallback（最後のパラメタで）
  const last = stages[stages.length - 1];
  const v1 = await fetchYahooOnce(last.params, YAHOO_ENDPOINT_V1) as YahooV1Response;
  const total1 = v1?.totalResultsAvailable ?? 0;
  slog("warn", `Yahoo V1 fallback total=${total1}`, { params: last.params });

  if (total1 > 0 && v1.hits?.length) {
    return v1.hits.map((h, idx) => ({
      id: h.code || `V1-${idx}`,
      title: h.name || "",
      price: typeof h.price === "number" ? h.price : null,
      image: h.image || null,
      shop: h.store?.name || null,
      source: "yahoo",
      url: wrapVC(h.url || ""),
      _idx: idx,
    }));
  }
  return [];
}

// 既存のfetchYahoo関数（後方互換性のため保持）
async function fetchYahoo(
  keyword: string,
  minPrice?: number,
  maxPrice?: number
): Promise<Item[]> {
  const appid = process.env.YAHOO_APP_ID!;
  const baseV3 = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";

  const params = new URLSearchParams({
    query: keyword,
    results: String(HITS),
    in_stock: "true",
    image_size: "300",
  });
  if (Number.isFinite(minPrice!)) params.set("price_from", String(minPrice));
  if (Number.isFinite(maxPrice!)) params.set("price_to", String(maxPrice));

  try {
    const r = await fetch(`${baseV3}?${params.toString()}`, {
      headers: {
        "User-Agent": "japanese-sake-ai",
        Accept: "application/json",
        "X-Yahoo-App-Id": appid,
      },
    });

    const ctype = r.headers.get("content-type") || "";
    if (!r.ok || !ctype.includes("application/json")) {
      throw new Error(`v3_bad_response status=${r.status} ctype=${ctype}`);
    }

    const j = await r.json();
    const parsed = parseYahooResponse(j);
    if (parsed.length) {
      return parsed.map((it, i) => ({
        id: `yahoo:${it.url}`,
        title: it.title,
        price: it.price,
        image: it.image,
        shop: it.shop ?? "Yahoo!ショッピング",
        source: "yahoo" as const,
        url: wrapVC(it.url),
        _idx: i,
      }));
    }
    throw new Error("v3_zero_hits");
  } catch (e) {
    try {
      const baseV1 = "https://shopping.yahooapis.jp/ShoppingWebService/V1/json/itemSearch";
      const p1 = new URLSearchParams({
        appid,
        query: keyword,
        hits: String(HITS),
        availability: "1",
      });
      const r1 = await fetch(`${baseV1}?${p1.toString()}`, {
        headers: {
          "User-Agent": "japanese-sake-ai",
          Accept: "application/json",
        },
      });

      const ctype1 = r1.headers.get("content-type") || "";
      if (!r1.ok || !ctype1.includes("application/json")) {
        throw new Error(`v1_bad_response status=${r1.status} ctype=${ctype1}`);
      }

      const j1 = await r1.json();
      const parsed = parseYahooResponse(j1);
      const filtered = parsed.filter((it) => {
        if (it.price == null) return true;
        if (Number.isFinite(minPrice!) && it.price! < (minPrice as number)) return false;
        if (Number.isFinite(maxPrice!) && it.price! > (maxPrice as number)) return false;
        return true;
      });

      return filtered.map((it, i) => ({
        id: `yahoo:${it.url}`,
        title: it.title,
        price: it.price,
        image: it.image,
        shop: it.shop ?? "Yahoo!ショッピング",
        source: "yahoo" as const,
        url: wrapVC(it.url),
        _idx: i,
      }));
    } catch {
      return [];
    }
  }
}

// 既存のparseYahooResponse関数（後方互換性のため保持）
type UnifiedYahooItem = {
  title: string;
  url: string;
  price: number | null;
  image: string | null;
  shop: string | null;
};

function parseYahooResponse(j: any): UnifiedYahooItem[] {
  const out: UnifiedYahooItem[] = [];

  if (Array.isArray(j?.hits)) {
    for (const h of j.hits) {
      const title = h?.name ?? "";
      const url = h?.url ?? "";
      const priceNum =
        h?.price != null
          ? Number(h.price)
          : h?.priceLabel?.price != null
          ? Number(h.priceLabel.price)
          : NaN;
      const image =
        h?.image?.medium ?? h?.image?.small ?? h?.image?.large ?? null;
      const shop = h?.seller?.name ?? null;
      if (title && url) {
        out.push({
          title,
          url,
          price: Number.isFinite(priceNum) ? priceNum : null,
          image,
          shop,
        });
      }
    }
    if (out.length) return out;
  }

  const hits =
    j?.ResultSet?.[0]?.Result?.Hit ??
    j?.ResultSet?.[0]?.Result ??
    j?.ResultSet?.Result?.Hit;
  if (Array.isArray(hits)) {
    for (const h of hits) {
      const title = h?.Name ?? h?.name ?? "";
      const url = h?.Url ?? h?.url ?? "";
      const rawPrice =
        h?.Price?._value ?? h?.Price?.Value ?? h?.Price ?? h?.price;
      const priceNum =
        rawPrice != null ? Number(String(rawPrice).replace(/[,¥]/g, "")) : NaN;
      const image =
        h?.Image?.Medium ??
        h?.Image?.Small ??
        h?.Image?.Large ??
        h?.image?.medium ??
        null;
      const shop =
        h?.Store?.Name ?? h?.Seller?.Name ?? h?.seller?.name ?? null;

      if (title && url) {
        out.push({
          title,
          url,
          price: Number.isFinite(priceNum) ? priceNum : null,
          image,
          shop,
        });
      }
    }
  }
  return out;
}

/* -------------------- ルール/スコア/フォールバック -------------------- */

function passAllRules(it: Item, mode: "normal" | "gift"): boolean {
  if (!it.title || !it.image) return false;

  // 価格帯（極端に安い/高い除外）
  if (it.price != null && (it.price < 1000 || it.price > 20000)) return false;

  // 箱・グッズ・他ジャンル除外
  const ng = [
    "箱のみ",
    "化粧箱のみ",
    "カートン",
    "ケース",
    "段ボール",
    "専用箱",
    "お猪口",
    "徳利",
    "ぐい呑",
    "グラス",
    "酒器",
    "袋のみ",
    "ギフト袋",
    "梅酒",
    "みりん",
    "焼酎",
    "ビール",
    "ワイン",
  ];
  if (ng.some((w) => it.title.includes(w))) return false;

  // セット系（ギフトは許可）
  const setNg = ["セット", "飲み比べ", "詰め合わせ", "3本", "5本", "6本"];
  if (mode !== "gift" && setNg.some((w) => it.title.includes(w))) return false;

  return true;
}

function scoreByMode(it: Item, mode: "normal" | "gift"): number {
  let score = 0;
  const t = it.title.toLowerCase();

  // 日本酒キーワード
  if (t.includes("純米大吟醸")) score += 10;
  if (t.includes("純米吟醸")) score += 8;
  if (t.includes("大吟醸")) score += 6;
  if (t.includes("吟醸")) score += 4;
  if (t.includes("純米")) score += 3;
  if (t.includes("本醸造")) score += 2;

  // モード別
  if (mode === "gift") {
    if (t.includes("ギフト") || t.includes("贈答")) score += 5;
    if (t.includes("化粧箱") || t.includes("箱入り")) score += 3;
    if (t.includes("セット") || t.includes("詰め合わせ")) score += 2;
  } else {
    if (t.includes("720ml")) score += 2;
    if (t.includes("1800ml") || t.includes("一升")) score += 1;
  }

  return score;
}

function fallbackItems(): Item[] {
  return [
    {
      id: "fallback-dassai",
      title: "【フォールバック】獺祭 純米大吟醸 720ml",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
      url: wrapMoshimo(
        "https://search.rakuten.co.jp/search/mall/%E7%8D%BA%E7%A5%AD+%E7%B4%94%E7%B1%B3%E5%A4%A7%E5%90%9F%E9%86%B8/"
      ),
    },
    {
      id: "fallback-hakkaisan",
      title: "【フォールバック】八海山 特別本醸造",
      price: null,
      image: null,
      shop: null,
      source: "rakuten",
      url: wrapMoshimo(
        "https://search.rakuten.co.jp/search/mall/%E5%85%AB%E6%B5%B7%E5%B1%B1+%E7%89%B9%E5%88%A5%E6%9C%AC%E9%86%B8%E9%80%A0/"
      ),
    },
  ];
}

/* -------------------- ハンドラ -------------------- */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });

    // mode, minPrice, maxPrice
    const mode: "normal" | "gift" =
      (String(req.query.mode || "normal")) === "gift" ? "gift" : "normal";
    const minPrice = toNum(req.query.minPrice);
    const maxPrice = toNum(req.query.maxPrice);

    // affiliate_id を SID/PID から構成
    const sid = process.env.YAHOO_VC_SID;
    const pid = process.env.YAHOO_VC_PID;
    const affiliate_id = sid && pid ? `${sid}_${pid}` : undefined;

    const yahooBase: YahooBaseParams = {
      appid: process.env.YAHOO_APP_ID || "",
      genre_category_id: "1359",
      in_stock: true,
      results: 20,
      start: 1,
      sort: "-score",
      image_size: 300,
      price_from: minPrice,
      price_to: maxPrice,
      affiliate_type: affiliate_id ? "vc" : undefined,
      affiliate_id,
    };

    // フラグで新旧を切替
    const useNew = String(process.env.YAHOO_FALLBACK_ENABLED || "false") === "true";

    // 並列取得（タイムアウト付き）
    const [rk, yh] = await Promise.allSettled([
      withTimeout(fetchRakuten(q, minPrice ?? undefined, maxPrice ?? undefined)),
      withTimeout(
        useNew 
          ? fetchYahooWithStages(q, yahooBase)
          : fetchYahoo(q, minPrice ?? undefined, maxPrice ?? undefined)
      ),
    ]);

    const rakutenItems = rk.status === "fulfilled" ? rk.value : [];
    const yahooItems = yh.status === "fulfilled" ? yh.value : [];

    let sources = {
      rakuten: rk.status === "fulfilled" ? "ok" : "err",
      yahoo: yh.status === "fulfilled" ? "ok" : "err",
    };

    // マージ & 重複除去
    const byKey = new Map<string, Item>();
    const all = [...rakutenItems, ...yahooItems];

    for (const it of all) {
      const keyBase = normalizeTitle(it.title);
      const vol = extractVolumeMl(it.title);
      const key = vol ? `${keyBase}_${vol}` : keyBase;

      const ex = byKey.get(key);
      if (!ex) {
        byKey.set(key, it);
      } else {
        const pa = it.price;
        const pb = ex.price;
        if (pa != null && pb != null && isNearPrice(pa, pb)) {
          // 近似価格：安い方
          if (pa < pb) byKey.set(key, it);
        } else if (pa != null && pb == null) {
          byKey.set(key, it);
        }
      }
    }

    let merged = [...byKey.values()];

    // フィルタ（NO_FILTER=1 ならスキップ）
    const filtered = noFilterEnv ? merged : merged.filter((x) => passAllRules(x, mode));

    // スコア + 価格 + 元順の安定ソート
    filtered.sort((a, b) => {
      const ds =
        scoreByMode(b, mode) -
        scoreByMode(a, mode);
      if (ds !== 0) return ds;
      if (a.price == null && b.price == null) return (a._idx ?? 0) - (b._idx ?? 0);
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      const dp = a.price - b.price;
      if (dp !== 0) return dp;
      return (a._idx ?? 0) - (b._idx ?? 0);
    });

    // フォールバック
    const result = filtered.length > 0 ? filtered : fallbackItems();

    return res.status(200).json({
      items: result,
      total: all.length,
      afterFilter: filtered.length,
      noFilter: noFilterEnv,
      debug: {
        sources,
        mergedCount: merged.length,
        dedupedCount: result.length,
        mode,
        minPrice,
        maxPrice,
        usedNew: useNew,
        affiliate_id,
      },
    });
  } catch (e: any) {
    slog("error", "API /search failed", e);
    return res.status(500).json({
      error: "search_failed",
      message: e?.message ?? String(e),
    });
  }
}
