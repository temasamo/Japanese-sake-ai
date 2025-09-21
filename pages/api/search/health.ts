import type { NextApiRequest, NextApiResponse } from "next";

const RAKUTEN_BASE = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const env_ok =
    !!process.env.RAKUTEN_APP_ID &&
    !!process.env.MOSHIMO_A_ID &&
    !!process.env.MOSHIMO_P_ID &&
    !!process.env.MOSHIMO_PC_ID &&
    !!process.env.MOSHIMO_PL_ID &&
    !!process.env.YAHOO_APP_ID &&
    !!process.env.YAHOO_VC_SID &&
    !!process.env.YAHOO_VC_PID;

  let rakuten_alive = false;
  try {
    if (process.env.RAKUTEN_APP_ID) {
      const url = `${RAKUTEN_BASE}?applicationId=${process.env.RAKUTEN_APP_ID}&keyword=${encodeURIComponent(
        "獺祭 39"
      )}&hits=1`;
      const r = await fetch(url, { headers: { "User-Agent": "sake-health" } });
      const data = await r.json();
      rakuten_alive = (data?.count ?? 0) > 0 || (data?.Items?.length ?? 0) > 0;
    }
  } catch {}

  let yahoo_alive = false;
  try {
    if (process.env.YAHOO_APP_ID) {
      const appid = process.env.YAHOO_APP_ID;
      const base = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";
      const u = `${base}?appid=${appid}&query=${encodeURIComponent("獺祭 39")}&results=1`;
      const r = await fetch(u, { headers: { "User-Agent": "sake-health" } });
      const j: any = await r.json();
      yahoo_alive = Array.isArray(j?.hits) && j.hits.length > 0;
    }
  } catch {}

  const filters_enabled = process.env.NO_FILTER !== "1";
  res.status(200).json({ env_ok, rakuten_alive, yahoo_alive, filters_enabled });
}
