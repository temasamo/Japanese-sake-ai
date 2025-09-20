import { useEffect, useState } from "react";
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
type ApiResponseOrError = ApiResponse & Partial<ApiError> | ApiError;

export default function SearchPage() {
  const [q, setQ] = useState<string>("");
  const [mode, setMode] = useState<"normal" | "gift">("normal");
  const [data, setData] = useState<ApiResponseOrError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const run = async (keyword: string) => {
    if (!keyword.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(keyword)}&mode=${mode}`);
      const json: ApiResponseOrError = await r.json();
      setData(json);
    } catch (e: any) {
      setData({ error: "client_fetch_failed", message: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!q.trim()) { setData(null); return; }
    const id = setTimeout(() => run(q), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") run(q);
  };

  const asApi = (d: ApiResponseOrError | null): d is ApiResponse =>
    !!d && "items" in d && Array.isArray((d as any).items);

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-3">日本酒検索（MVP）</h1>

      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          className="border px-2 py-1 flex-1"
          placeholder="例：獺祭 39 / 純米大吟醸"
        />
        <button onClick={() => run(q)} className="border px-3">検索</button>
        <button onClick={() => { setQ("獺祭 39"); run("獺祭 39"); }} className="border px-3">テスト</button>
        <button
          onClick={() => setMode(m => m === "normal" ? "gift" : "normal")}
          className="border px-3"
          title="ギフト向け（飲み比べ・セット許可）に切替"
        >
          {mode === "gift" ? "🎁 ギフト中" : "通常モード"}
        </button>
      </div>

      {loading && <div className="text-sm text-gray-600 mb-2">検索中…</div>}

      {data && "error" in data && (
        <pre className="bg-red-50 border text-red-700 p-3 rounded text-xs overflow-auto mb-3">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      {asApi(data) && (
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
                  <a className="inline-block text-blue-600 underline" href={`/api/out?url=${encodeURIComponent(it.url)}`} target="_blank" rel="noopener noreferrer">
                    購入へ
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!loading && (!data || (asApi(data) && data.items.length === 0)) && (
        <div className="text-sm text-gray-600 mt-6">
          キーワードを入力すると自動で検索します。0件のときは条件を少し緩めてみてください。
        </div>
      )}
    </main>
  );
}


