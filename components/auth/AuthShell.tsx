import type { ReactNode } from "react";
import { FeatureShowcase } from "@/components/home/FeatureShowcase";
import { LandscapeMarquee } from "@/components/home/LandscapeMarquee";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";

export interface AuthShellProps {
  children: ReactNode;
  /** 是否在表单下方展示完整功能介绍 */
  showMarketing?: boolean;
}

/** Clerk 登录/注册页：可滚动长页 + 景观轮播 + 功能介绍 */
export function AuthShell({ children, showMarketing = true }: AuthShellProps) {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden" aria-hidden>
        <div className="absolute -right-16 top-24 h-64 w-64 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute bottom-40 left-0 h-56 w-56 rounded-full bg-emerald-400/12 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-2 text-center">
          <Link href="/" className="text-sm font-medium text-primary transition hover:underline">
            ← 返回 VoyageMind 首页
          </Link>
        </div>

        <LandscapeMarquee className="mb-8" />

        <div className="mx-auto flex w-full max-w-md justify-center">
          <GlassCard className="w-full border-border/40 p-2 shadow-xl transition-all duration-300 ease-soft sm:p-3">
            <div className="animate-fade-in">{children}</div>
          </GlassCard>
        </div>

        {showMarketing ? (
          <FeatureShowcase className="mt-16 sm:mt-20" />
        ) : null}
      </div>
    </div>
  );
}
