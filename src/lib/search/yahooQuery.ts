// src/lib/search/yahooQuery.ts
export type YahooStage = "A" | "B" | "C";

export type YahooBaseParams = {
  appid: string;
  genre_category_id?: string;
  in_stock?: boolean;
  results?: number;
  start?: number;
  sort?: string;
  image_size?: number;
  price_from?: number | null;
  price_to?: number | null;
  affiliate_type?: "vc";
  affiliate_id?: string | undefined;
};

export type YahooBuilt = {
  stage: YahooStage;
  params: Record<string, string | number | boolean>;
  queryForView: string;
};

const DEFAULT_GENRE_SAKE = "1359";

// ---- 正規化 ----------------------------------------------------
const zenToHanMap: Record<string, string> = {
  "（": "(", "）": ")", "【": "[", "】": "]", "／": "/", "・": " ",
  "　": " ",
};

export function normalizeQuery(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  for (const [z, h] of Object.entries(zenToHanMap)) s = s.split(z).join(h);
  s = s.replace(/[【】\[\]（）/・]+/g, " ");
  s = s.replace(/\b720\s*ml\b/gi, "720ml");
  s = s.replace(/\b1\.8\s*l\b/gi, "1800ml");
  s = s.replace(/一升/g, "1800ml");
  s = s.replace(/\b(送料無料|ポイント|最安|限定|公式|正規品)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function loosenQueryForStageB(q: string): string {
  if (!q) return "";
  let s = q;
  s = s.replace(/\b(化粧箱|箱入り|箱付|ギフト箱|飲み比べ|セット)\b/g, " ");
  s = s.replace(/\b(720ml|1800ml|300ml|500ml|900ml|1l|1L)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ---- ステージ --------------------------------------------------
export function buildYahooParamsStages(inputQuery: string, base: YahooBaseParams): YahooBuilt[] {
  const genre = base.genre_category_id || DEFAULT_GENRE_SAKE;
  const normA = normalizeQuery(inputQuery);
  const normB = loosenQueryForStageB(normA);

  const common: Record<string, string | number | boolean> = {
    appid: base.appid,
    genre_category_id: genre,
    in_stock: base.in_stock ?? true,
    results: base.results ?? 20,
    start: base.start ?? 1,
    image_size: base.image_size ?? 300,
  };

  const priceParams = (p: YahooBaseParams) => {
    const out: Record<string, string | number | boolean> = {};
    if (p.price_from != null) out["price_from"] = p.price_from;
    if (p.price_to != null) out["price_to"] = p.price_to;
    if (p.affiliate_type) out["affiliate_type"] = p.affiliate_type;
    if (p.affiliate_id) out["affiliate_id"] = p.affiliate_id!;
    return out;
  };

  return [
    {
      stage: "A",
      params: { ...common, sort: base.sort ?? "-score", query: normA, ...priceParams(base) },
      queryForView: normA,
    },
    {
      stage: "B",
      params: { ...common, sort: "+price", query: normB, ...priceParams(base) },
      queryForView: normB,
    },
    {
      stage: "C",
      params: { ...common, sort: "+price", query: "", ...priceParams(base) }, // or "日本酒"
      queryForView: "",
    },
  ];
}

export const YAHOO_ENDPOINT_V3 = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";
export const YAHOO_ENDPOINT_V1 = "https://shopping.yahooapis.jp/ShoppingWebService/V1/json/itemSearch";
