// pages/api/sake/search.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server 側専用
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type SearchRequestBody = {
  query: string;
  region_tag?: string; // 'base' or 'yamagata' など
  match_count?: number; // デフォルト 5
  match_threshold?: number; // ひとまずオプション
};

type SearchResponse = {
  query: string;
  region_tag: string;
  results: unknown[];
};

type ErrorResponse = {
  error: string;
  details?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 環境変数チェック
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error("NEXT_PUBLIC_SUPABASE_URL is not set");
      return res.status(500).json({ error: "Supabase URLが設定されていません" });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set");
      return res.status(500).json({ error: "Supabase Service Role Keyが設定されていません" });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set");
      return res.status(500).json({ error: "OpenAI API Keyが設定されていません" });
    }

    const body = req.body as SearchRequestBody;

    if (!body.query || body.query.trim().length === 0) {
      return res.status(400).json({ error: "query は必須です" });
    }

    const regionTag = body.region_tag ?? "base";
    const matchCount = body.match_count ?? 5;
    const matchThreshold = body.match_threshold ?? 0.75;

    // 1) クエリを embedding に変換
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small", // 1536次元に統一
      input: body.query,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    // 2) Supabase の RPC を叩いて類似銘柄取得
    const { data, error } = await supabase.rpc("match_sake_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      region_tag_input: regionTag,
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return res.status(500).json({ 
        error: "類似検索に失敗しました",
        details: error.message || String(error)
      });
    }

    // data は match_sake_embeddings の戻り値（配列）
    return res.status(200).json({
      query: body.query,
      region_tag: regionTag,
      results: data || [],
    });
  } catch (e) {
    console.error("Unexpected error in /api/sake/search:", e);
    return res.status(500).json({ error: "サーバーエラーが発生しました" });
  }
}

