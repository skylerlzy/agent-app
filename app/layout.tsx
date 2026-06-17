import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** 首页品牌大字：拉丁字形优雅，中文回退仍由 sans 承担 */
const fontDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VoyageMind — 您的私人出行助手",
  description: "智能出行规划与推理轨迹 · Convex · Clerk",
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body className="font-sans">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_0%_0%,hsl(168_48%_90%/0.9),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_10%,hsl(175_40%_88%/0.6),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_85%_20%,hsl(199_75%_86%/0.45),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_15%_85%,hsl(38_85%_86%/0.3),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_92%_88%,hsl(262_55%_88%/0.28),transparent_50%)]" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='none' stroke='%23475569' stroke-opacity='0.2'%3E%3Cpath d='M0 40h80M40 0v80'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
            aria-hidden
          />
          <div
            className="absolute inset-0 animate-gradient-flow bg-gradient-to-br from-[hsl(168_38%_95%)] via-[hsl(172_32%_94%)] to-[hsl(199_30%_93%)] bg-[length:200%_200%] opacity-95"
            aria-hidden
          />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
