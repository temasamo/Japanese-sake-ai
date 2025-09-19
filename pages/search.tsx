// pages/search.tsx
import { useState } from "react";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<any>(null);
  const run = async (keyword: string) => {
    const r = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
    setData(await r.json());
  };

  return (
    <main className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-2">日本酒検索（MVP）</h1>
      <div className="flex gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border px-2 py-1 flex-1"
          placeholder="例：獺祭 39"
        />
        <button onClick={() => run(q)} className="border px-3">検索</button>
        <button onClick={() => run("獺祭 39")} className="border px-3">テスト</button>
      </div>

      {data && (
        <>
          <div className="text-sm mb-2">
            件数: {data.total}（フィルタ後 {data.afterFilter} / noFilter {String(data.noFilter)}）
          </div>
          <ul className="grid gap-3">
            {data.items?.map((it: any) => (
              <li key={it.id} className="border p-3 rounded">
                <div className="font-medium">{it.title}</div>
                {it.image && <img src={it.image} alt={it.title} className="w-32 my-2" />}
                <div className="text-sm">{it.shop ?? "-"}</div>
                <div className="text-sm">{it.price ? `¥${it.price.toLocaleString()}` : "-"}</div>
                <a
                  className="text-blue-600 underline"
                  href={`/api/out?url=${encodeURIComponent(it.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  購入へ
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
