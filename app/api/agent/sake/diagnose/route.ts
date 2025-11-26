
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: "queryパラメータが必要です" },
        { status: 400 }
      );
    }

    console.log("🔍 User Query:", query);

    // -------------------------------------------------------
    // 1️⃣ Intent Extraction（意図抽出：ギフト or 自分用？）
    // -------------------------------------------------------
    const intentPrompt = `
あなたは日本酒専門のアシスタントです。
以下のユーザー発話が「ギフト目的」か「自分用の日本酒探し」かを分類してください。

ユーザー発話：
"${query}"

出力形式は必ず JSON のみ：
{
  "intent": "gift" または "self",
  "reason": "〜〜だから"
}
`;

    const intentRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: intentPrompt }],
      response_format: { type: "json_object" },
    });

    const intentData = JSON.parse(intentRes.choices[0].message.content || "{}");

    const isGiftMode = intentData.intent === "gift";

    console.log("🎁 Gift mode detected:", isGiftMode);

    // -------------------------------------------------------
    // 2️⃣ Query Embedding 生成
    // -------------------------------------------------------
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    // -------------------------------------------------------
    // 3️⃣ RAG検索（Supabase RPC）
    // -------------------------------------------------------
    const { data: ragResults, error: ragError } = await supabase.rpc(
      "match_sake_embeddings",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
        match_threshold: 0.50,
      }
    );

    if (ragError) {
      console.error("RAG検索エラー:", ragError);
      return NextResponse.json(
        { error: "RAG検索に失敗しました", details: ragError },
        { status: 500 }
      );
    }

    console.log("📚 RAG Results:", ragResults);

    // -------------------------------------------------------
    // 4️⃣ 最終回答生成（ギフトモード考慮）
    // -------------------------------------------------------
    const finalPrompt = `
あなたは日本酒ソムリエAIです。
ユーザーの要望に沿って、日本酒を丁寧に提案してください。

🔹ギフトモード: ${isGiftMode}
${isGiftMode ? "ユーザーは贈り物用途を意図しています。" : "ユーザーは自分用に日本酒を探しています。"}

🔹検索でヒットした日本酒（重要）：
${JSON.stringify(ragResults, null, 2)}

上記を踏まえて、以下の形式で回答してください。

【回答形式】
1. 最適な日本酒の提案（3〜5本）
2. それぞれの特徴（香り・味・印象）
3. ギフトモードの場合は「贈り物としてのポイント」も必ず説明
4. 最後に一言アドバイス

丁寧で読みやすい日本語で。
`;

    const finalRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: finalPrompt }],
    });

    const aiMessage = finalRes.choices[0].message.content;

    // -------------------------------------------------------
    // 5️⃣ Supabase にログ保存（ai_sake_logs）
    // -------------------------------------------------------
    const { error: logError } = await supabase.from("ai_sake_logs").insert({
      user_query: query,
      intent: intentData.intent,
      reason: intentData.reason,
      is_gift_mode: isGiftMode,
      rag_results: ragResults,
      ai_message: aiMessage,
    });

    if (logError) {
      console.error("ログ保存エラー:", logError);
    }

    // -------------------------------------------------------
    // 6️⃣ 最終レスポンス
    // -------------------------------------------------------
    return NextResponse.json({
      mode: isGiftMode ? "gift" : "self",
      intent_reason: intentData.reason,
      recommendations: ragResults,
      message: aiMessage,
    });
  } catch (err) {
    console.error("❌ APIエラー:", err);
    return NextResponse.json(
      { error: "内部エラーが発生しました", details: String(err) },
      { status: 500 }
    );
  }
}



