import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能出行与日程协调 Agent",
  description: "迭代二任务一 — Plan-and-Execute + ReAct + Reflexion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
