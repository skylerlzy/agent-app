"use client";

import type { TripPlanDay } from "@/lib/agent/tripPlan/types";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Calendar, Sun, Sunrise, Sunset } from "lucide-react";

function ActivityBlock({
  heading,
  icon,
  items,
  tone,
}: {
  heading: string;
  icon: ReactNode;
  items: TripPlanDay["activities"]["morning"];
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-1.5 text-xs font-semibold", tone)}>
        {icon}
        {heading}
      </div>
      <ul className="space-y-2">
        {items.map((a, i) => (
          <li
            key={`${a.itineraryItem}-${i}`}
            className="rounded-xl border border-border/50 bg-muted/25 px-3 py-2.5 text-sm shadow-sm transition hover:border-primary/25 hover:bg-primary/5"
          >
            <p className="font-semibold text-foreground">{a.itineraryItem}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.briefDescription}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TripPlanTimeline({ itinerary }: { itinerary: TripPlanDay[] }) {
  const filtered = itinerary.filter((day) => {
    const { morning, afternoon, evening } = day.activities;
    return morning.length + afternoon.length + evening.length > 0;
  });

  if (!filtered.length) {
    return <p className="text-sm text-muted-foreground">暂无按日行程安排。</p>;
  }

  return (
    <ol className="relative ml-3 border-s border-emerald-200/80 pl-8">
      {filtered.map((day) => (
        <li key={day.title} className="relative mb-8 last:mb-0">
          <span className="absolute -left-[1.15rem] flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-50 text-emerald-700 shadow-sm ring-4 ring-background">
            <Calendar className="h-3.5 w-3.5" />
          </span>
          <div className="mb-3">
            <h4 className="text-sm font-bold text-emerald-900">{day.title}</h4>
            {day.dateIso ? <p className="text-[11px] text-muted-foreground">{day.dateIso}</p> : null}
          </div>
          <div className="space-y-4">
            <ActivityBlock
              heading="上午"
              icon={<Sunrise className="h-3.5 w-3.5 text-sky-600" />}
              items={day.activities.morning}
              tone="text-sky-800"
            />
            <ActivityBlock
              heading="下午"
              icon={<Sun className="h-3.5 w-3.5 text-amber-600" />}
              items={day.activities.afternoon}
              tone="text-amber-800"
            />
            <ActivityBlock
              heading="晚上"
              icon={<Sunset className="h-3.5 w-3.5 text-violet-600" />}
              items={day.activities.evening}
              tone="text-violet-800"
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
