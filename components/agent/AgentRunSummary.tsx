"use client";

import type { ReasoningEvent } from "@/lib/agent/contracts";
import { tripPlanFromRunDone } from "@/lib/agent/context/tripPlanMemory";
import { MarkdownTravelBody } from "@/components/agent/MarkdownTravelBody";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { MapPinned, Sparkles } from "lucide-react";
import { useMemo } from "react";

export interface AgentRunSummaryProps {
  /** 优先展示：对话级全程行程 Markdown（不随复述类 quick 回复变化） */
  markdown?: string;
  /** 运行中轨迹（仅用于「正在更新」提示，不覆盖 markdown） */
  events?: ReasoningEvent[];
  isUpdating?: boolean;
  className?: string;
}

/** 将 run_done 中的 Markdown（以 ## 分段）拆成卡片区块 */
function splitMarkdownSections(md: string): { title: string; body: string }[] {
  const normalized = md.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const parts = normalized.split(/\n(?=##+\s)/);
  return parts
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return null;
      const lines = trimmed.split("\n");
      const first = lines[0]?.trim() ?? "";
      const m = first.match(/^##+\s+(.+)$/);
      if (m) {
        return { title: m[1].trim(), body: lines.slice(1).join("\n").trim() };
      }
      return { title: "概要", body: trimmed };
    })
    .filter((x): x is { title: string; body: string } => x != null && (x.title.length > 0 || x.body.length > 0));
}

export function AgentRunSummary({ markdown, events = [], isUpdating, className }: AgentRunSummaryProps) {
  const { summary, thoughts, sections } = useMemo(() => {
    const fromProp = markdown?.trim() ?? "";
    const runDone = [...events].reverse().find((e) => e.type === "run_done");
    let fromEvents = "";
    if (runDone && runDone.type === "run_done") {
      fromEvents = tripPlanFromRunDone(runDone.payload)?.trim() ?? "";
    }

    const summaryText = fromProp || fromEvents;

    const thoughts = events
      .filter((e): e is Extract<ReasoningEvent, { type: "react_thought" }> => e.type === "react_thought")
      .map((e) => e.payload.thought?.trim() ?? "")
      .filter((t) => t.length > 0 && !/^正在分析/.test(t));

    const sections = summaryText.includes("##") ? splitMarkdownSections(summaryText) : [];

    return { summary: summaryText, thoughts, sections };
  }, [markdown, events]);

  if (!summary && thoughts.length === 0 && !isUpdating) {
    return null;
  }

  return (
    <GlassCard
      className={cn(
        "cursor-default overflow-hidden border-primary/10 shadow-lg shadow-primary/[0.06] ring-1 ring-primary/10",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/[0.08] to-transparent" />
      <CardHeader className="relative space-y-2 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-inner">
            <MapPinned className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">全程出行方案</CardTitle>
            <CardDescription className="text-[13px] leading-snug text-muted-foreground">
              {isUpdating
                ? "正在根据您的最新要求更新行程…"
                : "展示本对话的完整行程；复述或简单问答不会改变此面板。"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-6 pt-0">
        {summary ? (
          sections.length > 0 ? (
            <div className="flex flex-col gap-5">
              {sections.map((sec, i) => (
                <article
                  key={`${sec.title}-${i}`}
                  className={cn(
                    "group rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/15 p-5 shadow-md transition-shadow",
                    "hover:border-primary/25 hover:shadow-lg hover:shadow-primary/[0.04]"
                  )}
                >
                  <h3 className="mb-3 flex items-center gap-2 border-b border-border/50 pb-2 text-sm font-bold tracking-wide text-primary">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                    {sec.title}
                  </h3>
                  <MarkdownTravelBody markdown={sec.body || "_（本节无正文）_"} />
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-muted/20 p-6 shadow-inner">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary/80">总结</p>
              <MarkdownTravelBody markdown={summary} />
            </div>
          )
        ) : null}
        {!summary && !isUpdating ? (
          <p className="text-xs text-muted-foreground">
            完成首次规划后，完整多日行程将固定显示在此；景点与日程供参考，铁路以 12306 为准。
          </p>
        ) : null}
        {thoughts.length > 0 && !markdown ? (
          <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">ReAct 思考摘录</p>
            </div>
            <ul className="space-y-3">
              {thoughts.map((t, i) => (
                <li
                  key={i}
                  className="relative rounded-xl border border-border/60 bg-background/80 px-3 py-2.5 pl-4 text-sm leading-relaxed text-foreground/90 before:absolute before:left-0 before:top-2.5 before:h-[calc(100%-1.25rem)] before:w-0.5 before:rounded-full before:bg-primary/45 before:content-['']"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </GlassCard>
  );
}
