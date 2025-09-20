import type { NextApiRequest, NextApiResponse } from "next";

const RAKUTEN_BASE = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

type Item = { 
  id: string; 
  title: string; 
  price: number | null; 
  image: string | null; 
  shop: string | null; 
  source: "rakuten";
  url: string 
};

type Cache = { at: number; items: Item[] };
let cache: Cache | null = null;

type RakutenImage = { imageUrl: string };
type RakutenItem = {
  itemCode: string;
  itemName: string;
  itemPrice?: number;
  itemUrl: string;
  shopName?: string;
  mediumImageUrls?: RakutenImage[];
  smallImageUrls?: RakutenImage[];
  reviewCount?: number;
  reviewAverage?: number;
};
type RakutenResponse = {
  Items?: { Item: RakutenItem }[];
  count?: number;
  error?: string;
  error_description?: string;
};

function wrapMoshimo(u: string) {
  const a = process.env.MOSHIMO_A_ID!;
  const p = process.env.MOSHIMO_P_ID!;
  const pc = process.env.MOSHIMO_PC_ID!;
  const pl = process.env.MOSHIMO_PL_ID!;
  return `https://af.moshimo.com/af/c/click?a_id=${a}&p_id=${p}&pc_id=${pc}&pl_id=${pl}&url=${encodeURIComponent(u)}`;
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  // 10分キャッシュ
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) {
    return res.status(200).json({ items: cache.items, cached: true });
  }

  const appId = process.env.RAKUTEN_APP_ID!;
  const kws = ["純米大吟醸", "純米吟醸", "日本酒 人気"];
  const all: Array<Item & { _pop: number }> = [];

  for (const kw of kws) {
    const url = `${RAKUTEN_BASE}?applicationId=${appId}&keyword=${encodeURIComponent(kw)}&hits=30&imageFlag=1`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "japanese-sake-ai" } });
      if (!r.ok) continue;
      const data = (await r.json()) as RakutenResponse;
      const items = (data?.Items ?? []).map((x) => x.Item).map((it) => ({
        id: String(it.itemCode),
        title: it.itemName ?? "",
        price: typeof it.itemPrice === "number" ? it.itemPrice : null,
        image: it.mediumImageUrls?.[0]?.imageUrl ?? it.smallImageUrls?.[0]?.imageUrl ?? null,
        shop: it.shopName ?? null,
        source: "rakuten" as const,
        url: wrapMoshimo(it.itemUrl),
        // 疑似人気スコア：レビュー数×平均（無ければ0）
        _pop: (Number(it.reviewCount) || 0) * (Number(it.reviewAverage) || 0),
      })) as Array<Item & { _pop: number }>;
      all.push(...items);
    } catch (e) {
      console.error(`Failed to fetch for keyword: ${kw}`, e);
      continue;
    }
  }

  // 画像/タイトル必須で、疑似人気スコア降順→重複ID除去
  const uniq = new Map<string, Item & { _pop: number }>();
  for (const it of all) {
    if (!it.title || !it.image) continue;
    if (!uniq.has(it.id) || (uniq.get(it.id)!)._pop < it._pop) {
      uniq.set(it.id, it);
    }
  }
  const top5 = [...uniq.values()]
    .sort((a, b) => b._pop - a._pop)
    .slice(0, 5)
    .map(({ _pop: _, ...rest }) => rest);

  cache = { at: Date.now(), items: top5 };
  res.status(200).json({ items: top5, cached: false });
}
