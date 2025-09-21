import { useMemo, useState } from "react";
import Link from "next/link";

type Purpose = "gift" | "self";
type Taste = "dry" | "medium" | "sweet";
type Budget = "u3" | "b3_5" | "b5_8" | "b8_12" | "o12";

type Step = 0 | 1 | 2 | 3; // 3=まとめ

const tasteJa: Record<Taste, string> = {
  dry: "辛口",
  medium: "中口",
  sweet: "甘口",
};

const budgetLabel: Record<Budget, string> = {
  u3: "〜¥3,000",
  b3_5: "¥3,000〜¥5,000",
  b5_8: "¥5,000〜¥8,000",
  b8_12: "¥8,000〜¥12,000",
  o12: "¥12,000〜",
};

export default function DiagnosePage() {
  const [step, setStep] = useState<Step>(0);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [taste, setTaste] = useState<Taste | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);

  const mode: "normal" | "gift" = useMemo(
    () => (purpose === "gift" ? "gift" : "normal"),
    [purpose]
  );

  // 検索へ渡す仮のクエリ（後で賢くする）
  const query = useMemo(() => {
    const parts: string[] = [];
    if (taste) parts.push(tasteJa[taste]);
    if (purpose === "gift") parts.push("ギフト");
    // MVP：まずはここを固定ワードでOK（後で学習させる）
    parts.push("純米吟醸");
    return parts.join(" ");
  }, [purpose, taste]);

  const canNext = (s: Step): boolean => {
    if (s === 0) return purpose !== null;
    if (s === 1) return taste !== null;
    if (s === 2) return budget !== null;
    return true;
  };

  const reset = () => {
    setStep(0);
    setPurpose(null);
    setTaste(null);
    setBudget(null);
  };

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">日本酒診断（簡易チャットMVP）</h1>

      {/* ステップ表示 */}
      <div className="text-sm text-gray-600 mb-3">Step {step + 1} / 4</div>

      {/* Q1 */}
      {step === 0 && (
        <section className="mb-6">
          <p className="mb-2 font-medium">Q1. 用途は？</p>
          <div className="flex gap-2 flex-wrap">
            <button
              className={`border px-3 py-2 rounded ${
                purpose === "self" ? "bg-black text-white" : ""
              }`}
              onClick={() => setPurpose("self")}
            >
              自分用
            </button>
            <button
              className={`border px-3 py-2 rounded ${
                purpose === "gift" ? "bg-black text-white" : ""
              }`}
              onClick={() => setPurpose("gift")}
            >
              贈り物（ギフト）
            </button>
          </div>
        </section>
      )}

      {/* Q2 */}
      {step === 1 && (
        <section className="mb-6">
          <p className="mb-2 font-medium">Q2. 味の傾向は？</p>
          <div className="flex gap-2 flex-wrap">
            {(["dry", "medium", "sweet"] as const).map((k) => (
              <button
                key={k}
                className={`border px-3 py-2 rounded ${
                  taste === k ? "bg-black text-white" : ""
                }`}
                onClick={() => setTaste(k)}
              >
                {tasteJa[k]}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Q3 */}
      {step === 2 && (
        <section className="mb-6">
          <p className="mb-2 font-medium">Q3. 予算は？</p>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {(
              ["u3", "b3_5", "b5_8", "b8_12", "o12"] as const
            ).map((k) => (
              <button
                key={k}
                className={`border px-3 py-2 rounded text-left ${
                  budget === k ? "bg-black text-white" : ""
                }`}
                onClick={() => setBudget(k)}
              >
                {budgetLabel[k]}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* まとめ */}
      {step === 3 && (
        <section className="mb-6">
          <p className="mb-2 font-medium">まとめ</p>
          <ul className="text-sm list-disc ml-5 mb-3">
            <li>用途：{purpose === "gift" ? "ギフト" : "自分用"}</li>
            <li>味わい：{taste ? tasteJa[taste] : "-"}</li>
            <li>予算：{budget ? budgetLabel[budget] : "-"}</li>
          </ul>

          {/* いまは UI だけ：/search に渡す */}
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/search?q=${encodeURIComponent(query)}&mode=${mode}`}
              className="border px-4 py-2 rounded bg-black text-white"
            >
              この条件で探す（/searchへ）
            </Link>
            <button className="border px-4 py-2 rounded" onClick={reset}>
              やり直す
            </button>
          </div>

          <p className="text-xs text-gray-600 mt-3">
            ※MVP版：ここでは検索は実行せず、条件を /search に受け渡すだけです。候補5件の自動提示や最安値連動は次のステップで追加します。
          </p>
        </section>
      )}

      {/* ナビゲーション */}
      <div className="mt-6 flex items-center gap-2">
        <button
          className="border px-3 py-1 rounded disabled:opacity-40"
          onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
          disabled={step === 0}
        >
          戻る
        </button>
        <button
          className="border px-3 py-1 rounded disabled:opacity-40"
          onClick={() => setStep((s) => (s < 3 ? ((s + 1) as Step) : s))}
          disabled={!canNext(step) || step === 3}
        >
          次へ
        </button>
      </div>
    </main>
  );
}
