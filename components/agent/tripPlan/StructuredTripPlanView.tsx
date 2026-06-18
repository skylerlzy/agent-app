"use client";

import { FoodRecommendationCard } from "@/components/agent/tripPlan/FoodRecommendationCard";
import { TripPlanMap } from "@/components/agent/tripPlan/TripPlanMap";
import { TripPlanSkillMomentsSection } from "@/components/agent/tripPlan/TripPlanSkillMomentsSection";
import { TripPlanThemesSection } from "@/components/agent/tripPlan/TripPlanThemesSection";
import { TripPlanTransportSection } from "@/components/agent/tripPlan/TripPlanTransportSection";
import { TripPlanTimeline } from "@/components/agent/tripPlan/TripPlanTimeline";
import { TripPlanWeatherSection } from "@/components/agent/tripPlan/TripPlanWeatherSection";
import { stripPlaceholderText } from "@/lib/agent/tripPlan/displayText";
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
      <h3 className={cn("mb-2.5 flex items-center gap-2 text-base font-bold", accent.title)}>
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
  const foodSummary = stripPlaceholderText(plan.foodAndBudget);
  const foodItems =
    plan.foodRecommendations?.filter((f) => f.name && f.description) ??
    (plan.localCuisine?.length
      ? plan.localCuisine.map((c) => {
          const cleaned = c.replace(/^🍜\s*/, "").trim();
          const m = cleaned.match(/^(.+?)（(.+)）$/);
          return m
            ? { name: m[1].trim(), description: m[2].trim() }
            : { name: cleaned.slice(0, 24), description: cleaned };
        })
      : []);

  return (
    <div className={cn("space-y-4 text-[15px] leading-relaxed", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 via-voyage-sky/10 to-voyage-amber/8 p-5 shadow-md">
        {isUpdating ? (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            更新中
          </div>
        ) : null}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/80">全程出行方案</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{route}</h2>
        {dateLabel ? <p className="mt-1 text-base text-muted-foreground">{dateLabel}</p> : null}
        <p className="mt-3 text-base leading-relaxed text-foreground/90">{plan.overview}</p>
        {plan.citations && plan.citations.length > 0 ? (
          <div className="mt-3 rounded-lg border border-violet-500/15 bg-violet-500/5 px-2.5 py-2 text-xs text-violet-900">
            {plan.citations.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        ) : null}
      </div>

      <SectionCard title="天气与着装" icon={<CloudSun className="h-4 w-4" />} accentIndex={1}>
        <TripPlanWeatherSection
          dailyWeather={plan.dailyWeather}
          weatherAdvice={plan.weatherAdvice ?? plan.weatherTips}
          weatherAdviceItems={plan.weatherAdviceItems}
          legacyText={plan.weatherTips}
        />
      </SectionCard>

      <SectionCard title="交通与耗时" icon={<Navigation className="h-4 w-4" />} accentIndex={2}>
        <TripPlanTransportSection
          segments={plan.transportSegments}
          fallbackText={plan.transport}
        />
      </SectionCard>

      {(plan.themeHighlights?.length ?? plan.themesAndPlaces.length) > 0 ? (
        <SectionCard title="主题与推荐景点" icon={<Sparkles className="h-4 w-4" />} accentIndex={0}>
          <TripPlanThemesSection
            themeHighlights={plan.themeHighlights}
            themesAndPlaces={plan.themesAndPlaces}
            topPlaces={places}
            destination={plan.meta.destination}
          />
        </SectionCard>
      ) : null}

      {plan.skillMoments && plan.skillMoments.length > 0 ? (
        <SectionCard
          title={
            plan.skillMoments[0]?.title.includes("情侣") || plan.skillMoments[0]?.title.includes("浪漫")
              ? "情侣浪漫时刻"
              : "专属体验高光"
          }
          icon={<Sparkles className="h-4 w-4" />}
          accentIndex={0}
        >
          <TripPlanSkillMomentsSection moments={plan.skillMoments} />
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
                      "flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-base transition",
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
            <p className="mb-4 text-sm text-muted-foreground">
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
              <div className="flex h-full min-h-[14rem] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                暂无坐标数据。请确认已配置高德 JS API Key，并重新生成含路线工具的行程。
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="饮食与预算" icon={<Utensils className="h-4 w-4" />} accentIndex={5}>
        {foodSummary ? (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">{foodSummary}</p>
        ) : null}
        {foodItems.length > 0 ? (
          <div className={cn("grid gap-3 sm:grid-cols-2", foodSummary ? "mt-4" : "")}>
            {foodItems.map((item, index) => (
              <FoodRecommendationCard key={`${item.name}-${index}`} item={item} index={index} />
            ))}
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            正在加载美食推荐…若仍为空请重新生成行程（系统会为每个目的地提供默认可选餐厅）。
          </p>
        )}
      </SectionCard>

      {plan.packingChecklist && plan.packingChecklist.length > 0 ? (
        <SectionCard title="行李清单" icon={<Backpack className="h-4 w-4" />} accentIndex={2}>
          <ul className="list-disc space-y-1 pl-5 text-base text-foreground/90">
            {plan.packingChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
