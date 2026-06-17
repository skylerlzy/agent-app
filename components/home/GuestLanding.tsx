"use client";

import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { FeatureShowcase } from "@/components/home/FeatureShowcase";
import { LandscapeMarquee } from "@/components/home/LandscapeMarquee";
import { cn } from "@/lib/utils";
import { ChevronDown, Plane, Sparkles } from "lucide-react";

function AuthCorner() {
  const { isLoaded } = useUser();

  const shell =
    "flex items-center gap-0.5 rounded-full border border-border/90 bg-background/90 px-1 py-1 shadow-md shadow-primary/10 backdrop-blur-md sm:gap-1 sm:px-1.5 sm:py-1.5";

  const signInClass = cn(
    "rounded-full px-3.5 py-2 text-sm font-medium text-foreground",
    "border border-primary/35 bg-primary/[0.06] shadow-sm",
    "transition-colors duration-200 ease-out hover:border-primary/55 hover:bg-primary/12 hover:text-primary",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  );

  const signUpClass = cn(
    "rounded-full px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm",
    "bg-primary transition-[filter,box-shadow] duration-200 ease-out hover:brightness-[1.06] hover:shadow-md hover:shadow-primary/25",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  );

  return (
    <nav
      className="fixed right-0 top-0 z-[100] flex items-center justify-end px-4 py-4 sm:px-8 sm:py-5"
      aria-label="账户"
    >
      {!isLoaded ? (
        <div className={cn(shell, "min-h-[42px]")} aria-busy="true" aria-label="加载">
          <span className="mx-2 h-4 w-14 animate-pulse rounded-full bg-muted" />
          <span className="mx-1 h-4 w-14 animate-pulse rounded-full bg-primary/20" />
        </div>
      ) : (
        <div className={shell}>
          <SignInButton mode="modal">
            <button type="button" className={signInClass}>
              登录
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button type="button" className={signUpClass}>
              注册
            </button>
          </SignUpButton>
        </div>
      )}
    </nav>
  );
}

function FeaturePeekIntro() {
  return (
    <div className="relative border-t border-border/50 bg-gradient-to-b from-background/40 via-background/85 to-background px-1 pt-5 sm:pt-6">
      <div
        className="pointer-events-none absolute -top-10 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-background/90"
        aria-hidden
      />
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">产品能力</p>
      <h2 className="mt-2 font-display text-[clamp(1.35rem,3vw,2rem)] font-medium text-foreground">
        登录后即可体验的完整能力
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground line-clamp-1 sm:text-sm">
        从对话规划、推理可视到知识库与 Skill，打造可落地的 Agent 工作台
      </p>
      <a
        href="#features"
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
      >
        向下了解更多
        <ChevronDown className="h-3.5 w-3.5 motion-safe:animate-bounce" />
      </a>
    </div>
  );
}

export function GuestLanding() {
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-32 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute right-0 top-[38%] h-80 w-80 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute bottom-[12%] left-[20%] h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      <AuthCorner />

      <main className="mx-auto w-full max-w-[1180px] px-5 pb-24 sm:px-8 sm:pb-32">
        {/* 首屏：Hero + 景观 + 产品能力预览 */}
        <div className="flex min-h-dvh flex-col pt-14 sm:pt-16">
          <section className="flex shrink-0 flex-col items-center pb-3 pt-1 text-center sm:pb-4">
            <div
              className={cn(
                "mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 sm:mb-4 sm:h-16 sm:w-16",
                "bg-gradient-to-br from-primary/15 via-emerald-500/10 to-sky-500/10 text-primary shadow-md shadow-primary/10",
                "motion-safe:animate-logo-breathe motion-reduce:animate-none"
              )}
              aria-hidden
            >
              <Plane
                className="h-7 w-7 motion-safe:animate-plane-sway motion-reduce:animate-none sm:h-8 sm:w-8"
                strokeWidth={1.35}
              />
            </div>

            <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium text-primary sm:px-3 sm:py-1 sm:text-[11px]">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              智能出行自治助手
            </p>

            <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] font-medium leading-[1.08] tracking-[0.02em] text-foreground sm:mt-4">
              <span className="bg-gradient-to-r from-primary via-emerald-600 to-teal-600 bg-clip-text text-transparent">
                VoyageMind
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-xs leading-relaxed tracking-[0.16em] text-muted-foreground sm:text-sm sm:tracking-[0.22em]">
              您的私人出行助手
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 sm:mt-5 sm:gap-3">
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:brightness-105 sm:px-6 sm:py-2.5"
                >
                  免费注册体验
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full border border-primary/35 bg-background/80 px-5 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition hover:border-primary/55 hover:bg-primary/8 sm:px-6 sm:py-2.5"
                >
                  已有账号登录
                </button>
              </SignInButton>
            </div>
          </section>

          <LandscapeMarquee className="shrink-0 py-1 sm:py-2" />

          <div className="mt-auto shrink-0 text-center">
            <FeaturePeekIntro />
          </div>
        </div>

        <div id="features" className="scroll-mt-20">
          <FeatureShowcase hideIntro className="mt-8 sm:mt-10" />
        </div>

        <section className="mt-16 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-emerald-500/8 to-sky-500/8 p-8 text-center shadow-lg shadow-primary/10 sm:mt-24 sm:p-10">
          <h2 className="font-display text-2xl font-medium text-foreground sm:text-3xl">
            准备好规划下一段旅程了吗？
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            登录后即可使用对话规划、推理轨迹、知识库检索与 Skill 定制等完整能力。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md"
              >
                立即注册
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-full border border-border/80 bg-background/90 px-6 py-2.5 text-sm font-medium"
              >
                登录
              </button>
            </SignInButton>
          </div>
        </section>
      </main>
    </div>
  );
}
