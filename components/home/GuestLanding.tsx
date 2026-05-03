"use client";

import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    title: "智能动态规划",
    body: "由大模型生成多阶段行程与规划论证，外层编排随执行反馈持续修订，避免写死流程。",
  },
  {
    title: "真实世界数据",
    body: "接入天气、路径估算等真实 HTTP 能力，在推理中按需调用，服务可落地的出行决策。",
  },
  {
    title: "遇错自修正",
    body: "工具失败与异常进入自反思链路，支持改参重试、跳过或中止，计划可降级续跑。",
  },
  {
    title: "推理全链路可视",
    body: "从会话对齐到规划、ReAct、修正与完成，事件按序呈现，便于复核与演示。",
  },
] as const;

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
      className="fixed right-0 top-0 z-[100] flex justify-end px-5 py-4 sm:px-9 sm:py-5"
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

export function GuestLanding() {
  return (
    <div className="relative min-h-dvh w-full">
      <AuthCorner />

      <main className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-6 pb-14 pt-16 sm:px-10 sm:pb-20 sm:pt-20 md:px-12">
        {/* 上中：Logo + 站名 */}
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center text-center",
            "pb-10 pt-6 sm:pb-14 sm:pt-4 md:min-h-0 md:flex-[1.15] md:pb-16 md:pt-2"
          )}
        >
          <div
            className={cn(
              "mb-8 flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/[0.07] text-primary shadow-sm",
              "motion-safe:animate-logo-breathe motion-reduce:animate-none",
              "sm:h-[5.25rem] sm:w-[5.25rem]"
            )}
            aria-hidden
          >
            <Plane
              className="h-9 w-9 motion-safe:animate-plane-sway motion-reduce:animate-none sm:h-10 sm:w-10"
              strokeWidth={1.35}
            />
          </div>

          <h1 className="font-display text-[clamp(2.75rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[0.02em] text-foreground">
            VoyageMind
          </h1>
          <p className="mt-5 max-w-xl text-pretty font-sans text-sm font-normal leading-relaxed tracking-[0.2em] text-muted-foreground sm:text-[15px] sm:tracking-[0.28em]">
            您的私人出行助手
          </p>
        </div>

        {/* 下半：四枚等宽长形卡 */}
        <div className="mx-auto w-full max-w-[1120px] shrink-0">
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
            {FEATURES.map((item, index) => (
              <li
                key={item.title}
                className={cn(
                  "motion-safe:animate-card-enter motion-reduce:animate-none",
                  index === 1 && "motion-safe:delay-100",
                  index === 2 && "motion-safe:delay-[180ms]",
                  index === 3 && "motion-safe:delay-[260ms]"
                )}
              >
                <article
                  className={cn(
                    "group flex h-full min-h-[132px] flex-col justify-center rounded-lg border border-border/80 bg-card/50 px-6 py-7 text-center shadow-sm",
                    "transition-[transform,box-shadow,border-color,background-color] duration-300 ease-soft",
                    "motion-safe:hover:-translate-y-1 motion-safe:hover:border-primary/35 motion-safe:hover:bg-card/80 motion-safe:hover:shadow-md motion-safe:hover:shadow-primary/10",
                    "xl:min-h-[140px] xl:px-7 xl:py-8"
                  )}
                >
                  <h2 className="text-[15px] font-semibold tracking-wide text-foreground">{item.title}</h2>
                  <p className="mt-3 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
