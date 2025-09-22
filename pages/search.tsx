import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Item = {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  shop: string | null;
  source: "rakuten";
  url: string;
};
type ApiResponse = {
  items: Item[];
  total: number;
  afterFilter: number;
  noFilter: boolean;
  mode?: "normal" | "gift";
};
type ApiError = { error: string; message?: string; status?: number; body?: string; detail?: unknown };
// union 表現（表示時に型ガードします）
type ApiResponseOrError = ApiResponse | ApiError;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isApiResponse(v: unknown): v is ApiResponse {
  if (!isObject(v)) return false;
  return Array.isArray(v.items);
}
function isApiError(v: unknown): v is ApiError {
  return isObject(v) && "error" in v;
}

export default function SearchPage() {
  const [q, setQ] = useState<string>("");
  const [mode, setMode] = useState<"normal" | "gift">("normal");
  const [data, setData] = useState<ApiResponseOrError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [ranking, setRanking] = useState<Item[] | null>(null);

  const run = async (keyword: string) => {
    if (!keyword.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(keyword)}&mode=${mode}`);
      const json: unknown = await r.json();
      // どちらかに正しく絞って state へ
      if (isApiResponse(json) || isApiError(json)) {
        setData(json);
      } else {
        setData({ error: "unexpected_payload" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setData({ error: "client_fetch_failed", message: msg });
    } finally {
      setLoading(false);
    }
  };

  // ランキングデータを取得
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/ranking");
        const j = await r.json();
        if (Array.isArray(j.items)) setRanking(j.items as Item[]);
      } catch {}
    })();
  }, []);

  // 300ms デバウンス（入力/モード変更で検索）
  useEffect(() => {
    if (!q.trim()) { setData(null); return; }
    const id = setTimeout(() => void run(q), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void run(q);
  };

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-3">日本酒検索（MVP）</h1>

      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          className="border px-2 py-1 flex-1"
          placeholder="例：獺祭 39 / 純米大吟醸"
        />
        <Link href="/diagnose" className="border px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded">診断する</Link>
        <button onClick={() => void run(q)} className="border px-3 py-1 bg-green-50 hover:bg-green-100 rounded">検索</button>
        <button onClick={() => { setQ("獺祭 39"); void run("獺祭 39"); }} className="border px-3 py-1 bg-gray-50 hover:bg-gray-100 rounded">テスト</button>
        <button
          onClick={() => setMode(m => (m === "normal" ? "gift" : "normal"))}
          className="border px-3 py-1 bg-yellow-50 hover:bg-yellow-100 rounded"
          title="ギフト向け（飲み比べ・セット許可）に切替"
        >
          {mode === "gift" ? "🎁 ギフト中" : "通常モード"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
        {/* 左：検索結果 */}
        <div>
          {loading && <div className="text-sm text-gray-600 mb-2">検索中…</div>}

          {isApiError(data) && (
            <pre className="bg-red-50 border text-red-700 p-3 rounded text-xs overflow-auto mb-3">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}

          {isApiResponse(data) && (
            <>
              <div className="text-sm mb-2">
                件数: {data.total}（フィルタ後 {data.afterFilter} / noFilter {String(data.noFilter)} / mode {mode}）
              </div>
              <ul className="grid gap-3">
                {data.items.map((it) => (
                  <li key={it.id} className="border p-3 rounded flex gap-3 items-start">
                    {it.image ? (
                      <Image src={it.image} alt={it.title} width={128} height={128} className="rounded" />
                    ) : (
                      <div className="w-[128px] h-[128px] bg-gray-100 rounded grid place-items-center text-xs text-gray-500">No Image</div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium mb-1">{it.title}</div>
                      <div className="text-sm text-gray-700 mb-1">{it.shop ?? "-"}</div>
                      <div className="text-sm mb-2">{it.price != null ? `¥${it.price.toLocaleString()}` : "-"}</div>
                      <a
                        className="inline-block text-blue-600 underline"
                        href={`/api/out?url=${encodeURIComponent(it.url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        購入へ
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!loading && (!data || (isApiResponse(data) && data.items.length === 0)) && (
            <div className="text-sm text-gray-600 mt-6">
              キーワードを入力すると自動で検索します。0件のときは条件を少し緩めてみてください。
            </div>
          )}
        </div>

        {/* 右：人気TOP5 */}
        <aside className="md:sticky md:top-4 h-fit">
          <div className="font-semibold mb-2">人気TOP5</div>
          {!ranking && <div className="text-sm text-gray-600">読み込み中…</div>}
          {ranking && (
            <ul className="grid gap-3">
              {ranking.map((it) => (
                <li key={it.id} className="border p-3 rounded flex gap-3">
                  {it.image ? (
                    <Image src={it.image} alt={it.title} width={72} height={72} className="rounded" />
                  ) : (
                    <div className="w-[72px] h-[72px] bg-gray-100 rounded grid place-items-center text-xs text-gray-500">No Image</div>
                  )}
                  <div className="text-sm">
                    <div className="font-medium line-clamp-2 mb-1">{it.title}</div>
                    <div className="text-gray-700 mb-1">{it.price != null ? `¥${it.price.toLocaleString()}` : "-"}</div>
                    <a 
                      className="text-blue-600 underline"
                      href={`/api/out?url=${encodeURIComponent(it.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      購入へ
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
