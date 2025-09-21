import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type Cand = { id:string; title:string; price:number|null; image:string|null; shop:string|null; url:string };
  const [cands, setCands] = useState<Cand[] | null>(null);

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

  // 予算レンジ関数を追加
  function budgetRange(b: Budget | null): {min?:number; max?:number} {
    if (!b) return {};
    if (b === "u3") return { max: 3000 };
    if (b === "b3_5") return { min: 3000, max: 5000 };
    if (b === "b5_8") return { min: 5000, max: 8000 };
    if (b === "b8_12") return { min: 8000, max: 12000 };
    return { min: 12000 }; // o12
  }

  // 診断実行（/api/search を呼んで5件に整形）
  async function runDiagnosis() {
    setError(null);
    setCands(null);
    setLoading(true);
    try {
      // mode は用途から決定（ギフト=gift）
      const m = mode; // "normal" | "gift"
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${m}`);
      const j: unknown = await r.json();

      if (!r.ok || !j || typeof j !== "object" || !j || !("items" in j) || !Array.isArray((j as { items: unknown[] }).items)) {
        throw new Error("検索結果を取得できませんでした");
      }

      // 予算フィルタ（API側で未対応の場合に備えてクライアントでも絞る）
      const { min, max } = budgetRange(budget);
      let items: Cand[] = (j as { items: Cand[] }).items;
      if (typeof min === "number" || typeof max === "number") {
        items = items.filter((it: Cand) => {
          if (it.price == null) return false;
          if (typeof min === "number" && it.price < min) return false;
          if (typeof max === "number" && it.price > max) return false;
          return true;
        });
      }

      // 上位5件だけ採用（API内のスコアリング結果をそのまま使う）
      setCands(items.slice(0, 5));
    } catch (e: unknown) {
      setError((e instanceof Error) ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

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
    setCands(null);
    setError(null);
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
              className="border px-4 py-2 rounded"
            >
              この条件で探す（/searchへ）
            </Link>
            <button className="border px-4 py-2 rounded bg-black text-white" onClick={runDiagnosis}>
              この条件で診断（5件表示）
            </button>
            <button className="border px-4 py-2 rounded" onClick={reset}>
              やり直す
            </button>
          </div>

          <p className="text-xs text-gray-600 mt-3">
            ※MVP版：ここでは検索は実行せず、条件を /search に受け渡すだけです。候補5件の自動提示や最安値連動は次のステップで追加します。
          </p>
        </section>
      )}

      {/* 結果表示 */}
      {loading && <div className="mt-4 text-sm text-gray-600">診断中…</div>}
      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      {!loading && cands && (
        <ul className="mt-4 grid gap-3">
          {cands.length === 0 && (
            <li className="text-sm text-gray-600">条件に合う商品が見つかりませんでした。予算やキーワードを少し緩めてみてください。</li>
          )}
          {cands.map((it) => (
            <li key={it.id} className="border p-3 rounded flex gap-3 items-start">
              {it.image ? (
                <Image src={it.image} alt={it.title} width={96} height={96} />
              ) : (
                <div className="w-[96px] h-[96px] bg-gray-100 grid place-items-center text-xs">No Image</div>
              )}
              <div className="flex-1">
                <div className="font-medium mb-1">{it.title}</div>
                <div className="text-sm text-gray-700 mb-1">{it.shop ?? "-"}</div>
                <div className="text-sm mb-2">{it.price != null ? `¥${it.price.toLocaleString()}` : "-"}</div>

                {/* 楽天（もしも）リンク：まずは既存の it.url を /api/out 経由で */}
                <a
                  className="inline-block text-blue-600 underline"
                  href={`/api/out?url=${encodeURIComponent(it.url)}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  購入へ（楽天）
                </a>

                {/* 将来：ここに Yahoo/Amazon の横並びリンクを足す */}
                {/* <div className="text-xs mt-1 text-gray-600">他のモール: Yahoo / Amazon（近日）</div> */}
              </div>
            </li>
          ))}
        </ul>
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
