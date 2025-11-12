import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { query, region_tag = "base", match_threshold = 0.5 } = req.body;

    // 1️⃣ クエリをembedding化
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embeddingRes.data[0].embedding;

    // 2️⃣ Supabase RPC呼び出し
    const { data: matches, error } = await supabase.rpc("match_sake_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold,
      match_count: 5,
      region_tag_input: region_tag,
    });

    if (error) throw error;
    if (!matches || matches.length === 0) {
      return res.status(200).json({
        message: "該当する日本酒が見つかりませんでした。",
        suggestions: [],
      });
    }

    // 3️⃣ GPTで提案文生成
    const prompt = `
あなたは日本酒コンシェルジュです。
ユーザーの希望: 「${query}」
以下の日本酒候補から3〜5本を選び、それぞれに短い説明を付けてください。

候補一覧:
${matches
  .map(
    (m: any, i: number) =>
      `${i + 1}. ${m.brand_name} ${m.product_name}（${m.region}）: ${m.flavor_notes?.impression || ""}`
  )
  .join("\n")}

出力形式（JSON）:
[
  {"brand":"銘柄名","product":"商品名","reason":"理由"}
]
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const responseText = completion.choices[0].message?.content ?? "[]";
    let jsonResult;
    try {
      // JSONコードブロック形式（```json ... ```）からJSONを抽出
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith("```json")) {
        cleanedText = cleanedText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      jsonResult = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Response text:", responseText);
      jsonResult = [{ brand: "データ解析エラー", reason: responseText }];
    }

    // 4️⃣ レスポンス返却
    return res.status(200).json({
      query,
      total_matches: matches.length,
      recommendations: jsonResult,
    });
  } catch (err: any) {
    console.error("❌ Diagnose API Error:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
