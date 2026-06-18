"use client";

import type { TripPlanFoodRecommendation } from "@/lib/agent/tripPlan/types";
import { cn } from "@/lib/utils";
import { UtensilsCrossed } from "lucide-react";

const FOOD_EMOJI = ["🍜", "🥟", "🦐", "🍲", "🥘", "🍢", "🥗", "🍚"];

function foodEmoji(name: string, index: number): string {
  let hash = index;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return FOOD_EMOJI[hash % FOOD_EMOJI.length];
}

function foodGradient(name: string): string {
  const palettes = [
    "from-amber-200/90 via-orange-100 to-rose-100",
    "from-emerald-200/80 via-teal-100 to-cyan-100",
    "from-violet-200/80 via-fuchsia-100 to-pink-100",
    "from-sky-200/80 via-blue-100 to-indigo-100",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return palettes[hash % palettes.length];
}

export function FoodRecommendationCard({
  item,
  index = 0,
  className,
}: {
  item: TripPlanFoodRecommendation;
  index?: number;
  className?: string;
}) {
  const emoji = foodEmoji(item.name, index);

  return (
    <article className={cn("overflow-hidden rounded-2xl border border-border/55 bg-card/90 shadow-sm", className)}>
      <div
        className={cn(
          "relative flex h-28 items-center justify-center bg-gradient-to-br",
          foodGradient(item.name)
        )}
      >
        <span className="text-5xl drop-shadow-sm" role="img" aria-hidden>
          {emoji}
        </span>
        <div className="absolute bottom-2 right-2 rounded-full bg-background/75 p-1.5 shadow-sm">
          <UtensilsCrossed className="h-3.5 w-3.5 text-amber-700" />
        </div>
      </div>
      <div className="space-y-1 p-3">
        <h4 className="text-sm font-bold text-foreground">{item.name}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
      </div>
    </article>
  );
}
