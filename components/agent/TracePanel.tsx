"use client";

import type { ExecutionPlan, ReasoningEvent } from "@/lib/agent/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

export interface TracePanelProps {
  events: ReasoningEvent[];
  /** 已向 Convex 发起运行、尚未收到事件流时的骨架状态 */
  isAwaitingRun?: boolean;
  /** peek：仅突出当前思考 / 工具 / 决策；可展开查看完整时间轴 */
  variant?: "full" | "peek";
}

function eventAccentClass(type: ReasoningEvent["type"]): string {
  const map: Record<string, string> = {
    session_start: "border-l-sky-500/70 bg-sky-50/90",
    plan_draft: "border-l-amber-500/65 bg-amber-50/95",
    plan_final: "border-l-amber-600/55 bg-amber-50/90",
    react_thought: "border-l-teal-600/55 bg-teal-50/92",
    tool_call: "border-l-orange-500/55 bg-orange-50/92",
    tool_result: "border-l-blue-500/50 bg-blue-50/92",
    tool_error: "border-l-rose-500/60 bg-rose-50/95",
    reflexion: "border-l-violet-500/50 bg-violet-50/92",
    step_done: "border-l-emerald-500/50 bg-emerald-50/90",
    run_done: "border-l-teal-600/50 bg-teal-50/95",
    run_error: "border-l-rose-600/55 bg-rose-50/95",
  };
  return map[type] ?? "border-l-border bg-muted/50";
}

function typeLabel(type: ReasoningEvent["type"]): string {
  const labels: Record<string, string> = {
    session_start: "会话",
    plan_draft: "规划初稿",
    plan_final: "规划定稿",
    react_thought: "ReAct 思考",
    tool_call: "工具调用",
    tool_result: "工具结果",
    tool_error: "工具异常",
    reflexion: "Reflexion",
    step_done: "步骤完成",
    run_done: "运行完成",
    run_error: "运行错误",
  };
  return labels[type] ?? type;
}

function TraceSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="加载轨迹">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

function PlanBody({ plan, variant }: { plan: ExecutionPlan; variant: "draft" | "final" }) {
  return (
    <div className="space-y-3 text-xs sm:text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            variant === "draft"
              ? "bg-amber-100/90 text-amber-900/90"
              : "bg-primary/12 text-primary"
          )}
        >
          {variant === "draft" ? "初稿" : "定稿"}
        </span>
        <span className="text-muted-foreground">planId · {plan.planId}</span>
      </div>

      {plan.plannerRationale ? (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/90">
            规划论证（LLM）
          </p>
          <p className="mt-2 leading-relaxed text-foreground">{plan.plannerRationale}</p>
        </div>
      ) : (
        <p className="text-muted-foreground">
          本回合 JSON 中未包含非空的 <code className="rounded bg-muted px-1 py-0.5 text-foreground">plannerRationale</code>
          （规划论证）。多为模型未严格遵守提示词；不影响计划 phases 的执行，可在提示词中再强调该字段必填。
        </p>
      )}

      <details className="group">
        <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
          展开完整计划 JSON
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
          {JSON.stringify(plan, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function EventBody({ e }: { e: ReasoningEvent }) {
  switch (e.type) {
    case "session_start":
      return (
        <div className="space-y-1 text-xs text-muted-foreground sm:text-sm">
          <p>
            <span className="font-medium text-foreground">目标</span> {e.payload.goal}
          </p>
        </div>
      );
    case "plan_draft":
      return <PlanBody plan={e.payload.plan} variant="draft" />;
    case "plan_final":
      return <PlanBody plan={e.payload.plan} variant="final" />;
    case "react_thought":
      return (
        <div className="space-y-1 text-xs sm:text-sm">
          <p className="leading-relaxed text-foreground">{e.payload.thought}</p>
          <p className="text-muted-foreground">工具：{e.payload.toolName ?? "（无）"}</p>
        </div>
      );
    case "tool_call":
      return (
        <div className="space-y-1 text-xs sm:text-sm">
          <p className="text-muted-foreground">
            步骤 {e.payload.stepId} · {e.payload.toolName}
          </p>
          <pre className="max-h-32 overflow-auto rounded-lg border border-border bg-muted/60 p-2 font-mono text-[11px] text-foreground/90">
            {JSON.stringify(e.payload.args, null, 2)}
          </pre>
        </div>
      );
    case "tool_result":
      return (
        <div className="text-xs sm:text-sm">
          <p className="text-muted-foreground">
            步骤 {e.payload.stepId} · {e.payload.toolName}
          </p>
          <p className="mt-1 leading-relaxed text-foreground">{e.payload.summary}</p>
        </div>
      );
    case "tool_error":
      return (
        <div className="text-xs sm:text-sm">
          <p className="text-muted-foreground">
            步骤 {e.payload.stepId} · {e.payload.toolName}
          </p>
          <p className="mt-1 font-medium text-destructive">{e.payload.error.message}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            code {e.payload.error.code} · retryable: {String(e.payload.error.retryable)}
          </p>
        </div>
      );
    case "reflexion":
      return (
        <div className="space-y-1 text-xs sm:text-sm">
          <p className="text-muted-foreground">步骤 {e.payload.stepId}</p>
          <p className="leading-relaxed text-foreground">{e.payload.diagnosis}</p>
          <p className="text-muted-foreground">
            决策：<span className="font-medium text-violet-800">{e.payload.nextAction}</span>
          </p>
        </div>
      );
    case "step_done":
      return <p className="text-xs text-muted-foreground sm:text-sm">步骤 {e.payload.stepId} 已完成</p>;
    case "run_done":
      return <p className="text-xs leading-relaxed text-primary sm:text-sm">{e.payload.summary}</p>;
    case "run_error":
      return <p className="text-xs font-medium text-destructive sm:text-sm">{e.payload.message}</p>;
    default: {
      const fallback = e as ReasoningEvent;
      const raw = JSON.stringify(fallback.payload ?? {}, null, 2);
      return (
        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
          {raw.length > 400 ? `${raw.slice(0, 400)}…` : raw}
        </pre>
      );
    }
  }
}

function buildPeekEvents(events: ReasoningEvent[]): ReasoningEvent[] {
  let lastThought: ReasoningEvent | undefined;
  let lastCall: ReasoningEvent | undefined;
  let lastResult: ReasoningEvent | undefined;
  let lastReflex: ReasoningEvent | undefined;
  let lastStep: ReasoningEvent | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!lastThought && e.type === "react_thought") lastThought = e;
    if (!lastCall && e.type === "tool_call") lastCall = e;
    if (!lastResult && e.type === "tool_result") lastResult = e;
    if (!lastReflex && e.type === "reflexion") lastReflex = e;
    if (!lastStep && e.type === "step_done") lastStep = e;
  }
  const set = new Map<number, ReasoningEvent>();
  for (const e of [lastThought, lastCall, lastResult, lastReflex, lastStep]) {
    if (e) set.set(e.seq, e);
  }
  return [...set.values()].sort((a, b) => a.seq - b.seq);
}

function TraceEventCards({ events, className }: { events: ReasoningEvent[]; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="log" aria-live="polite">
      {events.map((e) => (
        <Card
          key={e.seq}
          className={cn(
            "border border-border/60 border-l-[3px] bg-background/60 p-3 shadow-sm transition-all duration-300 ease-soft hover:border-border",
            eventAccentClass(e.type)
          )}
        >
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              {typeLabel(e.type)}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">#{e.seq}</span>
            <span className="text-[10px] text-muted-foreground/80">
              {new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false })}
            </span>
          </div>
          <Separator className="mb-2 bg-border/70" />
          <EventBody e={e} />
        </Card>
      ))}
    </div>
  );
}

export function TracePanel({ events, isAwaitingRun = false, variant = "full" }: TracePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const showSkeleton = isAwaitingRun && events.length === 0;

  const peekEvents = useMemo(() => buildPeekEvents(events), [events]);

  if (showSkeleton) {
    return <TraceSkeleton />;
  }

  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
        暂无事件。运行 Agent 后，此处将按时间顺序展示规划、ReAct、工具与 Reflexion 全链路。
      </p>
    );
  }

  if (variant === "peek") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-inner shadow-primary/[0.04]">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            当前焦点
          </p>
          <TraceEventCards events={peekEvents.length ? peekEvents : events.slice(-3)} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              收起完整时间轴
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              展开完整推理时间轴
            </>
          )}
        </Button>
        {expanded ? (
          <div className="max-h-[min(28rem,50vh)] space-y-3 overflow-y-auto rounded-xl border border-border/80 bg-card/70 p-3 sm:max-h-[32rem]">
            <TraceEventCards events={events} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="max-h-[min(32rem,58vh)] space-y-3 overflow-y-auto rounded-xl border border-border/80 bg-card/70 p-3 shadow-inner shadow-primary/[0.04] sm:max-h-[36rem]"
      role="log"
      aria-live="polite"
    >
      <TraceEventCards events={events} />
    </div>
  );
}
