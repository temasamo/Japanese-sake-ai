import { NextApiRequest, NextApiResponse } from "next";

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type PreferenceData = {
  taste_score: number;
  aroma_score: number;
  temperature_preference?: "cold" | "warm" | "room";
  price_range?: "low" | "mid" | "high";
  context_tag?: "meal" | "reward" | "gift" | "study";
  mode?: "self" | "gift" | "travel" | "media";
};

type ResultResponse = {
  type: "result";
  message: string;
  data: PreferenceData;
};

type FollowupResponse = {
  type: "followup";
  message: string;
  data: null;
};

type APIResponse = ResultResponse | FollowupResponse;

type OpenAIResponse = {
  choices: Array<{
    message: {
      content: string | null;
      function_call?: {
        name: string;
        arguments: string;
      };
    };
    finish_reason: string;
  }>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIResponse | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  try {
    // システムプロンプトを設定
    const systemPrompt = `あなたは日本酒ソムリエAIです。🍶
ユーザーとの会話を通じて、日本酒の嗜好を理解してください。
フレンドリーで親しみやすいトーンで会話し、ユーザーの好みを自然に引き出してください。
曖昧な回答（「どっちでも」「わからない」など）の場合は、具体的な質問をして情報を集めてください。`;

    const openaiMessages: ChatCompletionMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Function callingの定義
    const functions = [
      {
        name: "extract_preferences",
        description: "ユーザーの嗜好をJSON形式にまとめる",
        parameters: {
          type: "object",
          properties: {
            taste_score: {
              type: "number",
              description: "甘口度合い（0=辛口、1=甘口）",
              minimum: 0,
              maximum: 1,
            },
            aroma_score: {
              type: "number",
              description: "香りの強さ（0=控えめ、1=フルーティー/華やか）",
              minimum: 0,
              maximum: 1,
            },
            temperature_preference: {
              type: "string",
              enum: ["cold", "warm", "room"],
              description: "温度の好み（cold=冷や、warm=燗、room=常温）",
            },
            price_range: {
              type: "string",
              enum: ["low", "mid", "high"],
              description: "価格帯（low=〜3000円、mid=3000〜8000円、high=8000円〜）",
            },
            context_tag: {
              type: "string",
              enum: ["meal", "reward", "gift", "study"],
              description: "飲むシーン（meal=食事、reward=ご褒美、gift=贈り物、study=勉強/趣味）",
            },
            mode: {
              type: "string",
              enum: ["self", "gift", "travel", "media"],
              description: "用途（self=自分用、gift=贈り物、travel=旅行、media=メディア/情報収集）",
            },
          },
          required: ["taste_score", "aroma_score"],
        },
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        functions: functions,
        function_call: { name: "extract_preferences" },
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI API error:", errorData);
      return res.status(500).json({ error: "OpenAI API request failed" });
    }

    const data: OpenAIResponse = await response.json();
    const choice = data.choices[0];

    if (!choice) {
      return res.status(500).json({ error: "No response from OpenAI" });
    }

    const message = choice.message;

    // Function callが発火した場合（JSON確定）
    if (message.function_call && message.function_call.name === "extract_preferences") {
      try {
        const functionArgs = JSON.parse(message.function_call.arguments) as PreferenceData;

        // 必須フィールドの検証
        if (
          typeof functionArgs.taste_score !== "number" ||
          typeof functionArgs.aroma_score !== "number"
        ) {
          throw new Error("Required fields missing");
        }

        // 値の範囲チェック
        if (
          functionArgs.taste_score < 0 ||
          functionArgs.taste_score > 1 ||
          functionArgs.aroma_score < 0 ||
          functionArgs.aroma_score > 1
        ) {
          throw new Error("Invalid score range");
        }

        const result: ResultResponse = {
          type: "result",
          message: "嗜好データを抽出しました。",
          data: functionArgs,
        };

        return res.status(200).json(result);
      } catch (parseError) {
        console.error("Function call parsing error:", parseError);
        // パースエラー時はフォローアップとして扱う
        const followup: FollowupResponse = {
          type: "followup",
          message: "もう少し詳しく教えてください。甘口と辛口、どちらの日本酒を飲むことが多いですか？",
          data: null,
        };
        return res.status(200).json(followup);
      }
    }

    // Function callが発火しなかった場合（曖昧回答・再質問）
    const aiMessage = message.content || "もう少し詳しく教えてください。";
    const followup: FollowupResponse = {
      type: "followup",
      message: aiMessage,
      data: null,
    };

    return res.status(200).json(followup);
  } catch (error) {
    console.error("Chat diagnose API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

