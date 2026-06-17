"use client";

import type { ReasoningEvent } from "@/lib/agent/contracts";
import { cn } from "@/lib/utils";
import { Bot, CircleStop, GitBranch, MapPin, User } from "lucide-react";
import { useId } from "react";

type StageId = "idle" | "session" | "plan" | "react" | "reflex" | "done";

function inferStage(events: ReasoningEvent[]): StageId {
  if (events.length === 0) return "idle";
  const last = events[events.length - 1];
  if (last.type === "run_done" || last.type === "run_error") return "done";
  if (last.type === "reflexion" || last.type === "tool_error") return "reflex";
  if (
    last.type === "react_thought" ||
    last.type === "tool_call" ||
    last.type === "tool_result" ||
    last.type === "step_done"
  ) {
    return "react";
  }
  if (last.type === "plan_draft" || last.type === "plan_final") return "plan";
  if (last.type === "session_start") return "session";
  return "idle";
}

type ReactRing = "think" | "action" | "observe";

function inferReactRing(events: ReasoningEvent[]): ReactRing {
  if (inferStage(events) !== "react") return "think";
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "plan_final" || e.type === "plan_draft") break;
    if (e.type === "tool_call") return "action";
    if (e.type === "tool_result" || e.type === "tool_error") return "observe";
    if (e.type === "react_thought") return "think";
  }
  return "think";
}

export interface ReasoningPipelineProps {
  events: ReasoningEvent[];
  isRunning: boolean;
  className?: string;
}

export function ReasoningPipeline({ events, isRunning, className }: ReasoningPipelineProps) {
  const uid = useId().replace(/:/g, "");
  const current = inferStage(events);
  const reactRing = inferReactRing(events);
  const effectiveStage = isRunning && events.length === 0 ? "idle" : current;

  const userOn = effectiveStage === "session";
  const llmOn =
    effectiveStage === "plan" ||
    effectiveStage === "react" ||
    effectiveStage === "reflex" ||
    (isRunning && events.length === 0);
  const envOn = effectiveStage === "react";
  const stopOn = effectiveStage === "done";

  const actionGlow = envOn && reactRing === "action";
  const feedbackGlow = envOn && reactRing === "observe";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-voyage-sky/20 voyage-surface-wash p-4 shadow-md shadow-voyage-sky/8 ring-1 ring-primary/8 sm:p-5",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          backgroundImage: `radial-gradient(circle at 22% 30%, hsl(var(--primary) / 0.14), transparent 48%),
            radial-gradient(circle at 78% 35%, hsl(var(--voyage-sky) / 0.12), transparent 45%),
            radial-gradient(circle at 55% 85%, hsl(var(--voyage-amber) / 0.08), transparent 40%)`,
        }}
      />
      <p className="relative mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        工作台 · 自治 Agent 环
      </p>
      <p className="relative mb-4 text-center text-[11px] text-muted-foreground">
        人类目标 ↔ LLM 决策 ↔ 环境（工具）闭环；高亮表示当前所处环节
      </p>

      {/* 与 viewBox 360×220 同宽高比，避免 SVG meet 留白导致连线与绝对定位节点错位 */}
      <div
        className="relative mx-auto max-w-full"
        style={{
          height: "min(17rem, 52vw)",
          width: "min(100%, calc(min(17rem, 52vw) * 360 / 220))",
        }}
      >
        <svg
          viewBox="0 0 360 220"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <marker id={`${uid}-ah`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="hsl(168 32% 42% / 0.75)" />
            </marker>
          </defs>

          {/* LLM ↔ 环境：行动弧（上） */}
          <path
            d="M 198 78 C 240 40, 290 40, 308 88"
            fill="none"
            strokeWidth="3"
            className={cn(
              "text-border/80 transition-all duration-500",
              actionGlow && "text-primary stroke-[3.2] drop-shadow-[0_0_10px_hsl(168_32%_42%/0.35)]"
            )}
            stroke="currentColor"
            markerEnd={`url(#${uid}-ah)`}
          />
          {/* 反馈弧（下） */}
          <path
            d="M 308 112 C 290 155, 235 158, 198 118"
            fill="none"
            strokeWidth="3"
            className={cn(
              "text-border/80 transition-all duration-500",
              feedbackGlow && "text-primary stroke-[3.2] drop-shadow-[0_0_10px_hsl(168_32%_42%/0.35)]"
            )}
            stroke="currentColor"
            markerEnd={`url(#${uid}-ah)`}
          />

          <text x="218" y="58" className="fill-muted-foreground text-[10px] font-medium">
            行动
          </text>
          <text x="218" y="168" className="fill-muted-foreground text-[10px] font-medium">
            反馈
          </text>
        </svg>

        {/* 用户 ↔ LLM：用 CSS 与节点同一坐标系，避免 SVG letterboxing 与 HTML 脱节 */}
        <div
          className={cn(
            "pointer-events-none absolute z-[1] h-0 border-t-2 border-dashed border-border transition-colors motion-safe:transition-colors",
            userOn && "border-primary/55"
          )}
          style={{
            top: "calc(36% + 2.375rem - 1px)",
            left: "calc(4% + 4.5rem + 6px)",
            right: "calc(50% + 2.375rem + 6px)",
          }}
          aria-hidden
        />

        {/* 左侧：用户 */}
        <div
          className={cn(
            "absolute left-[4%] top-[36%] z-10 flex w-[4.5rem] flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-all duration-500",
            userOn ? "border-voyage-sky/45 bg-gradient-to-br from-voyage-sky/15 to-voyage-sky/5 text-voyage-sky shadow-sm shadow-voyage-sky/15" : "border-border/60 bg-background/60 text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "inline-flex",
              userOn && "motion-safe:animate-node-breathe motion-reduce:animate-none"
            )}
          >
            <User className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <span className="text-[9px] font-semibold">用户</span>
        </div>

        {/* 中心：LLM */}
        <div
          className={cn(
            "absolute left-1/2 top-[36%] z-10 flex h-[4.75rem] w-[4.75rem] -translate-x-1/2 flex-col items-center justify-center rounded-full border-2 transition-all duration-500",
            llmOn && effectiveStage !== "done"
              ? "border-primary/50 bg-gradient-to-br from-primary/18 to-voyage-teal/12 text-primary shadow-lg shadow-primary/20"
              : "border-border/70 bg-card/90 text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "inline-flex",
              llmOn &&
                effectiveStage !== "done" &&
                "motion-safe:animate-node-breathe motion-reduce:animate-none"
            )}
          >
            <Bot className="h-7 w-7" strokeWidth={1.5} />
          </span>
          <span className="mt-0.5 text-[9px] font-bold tracking-tight">LLM</span>
        </div>

        {/* 右侧：环境 / 工具 */}
        <div
          className={cn(
            "absolute right-[4%] top-[36%] z-10 flex w-[4.5rem] flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-all duration-500",
            envOn ? "border-voyage-amber/45 bg-gradient-to-br from-voyage-amber/15 to-voyage-coral/8 text-voyage-amber shadow-sm shadow-voyage-amber/15" : "border-border/60 bg-background/60 text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "inline-flex",
              envOn && "motion-safe:animate-node-breathe motion-reduce:animate-none"
            )}
          >
            <MapPin className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <span className="text-[9px] font-semibold">环境</span>
        </div>

        {/* 底部：停止 / 完成 */}
        <div
          className={cn(
            "absolute bottom-[4%] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-all duration-500",
            stopOn ? "border-violet-400/50 bg-violet-50/90 text-violet-900 shadow-sm" : "border-border/50 bg-muted/30 text-muted-foreground"
          )}
        >
          <CircleStop className="h-4 w-4" strokeWidth={1.6} />
          <span className="text-[10px] font-semibold">停止</span>
        </div>

        {/* ReAct 环状态角标 */}
        {effectiveStage === "react" ? (
          <div className="absolute bottom-[22%] right-[8%] z-10 flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-50/90 px-2 py-0.5 text-[10px] font-medium text-teal-900">
            <GitBranch className="h-3 w-3" />
            {reactRing === "action" ? "工具执行" : reactRing === "observe" ? "结果回传" : "推理中"}
          </div>
        ) : null}
      </div>

      <p className="relative mt-2 text-center text-[11px] text-muted-foreground">
        当前阶段：
        <span className="font-semibold text-foreground">
          {effectiveStage === "idle" && (isRunning ? "启动…" : "就绪")}
          {effectiveStage === "session" && "会话对齐"}
          {effectiveStage === "plan" && "规划"}
          {effectiveStage === "react" && "ReAct 执行环"}
          {effectiveStage === "reflex" && "Reflexion 修正"}
          {effectiveStage === "done" && "已完成"}
        </span>
      </p>
    </div>
  );
}
