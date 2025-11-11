import { NextApiRequest, NextApiResponse } from "next";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, context } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  try {
    // システムプロンプトを設定
    const systemPrompt = `あなたは日本酒の専門家「日本酒ソムリエ」です。
以下の特徴を持っています：
- 丁寧で上品な話し方
- 夜の雰囲気に合った落ち着いたトーン
- 日本酒に関する深い知識
- ユーザーの好みを理解して適切な提案をする

現在の会話コンテキスト：
${context ? JSON.stringify(context, null, 2) : "なし"}

ユーザーとの自然な会話を通じて、最適な日本酒を提案してください。`;

    const openaiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: openaiMessages,
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
    const aiMessage = data.choices[0]?.message?.content;

    if (!aiMessage) {
      return res.status(500).json({ error: "No response from OpenAI" });
    }

    return res.status(200).json({ message: aiMessage });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
