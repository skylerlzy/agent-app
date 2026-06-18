"use client";

import type { TripPlanSkillMoment } from "@/lib/agent/tripPlan/types";
import { SECTION_GRADIENT_ACCENTS } from "@/lib/voyageTheme";
import { cn } from "@/lib/utils";
import { Heart, Sparkles } from "lucide-react";

export function TripPlanSkillMomentsSection({
  moments,
  sectionTitle = "专属体验高光",
}: {
  moments?: TripPlanSkillMoment[];
  sectionTitle?: string;
}) {
  if (!moments?.length) return null;

  const accent = SECTION_GRADIENT_ACCENTS[0];
  const Icon = /情侣|浪漫/.test(sectionTitle) ? Heart : Sparkles;

  return (
    <div className="space-y-3">
      {moments.map((moment, i) => (
        <article
          key={`${moment.dayLabel}-${i}`}
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border/50 bg-card/95 p-4 shadow-sm",
            accent.card
          )}
        >
          <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90", accent.stripe)} />
          <div className="flex gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/80",
                accent.title
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{moment.dayLabel}</p>
              <h4 className={cn("mt-0.5 text-base font-bold", accent.title)}>{moment.title}</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/88">{moment.description}</p>
              {moment.tips && moment.tips.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {moment.tips.map((tip) => (
                    <li key={tip}>· {tip}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
