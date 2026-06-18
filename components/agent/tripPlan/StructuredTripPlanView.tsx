"use client";

import { TripPlanMap } from "@/components/agent/tripPlan/TripPlanMap";
import { TripPlanTimeline } from "@/components/agent/tripPlan/TripPlanTimeline";
import { MapProvider } from "@/contexts/MapProvider";
import type { ReasoningEvent } from "@/lib/agent/contracts";
import type { TripPlanDocument, TripPlanPlace } from "@/lib/agent/tripPlan/types";
import { SECTION_GRADIENT_ACCENTS } from "@/lib/voyageTheme";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import {
  CloudSun,
  Loader2,
  MapPinned,
  Navigation,
  Sparkles,
  Utensils,
  Backpack,
  Info,
} from "lucide-react";
import { useMemo, useState } from "react";

function SectionCard({
  title,
  icon,
  accentIndex,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accentIndex: number;
  children: React.ReactNode;
}) {
  const accent = SECTION_GRADIENT_ACCENTS[accentIndex % SECTION_GRADIENT_ACCENTS.length];
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/55 bg-card/90 p-4 shadow-sm transition-shadow",
        accent.card
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90", accent.stripe)} />
      <h3 className={cn("mb-2.5 flex items-center gap-2 text-sm font-bold", accent.title)}>
        <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg bg-background/70", accent.title)}>
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </article>
  );
}

export function StructuredTripPlanView({
  plan,
  isUpdating,
  events = [],
  className,
}: {
  plan: TripPlanDocument | null;
  isUpdating?: boolean;
  events?: ReasoningEvent[];
  className?: string;
}) {
  const [selectedPlace, setSelectedPlace] = useState<TripPlanPlace | null>(null);

  const thoughts = useMemo(
    () =>
      events
        .filter((e): e is Extract<ReasoningEvent, { type: "react_thought" }> => e.type === "react_thought")
        .map((e) => e.payload.thought?.trim() ?? "")
        .filter((t) => t.length > 0 && !/^正在分析/.test(t)),
    [events]
  );

  if (!plan && !isUpdating) {
    return (
      <GlassCard className={cn("cursor-default border-dashed border-voyage-teal/30 p-6", className)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <MapPinned className="h-10 w-10 text-voyage-teal/60" />
          <p className="text-sm font-semibold text-foreground">全程出行方案</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            确认出行信息并开始规划后，结构化行程、时间轴与地图将固定显示在此，不会因简单追问而刷新。
          </p>
        </div>
      </GlassCard>
    );
  }

  if (!plan && isUpdating) {
    return (
      <GlassCard className={cn("flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在生成结构化行程方案…</p>
        {thoughts.length > 0 ? (
          <p className="max-w-sm text-center text-xs text-muted-foreground">{thoughts[thoughts.length - 1]}</p>
        ) : null}
      </GlassCard>
    );
  }

  if (!plan) return null;

  const route =
    plan.meta.routeLabel ||
    (plan.meta.origin && plan.meta.destination
      ? `${plan.meta.origin} → ${plan.meta.destination}`
      : plan.meta.destination || "本次出行");

  const dateLabel =
    plan.meta.tripStart && plan.meta.tripEnd
      ? plan.meta.tripStart === plan.meta.tripEnd
        ? plan.meta.tripStart
        : `${plan.meta.tripStart} ～ ${plan.meta.tripEnd}`
      : "";

  const places = plan.topPlacesToVisit ?? [];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 via-voyage-sky/10 to-voyage-amber/8 p-5 shadow-md">
        {isUpdating ? (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            更新中
          </div>
        ) : null}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/80">全程出行方案</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">{route}</h2>
        {dateLabel ? <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p> : null}
        <p className="mt-3 text-sm leading-relaxed text-foreground/90">{plan.overview}</p>
      </div>

      <SectionCard title="天气与着装" icon={<CloudSun className="h-4 w-4" />} accentIndex={1}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{plan.weatherTips}</p>
      </SectionCard>

      <SectionCard title="交通与耗时" icon={<Navigation className="h-4 w-4" />} accentIndex={2}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{plan.transport}</p>
      </SectionCard>

      {plan.themesAndPlaces.length > 0 ? (
        <SectionCard title="主题与推荐景点" icon={<Sparkles className="h-4 w-4" />} accentIndex={0}>
          <ul className="space-y-1.5 text-sm text-foreground/90">
            {plan.themesAndPlaces.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="日程安排" icon={<MapPinned className="h-4 w-4" />} accentIndex={3}>
        <TripPlanTimeline itinerary={plan.itinerary} />
      </SectionCard>

      {plan ? (
        <SectionCard title="热门景点地图" icon={<MapPinned className="h-4 w-4" />} accentIndex={4}>
          {places.length > 0 ? (
            <ol className="mb-4 space-y-2">
              {places.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedPlace(p)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                      selectedPlace?.name === p.name
                        ? "border-primary/35 bg-primary/10"
                        : "border-border/50 hover:border-voyage-sky/35 hover:bg-voyage-sky/5"
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="font-medium text-foreground">{p.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mb-4 text-xs text-muted-foreground">
              本轮方案尚未解析到景点坐标；完成含路线/POI 工具的规划后将在此显示列表与地图。
            </p>
          )}

          <div className="h-[min(22rem,42vh)]">
            {places.length > 0 ? (
              <MapProvider>
                <TripPlanMap
                  places={places}
                  selected={selectedPlace?.coordinates ?? null}
                  className="h-full min-h-[14rem] w-full rounded-xl"
                />
              </MapProvider>
            ) : (
              <div className="flex h-full min-h-[14rem] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 text-center text-xs text-muted-foreground">
                暂无坐标数据。请确认已配置高德 JS API Key，并重新生成含路线工具的行程。
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="饮食与预算" icon={<Utensils className="h-4 w-4" />} accentIndex={5}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{plan.foodAndBudget}</p>
        {plan.localCuisine && plan.localCuisine.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {plan.localCuisine.map((c) => (
              <li key={c}>🍜 {c}</li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      {plan.packingChecklist && plan.packingChecklist.length > 0 ? (
        <SectionCard title="行李清单" icon={<Backpack className="h-4 w-4" />} accentIndex={2}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
            {plan.packingChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="提示与免责" icon={<Info className="h-4 w-4" />} accentIndex={1}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{plan.tipsAndDisclaimer}</p>
        {plan.citations && plan.citations.length > 0 ? (
          <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5 text-xs text-violet-900">
            {plan.citations.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
