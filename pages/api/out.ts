// pages/api/out.ts
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_HOSTS = new Set([
  "af.moshimo.com",
  "hb.afl.rakuten.co.jp",
  "search.rakuten.co.jp",
  "shopping.yahoo.co.jp",
  "ck.jp.ap.valuecommerce.com",
  "www.amazon.co.jp",
  "amzn.to",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const raw = String(req.query.url || "");
    if (!raw) return res.status(400).json({ error: "url is required" });

    const u = new URL(raw);
    if (!ALLOWED_HOSTS.has(u.host)) {
      return res.status(400).json({ error: "host_not_allowed", host: u.host });
    }

    const dry = String(req.query.dry || "") === "1";
    if (dry) return res.status(200).json({ finalUrl: u.toString() });

    res.setHeader("Location", u.toString());
    return res.status(302).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "out_failed" });
  }
}
