"use client";

import type { TripPlanPlace, TripPlanThemeHighlight } from "@/lib/agent/tripPlan/types";
import { SECTION_GRADIENT_ACCENTS } from "@/lib/voyageTheme";
import { cn } from "@/lib/utils";
import { Compass, Heart, MapPin, Sparkles, Waves } from "lucide-react";

const THEME_ICONS = [Heart, Waves, Compass, Sparkles, MapPin];

function pickThemeIcon(title: string, index: number) {
  if (/海|滨|浪|沙滩|情侣/.test(title)) return Waves;
  if (/浪漫|情/.test(title)) return Heart;
  if (/自然|生态|山|林/.test(title)) return Compass;
  return THEME_ICONS[index % THEME_ICONS.length];
}

export function TripPlanThemesSection({
  themeHighlights,
  themesAndPlaces,
  topPlaces,
  destination,
}: {
  themeHighlights?: TripPlanThemeHighlight[];
  themesAndPlaces: string[];
  topPlaces?: TripPlanPlace[];
  destination?: string;
}) {
  const highlights =
    themeHighlights && themeHighlights.length > 0
      ? themeHighlights
      : themesAndPlaces.map((title) => ({
          title,
          description: `在${destination || "当地"}围绕「${title}」安排深度体验，结合下方日程与地图灵活调整节奏。`,
          places: topPlaces?.slice(0, 3).map((p) => p.name),
          highlights: undefined as string[] | undefined,
        }));

  if (highlights.length === 0) return null;

  return (
    <div className="space-y-3">
      {highlights.map((theme, i) => {
        const accent = SECTION_GRADIENT_ACCENTS[i % SECTION_GRADIENT_ACCENTS.length];
        const Icon = pickThemeIcon(theme.title, i);
        const places = theme.places?.length ? theme.places : [];

        return (
          <article
            key={`${theme.title}-${i}`}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-border/50 bg-card/95 p-4 shadow-sm transition hover:shadow-md",
              accent.card
            )}
          >
            <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-90", accent.stripe)} />
            <div className="flex gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/80 shadow-sm",
                  accent.title
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className={cn("text-lg font-bold tracking-tight sm:text-xl", accent.title)}>{theme.title}</h4>
                <p className="mt-2 text-base leading-relaxed text-foreground/88 sm:text-[17px] sm:leading-7">{theme.description}</p>
                {theme.highlights && theme.highlights.length > 0 ? (
                  <ul className="mt-2.5 space-y-2">
                    {theme.highlights.map((h) => (
                      <li
                        key={h}
                        className="rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2 text-base leading-relaxed text-foreground/90"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {places.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(places)].map((place) => (
                      <span
                        key={place}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        <MapPin className="h-2.5 w-2.5" />
                        {place}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
