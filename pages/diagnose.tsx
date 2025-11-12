import { useState, useRef, useEffect } from "react";
import Image from "next/image";

type Message = {
  role: "user" | "assistant";
  content: string;
  recommendations?: Array<{
    brand: string;
    product: string;
    reason: string;
  }>;
};

export default function DiagnosePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初回の挨拶
  useEffect(() => {
    const greeting = getGreeting();
    setMessages([
      {
        role: "assistant",
        content: `${greeting}🍶 日本酒ソムリエAIです。\nどんな日本酒をお探しですか？\n\n例：「フルーティーで華やかな香りの日本酒が飲みたい」「辛口で飲みやすい日本酒を探しています」など、お気軽にお聞かせください。`,
      },
    ]);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "おはようございます。";
    if (hour < 18) return "こんにちは。";
    return "こんばんは。";
  };

  // Markdownの太字記法（**text**）をHTMLに変換
  const formatMessage = (text: string) => {
    return text
      .split(/(\*\*.*?\*\*)/g)
      .map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={idx}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    // ユーザーメッセージを追加
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const response = await fetch("/api/sake/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "エラーが発生しました");
      }

      // AIのメッセージを生成（新しいAPIレスポンス形式に対応）
      const assistantContent = data.message || "該当する日本酒が見つかりませんでした。別のキーワードでお試しください。";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantContent,
          recommendations: data.results || [],
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `申し訳ございません。エラーが発生しました。もう一度お試しください。`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen relative overflow-hidden">
      {/* 背景画像 */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 scale-90">
          <Image
            src="/images/toji-sake-chat-background.jpg"
            alt="背景"
            fill
            className="object-cover object-center"
            priority
          />
        </div>
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* コンテンツ */}
      <div className="relative z-10 flex flex-col h-full">
        {/* ヘッダー */}
        <header className="border-b border-slate-700/50 bg-slate-900/60 backdrop-blur-sm px-4 py-3">
          <h1 className="text-xl font-semibold text-slate-100">🍶 日本酒ソムリエAI</h1>
          <p className="text-xs text-slate-400 mt-1">あなたの好みに合わせた日本酒をご提案します</p>
        </header>

        {/* メッセージエリア */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-slate-500/50 bg-slate-800/80">
                <Image
                  src="/images/toji-icon.png"
                  alt="日本酒ソムリエ"
                  width={40}
                  height={40}
                  className="object-cover"
                />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600/90 text-white backdrop-blur-sm"
                  : "bg-slate-800/80 text-slate-100 border border-slate-600/50 backdrop-blur-sm"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="text-xs font-medium text-slate-300 mb-2 pb-2 border-b border-slate-600/50">
                  日本酒ソムリエ
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {formatMessage(msg.content)}
              </div>
            </div>
            {msg.role === "user" && <div className="flex-shrink-0 w-10" />}
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3 justify-start">
            <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-slate-500/50 bg-slate-800/80">
              <Image
                src="/images/toji-icon.png"
                alt="日本酒ソムリエ"
                width={40}
                height={40}
                className="object-cover"
              />
            </div>
            <div className="bg-slate-800/80 text-slate-100 border border-slate-600/50 backdrop-blur-sm rounded-lg px-4 py-3">
              <div className="text-xs font-medium text-slate-300 mb-2 pb-2 border-b border-slate-600/50">
                日本酒ソムリエ
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <span>考え中</span>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <form onSubmit={handleSubmit} className="border-t border-slate-700/50 bg-slate-900/60 backdrop-blur-sm px-4 py-4">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例：フルーティーで華やかな香りの日本酒が飲みたい"
              className="flex-1 px-4 py-3 bg-slate-800/70 border border-slate-600/50 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-6 py-3 bg-blue-600/90 hover:bg-blue-700/90 disabled:bg-slate-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors backdrop-blur-sm"
            >
              送信
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
