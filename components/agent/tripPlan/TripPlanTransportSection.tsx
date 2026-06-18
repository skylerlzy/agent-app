"use client";

import type { TripPlanTransportSegment } from "@/lib/agent/tripPlan/types";
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
                  <p className="text-sm font-bold text-foreground">
                    {seg.origin}
                    <span className="mx-1.5 font-normal text-muted-foreground">→</span>
                    {seg.destination}
                  </p>
                  {(seg.distanceKm != null || seg.durationMinutes != null) && (
                    <p className="mt-0.5 text-xs tabular-nums text-primary/90">
                      {seg.distanceKm != null ? `${seg.distanceKm} km` : null}
                      {seg.distanceKm != null && seg.durationMinutes != null ? " · " : null}
                      {seg.durationMinutes != null ? `约 ${seg.durationMinutes} 分钟` : null}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{seg.recommendation}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  if (fallbackText?.trim()) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{fallbackText}</p>;
  }

  return <p className="text-sm text-muted-foreground">暂无交通耗时数据。</p>;
}
