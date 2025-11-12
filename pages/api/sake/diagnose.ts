import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// --- 型定義 ---
type Sake = {
  id: string;
  brand_name: string;
  product_name: string;
  type: string;
  region: string;
  region_tag: string;
  flavor_notes: any;
  taste_score: number;
  aroma_score: number;
  similarity: number;
};

// --- ヘルパー：ギフトモード判定 ---
function detectGiftMode(query: string): boolean {
  const giftKeywords = [
    "プレゼント",
    "贈り物",
    "ギフト",
    "父",
    "母",
    "上司",
    "友達",
    "誕生日",
    "お祝い",
    "贈る",
  ];
  return giftKeywords.some((kw) => query.includes(kw));
}

// --- ヘルパー：RAG検索 ---
async function searchSakeEmbeddings(
  queryEmbedding: number[],
  matchThreshold = 0.4,
  matchCount = 5,
  regionTag = "base"
) {
  const { data, error } = await supabase.rpc("match_sake_embeddings", {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
    region_tag_input: regionTag,
  });

  if (error) {
    console.error("Supabase RPC error:", error);
    return [];
  }

  return (data || []) as Sake[];
}

// --- APIハンドラー ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query, region_tag = "base", match_threshold = 0.4 } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    // 🧠 ギフトモード自動判定
    const isGiftMode = detectGiftMode(query);

    // 🧩 Embedding生成
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const [{ embedding }] = embeddingResponse.data;

    // 🔍 類似日本酒検索
    const results = await searchSakeEmbeddings(embedding, match_threshold, 5, region_tag);

    if (!results.length) {
      return res.status(200).json({
        mode: isGiftMode ? "gift" : "normal",
        message: "該当する日本酒が見つかりませんでした。別のキーワードでお試しください。",
        results: [],
      });
    }

    // 🧠 GPTで自然言語整形
    const sakeListText = results
      .map(
        (s, i) =>
          `${i + 1}. ${s.brand_name} ${s.product_name}（${s.region}）\n・${
            s.flavor_notes?.aroma ||
            s.flavor_notes?.palate ||
            s.flavor_notes?.finish ||
            s.flavor_notes?.impression ||
            "特徴情報なし"
          }`
      )
      .join("\n\n");

    const systemPrompt = isGiftMode
      ? `あなたは日本酒ソムリエAIです。ユーザーが「贈り物」や「プレゼント」に最適な日本酒を探しています。以下の検索結果から、贈る相手に喜ばれるような理由を添えて自然に提案してください。`
      : `あなたは日本酒ソムリエAIです。ユーザーが自分に合う日本酒を探しています。以下の検索結果から、香りや味わいの特徴を踏まえて自然に提案してください。`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `ユーザーの入力: ${query}\n検索結果:\n${sakeListText}` },
      ],
      temperature: 0.7,
    });

    const aiMessage = completion.choices[0].message?.content?.trim() ?? "提案を生成できませんでした。";

    res.status(200).json({
      mode: isGiftMode ? "gift" : "normal",
      message: aiMessage,
      results,
    });
  } catch (error: any) {
    console.error("❌ Error in sake diagnose:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
