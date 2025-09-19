import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">日本酒AI</h1>
        <p className="text-lg mb-6">
          楽天APIを使用した日本酒検索システム
        </p>
        <div className="space-y-4">
          <Link 
            href="/search" 
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
          >
            日本酒を検索する
          </Link>
          <div className="text-sm text-gray-600">
            <p>機能:</p>
            <ul className="list-disc list-inside ml-4">
              <li>楽天API経由での日本酒検索</li>
              <li>もしもアフィリエイトでのリンク生成</li>
              <li>価格・商品フィルタリング</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
