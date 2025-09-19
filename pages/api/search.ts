// pages/api/search.ts
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });

    const appId = process.env.RAKUTEN_APP_ID;
    if (!appId) return res.status(500).json({ error: "RAKUTEN_APP_ID missing" });

    const url = `${RAKUTEN_BASE}?applicationId=${appId}&keyword=${encodeURIComponent(
      q
    )}&hits=20&imageFlag=1`;

    const r = await fetch(url, { headers: { "User-Agent": "japanese-sake-ai" } });
    const data = (await r.json()) as RakutenResponse;

    const rawItems = Array.isArray(data.Items) ? data.Items : [];
    const items: Item[] = rawItems.map(({ Item: it }) => {
      const rawUrl = it.itemUrl; // affiliateUrl は使わず もしも で統一
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
        url: wrapMoshimo(rawUrl),
      };
    });

    const total = items.length;
    const noFilter = process.env.NO_FILTER === "1";
    const filtered = noFilter ? items : items.filter(passAllRules);
    const result = filtered.length > 0 ? filtered : [fallbackDassai39()];

    console.log({ q, total, afterFilter: filtered.length, noFilter });
    return res
      .status(200)
      .json({ items: result, total, afterFilter: filtered.length, noFilter });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "search_failed" });
  }
}

function passAllRules(it: Item): boolean {
  if (it.price != null && (it.price < 900 || it.price > 50000)) return false;
  const ng = ["セット", "詰め合わせ", "梅酒", "みりん", "焼酎", "ビール"];
  if (ng.some((w) => it.title.includes(w))) return false;
  return true;
}

function fallbackDassai39(): Item {
  return {
    id: "fallback-dassai-39",
    title: "【フォールバック】獺祭 純米大吟醸 39",
    price: null,
    image: null,
    shop: null,
    source: "rakuten",
    url: wrapMoshimo(
      "https://search.rakuten.co.jp/search/mall/%E7%8D%BA%E7%A5%AD+39/"
    ),
  };
}
