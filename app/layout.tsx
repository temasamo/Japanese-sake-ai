import "../styles/globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "日本酒ソムリエAI",
  description: "日本酒の嗜好ヒアリング用チャット体験",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-900 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
