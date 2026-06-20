"use client";

import type { TripPlanRailOption, TripPlanTransportSegment } from "@/lib/agent/tripPlan/types";
import { cn } from "@/lib/utils";
import { Bus, Car, Footprints, Plane, Train } from "lucide-react";

function modeIcon(mode?: string, category?: string) {
  if (category === "intercity") return Train;
  if (mode === "walking") return Footprints;
  if (mode === "transit") return Bus;
  if (mode === "driving") return Car;
  if (mode === "rail") return Train;
  if (mode === "flight") return Plane;
  return Bus;
}

function modeLabel(mode?: string, category?: string) {
  if (category === "intercity") return "跨城";
  if (mode === "walking") return "步行";
  if (mode === "transit") return "公交";
  if (mode === "driving") return "驾车";
  return "接驳";
}

function tagClass(tag?: TripPlanRailOption["tag"]) {
  switch (tag) {
    case "最快":
      return "bg-violet-100 text-violet-800 border-violet-200/80";
    case "推荐":
      return "bg-emerald-100 text-emerald-800 border-emerald-200/80";
    case "经济":
      return "bg-amber-100 text-amber-900 border-amber-200/80";
    default:
      return "bg-muted text-muted-foreground border-border/60";
  }
}

function RailOptionCard({ option }: { option: TripPlanRailOption }) {
  const price =
    option.priceSecond && option.priceSecond !== "-"
      ? `二等 ¥${option.priceSecond}`
      : option.priceFirst && option.priceFirst !== "-"
        ? `一等 ¥${option.priceFirst}`
        : null;

  return (
    <div className="rounded-lg border border-border/50 bg-background/75 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {option.tag ? (
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-sm font-semibold",
              tagClass(option.tag)
            )}
          >
            {option.tag}
          </span>
        ) : null}
        <span className="text-lg font-bold tabular-nums text-foreground sm:text-xl">
          {option.trainNo}
          {option.trainType ? (
            <span className="ml-1 text-base font-medium text-muted-foreground">{option.trainType}</span>
          ) : null}
        </span>
        <span className="text-base tabular-nums text-primary/90">{option.duration}</span>
      </div>
      <p className="mt-2 text-base leading-relaxed text-foreground/90 sm:text-[17px]">
        <span className="font-medium tabular-nums">{option.departureTime}</span>
        <span className="mx-1 text-muted-foreground">·</span>
        {option.departStation}
        <span className="mx-1.5 text-muted-foreground">→</span>
        <span className="font-medium tabular-nums">{option.arrivalTime}</span>
        <span className="mx-1 text-muted-foreground">·</span>
        {option.arriveStation}
      </p>
      {(price || option.seatsAvailable) && (
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
          {[price, option.seatsAvailable?.split("；")[0]].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function TripPlanTransportSection({
  segments,
  fallbackText,
}: {
  segments?: TripPlanTransportSegment[];
  fallbackText?: string;
}) {
  if (segments && segments.length > 0) {
    return (
      <ul className="space-y-3">
        {segments.map((seg, i) => {
          const Icon = modeIcon(seg.mode, seg.category);
          const label = modeLabel(seg.mode, seg.category);
          return (
            <li
              key={`${seg.origin}-${seg.destination}-${i}`}
              className={cn(
                "rounded-xl border px-3 py-3",
                seg.category === "intercity"
                  ? "border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 to-violet-50/40"
                  : "border-emerald-200/50 bg-gradient-to-r from-emerald-50/70 to-teal-50/30"
              )}
            >
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-background/80 shadow-sm">
                  <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">{label}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-foreground sm:text-xl">
                    {seg.origin}
                    <span className="mx-1.5 font-normal text-muted-foreground">→</span>
                    {seg.destination}
                  </p>
                  {(seg.queryDateIso || seg.totalTrains != null || seg.durationMinutes != null) && (
                    <p className="mt-1 text-base tabular-nums text-primary/90">
                      {seg.queryDateIso ? `${seg.queryDateIso} 出行` : null}
                      {seg.queryDateIso && seg.totalTrains != null ? " · " : null}
                      {seg.totalTrains != null ? `共 ${seg.totalTrains} 趟可选` : null}
                      {seg.durationMinutes != null
                        ? `${seg.queryDateIso || seg.totalTrains != null ? " · " : ""}推荐约 ${seg.durationMinutes} 分钟`
                        : null}
                    </p>
                  )}
                  {seg.railOptions && seg.railOptions.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {seg.railOptions.map((opt) => (
                        <RailOptionCard key={`${opt.trainNo}-${opt.tag}`} option={opt} />
                      ))}
                      <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                        购票、改签请以 12306 为准；到站后地铁或网约车接驳至酒店。
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                      {seg.recommendation}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  if (fallbackText?.trim()) {
    return <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">{fallbackText}</p>;
  }

  return <p className="text-base text-muted-foreground">暂无交通耗时数据。</p>;
}
