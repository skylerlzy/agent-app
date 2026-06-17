import type { LandingFeatureId } from "@/lib/landingContent";
import { cn } from "@/lib/utils";
import {
  Brain,
  Database,
  MapPin,
  MessageSquare,
  Sparkles,
  Wrench,
} from "lucide-react";

import type { FC, ReactNode } from "react";

function MockChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-xl shadow-primary/10 ring-1 ring-primary/10">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-2 truncate text-[10px] font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

function ChatPlanMock() {
  return (
    <MockChrome title="VoyageMind · 对话工作台">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/80 p-2.5">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/15 px-3 py-2 text-[11px] leading-relaxed text-foreground">
              帮我规划南京一日游，想去中山陵和夫子庙
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-border/60 bg-card px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              已生成 Day1 行程：上午中山陵 → 下午总统府 → 晚间夫子庙…
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-primary/35 bg-primary/[0.04] px-2 py-1.5 text-[10px] text-primary">
            <Sparkles className="h-3 w-3" />
            运行模式：full_plan_execute
          </div>
        </div>
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5">
          <p className="mb-2 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
            全程出行方案
          </p>
          <div className="space-y-1.5 text-[10px] text-muted-foreground">
            <p className="font-medium text-foreground">## 行程总览</p>
            <p>南京经典文化一日游 · 节奏 balanced</p>
            <p className="font-medium text-foreground">## 日程建议（按天）</p>
            <p>Day1 08:30 中山陵 → 14:00 总统府 → 18:30 夫子庙</p>
          </div>
        </div>
      </div>
    </MockChrome>
  );
}

function ReasoningTraceMock() {
  return (
    <MockChrome title="推理轨迹">
      <div className="space-y-2">
        {[
          { t: "19:03:24", label: "run_mode", value: "quick_reply · LLM 语义路由" },
          { t: "19:03:26", label: "knowledge_retrieved", value: "混合检索 · 南京出行指南 ×2" },
          { t: "19:03:28", label: "tool_call", value: "weather_forecast · 南京" },
        ].map((row) => (
          <div
            key={row.label}
            className="flex gap-2 rounded-lg border border-border/50 bg-background/70 px-2.5 py-2"
          >
            <span className="shrink-0 font-mono text-[9px] text-sky-700/80 dark:text-sky-300">{row.t}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-foreground">{row.label}</p>
              <p className="truncate text-[10px] text-muted-foreground">{row.value}</p>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/[0.07] px-2.5 py-2 text-[10px] text-teal-900 dark:text-teal-100">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          事件按序回放，支持查看与调试
        </div>
      </div>
    </MockChrome>
  );
}

function RagKnowledgeMock() {
  return (
    <MockChrome title="知识库 · 检索预览">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="h-8 flex-1 rounded-md border border-border/60 bg-background/80 px-2 text-[10px] leading-8 text-muted-foreground">
            南京晚上适合去哪
          </div>
          <div className="rounded-md bg-sky-600 px-2.5 text-[10px] leading-8 text-white">检索</div>
        </div>
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-2.5">
          <p className="text-[10px] font-semibold text-foreground">南京出行指南 · 章节「Evening」</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            老门东、夫子庙秦淮河畔适合夜间散步；注意安全与人流量…
          </p>
          <p className="mt-1.5 text-[9px] text-sky-700 dark:text-sky-300">
            [来源: 南京出行指南 · 章节「Evening」] · score 4.2
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Database className="h-3.5 w-3.5 text-primary" />
          内置 55 城 + 用户上传文档
        </div>
      </div>
    </MockChrome>
  );
}

function SkillsToolsMock() {
  return (
    <MockChrome title="Skill & 工具">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-amber-900 dark:text-amber-100">
            <Sparkles className="h-3.5 w-3.5" />
            附加 Skill
          </p>
          <div className="space-y-1.5">
            <div className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] text-primary">
              ✓ couple-romantic-travel
            </div>
            <div className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
              family-slow-travel
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/70 p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
            <Wrench className="h-3.5 w-3.5" />
            启用工具
          </p>
          <div className="flex flex-wrap gap-1">
            {["weather", "maps", "poi", "rail"].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-800 dark:text-emerald-200"
              >
                <MapPin className="h-2.5 w-2.5" />
                {t}
              </span>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1 text-[9px] text-muted-foreground">
            <Brain className="h-3 w-3" />
            长期记忆可跨对话共享
          </p>
        </div>
      </div>
    </MockChrome>
  );
}

const MOCK_MAP: Record<LandingFeatureId, FC> = {
  "chat-plan": ChatPlanMock,
  "reasoning-trace": ReasoningTraceMock,
  "rag-knowledge": RagKnowledgeMock,
  "skills-tools": SkillsToolsMock,
};

export function FeatureScreenshotMock({
  featureId,
  className,
}: {
  featureId: LandingFeatureId;
  className?: string;
}) {
  const Mock = MOCK_MAP[featureId];
  return (
    <div className={cn("motion-safe:animate-fade-in", className)}>
      <Mock />
    </div>
  );
}
