import type { TripPlanDay, TripPlanDocument } from "./types";

function activityFingerprint(acts: TripPlanDay["activities"]["morning"]): string {
  return acts.map((a) => `${a.itineraryItem}\u001f${a.briefDescription}`).join("\u001e");
}

/** 优先按 dateIso / title 对齐天数；无法对齐时不合并该天（避免 index 错位） */
function findMatchingDay(
  revisedDays: TripPlanDay[],
  baseDay: TripPlanDay,
  index: number
): TripPlanDay | undefined {
  if (baseDay.dateIso) {
    const byDate = revisedDays.find((d) => d.dateIso === baseDay.dateIso);
    if (byDate) return byDate;
  }
  if (baseDay.title?.trim()) {
    const byTitle = revisedDays.find((d) => d.title === baseDay.title);
    if (byTitle) return byTitle;
  }
  const atIndex = revisedDays[index];
  if (!atIndex) return undefined;
  if (baseDay.dateIso && atIndex.dateIso && atIndex.dateIso !== baseDay.dateIso) {
    return undefined;
  }
  if (
    baseDay.title?.trim() &&
    atIndex.title?.trim() &&
    atIndex.title !== baseDay.title
  ) {
    return undefined;
  }
  return atIndex;
}

/**
 * 以 baseline 为底合并 LLM 修订结果。
 * 对匹配到的每一天，完整采用 LLM 返回的 activities（含空数组）。
 */
export function mergeIncrementalTripPlan(
  baseline: TripPlanDocument,
  revised: TripPlanDocument
): TripPlanDocument {
  if (!revised.itinerary?.length) {
    return baseline;
  }

  const itinerary = baseline.itinerary.map((baseDay, index) => {
    const revDay = findMatchingDay(revised.itinerary, baseDay, index);
    if (!revDay) return baseDay;

    return {
      ...baseDay,
      title: revDay.title?.trim() ? revDay.title : baseDay.title,
      dateIso: revDay.dateIso ?? baseDay.dateIso,
      activities: {
        morning: [...(revDay.activities?.morning ?? [])],
        afternoon: [...(revDay.activities?.afternoon ?? [])],
        evening: [...(revDay.activities?.evening ?? [])],
      },
    };
  });

  return {
    ...baseline,
    overview: revised.overview?.trim() ? revised.overview : baseline.overview,
    foodAndBudget: revised.foodAndBudget?.trim() ? revised.foodAndBudget : baseline.foodAndBudget,
    weatherTips: revised.weatherTips?.trim() ? revised.weatherTips : baseline.weatherTips,
    transport: revised.transport?.trim() ? revised.transport : baseline.transport,
    themesAndPlaces: revised.themesAndPlaces?.length ? revised.themesAndPlaces : baseline.themesAndPlaces,
    themeHighlights: revised.themeHighlights?.length ? revised.themeHighlights : baseline.themeHighlights,
    foodRecommendations: revised.foodRecommendations?.length
      ? revised.foodRecommendations
      : baseline.foodRecommendations,
    topPlacesToVisit: revised.topPlacesToVisit?.length
      ? revised.topPlacesToVisit
      : baseline.topPlacesToVisit,
    itinerary,
    tipsAndDisclaimer: revised.tipsAndDisclaimer?.trim()
      ? revised.tipsAndDisclaimer
      : baseline.tipsAndDisclaimer,
    citations: revised.citations?.length ? revised.citations : baseline.citations,
  };
}

export function tripPlanItinerarySignature(plan: TripPlanDocument): string {
  return plan.itinerary
    .map((d) => {
      const { morning, afternoon, evening } = d.activities;
      return `${d.dateIso ?? d.title}:${activityFingerprint(morning)};${activityFingerprint(afternoon)};${activityFingerprint(evening)}`;
    })
    .join("\n");
}

export function tripPlanItineraryChanged(before: TripPlanDocument, after: TripPlanDocument): boolean {
  return tripPlanItinerarySignature(before) !== tripPlanItinerarySignature(after);
}

export function tripPlanMeaningfullyChanged(before: TripPlanDocument, after: TripPlanDocument): boolean {
  return (
    tripPlanItineraryChanged(before, after) ||
    before.foodAndBudget !== after.foodAndBudget ||
    before.overview !== after.overview
  );
}

const SLOT_LABEL: Record<"morning" | "afternoon" | "evening", string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

export function formatItineraryDiffSummary(
  before: TripPlanDocument,
  after: TripPlanDocument
): string {
  const lines: string[] = [];
  const max = Math.max(before.itinerary.length, after.itinerary.length);

  for (let i = 0; i < max; i += 1) {
    const b = before.itinerary[i];
    const a = after.itinerary[i];
    if (!b || !a) continue;
    const label = `${a.title}${a.dateIso ? ` (${a.dateIso})` : ""}`;

    for (const slot of ["morning", "afternoon", "evening"] as const) {
      const bNames = b.activities[slot].map((x) => x.itineraryItem).join("、") || "（空）";
      const aNames = a.activities[slot].map((x) => x.itineraryItem).join("、") || "（空）";
      if (bNames !== aNames) {
        lines.push(`${label} ${SLOT_LABEL[slot]}：${bNames} → ${aNames}`);
      }
    }
  }

  return lines.length ? lines.join("\n") : "（itinerary 无变化）";
}

export function formatItineraryJsonForPrompt(plan: TripPlanDocument): string {
  return JSON.stringify(plan.itinerary, null, 2);
}

/** 供 LLM 评估：当前方案是否已满足用户修订意图 */
export function formatItinerarySlotsForAssessment(plan: TripPlanDocument): string {
  return plan.itinerary
    .map((day) => {
      const slots = (["morning", "afternoon", "evening"] as const)
        .map((slot) => {
          const acts = day.activities[slot];
          const label = SLOT_LABEL[slot];
          if (!acts.length) return `${label}：（空）`;
          return `${label}：${acts.map((a) => a.itineraryItem).join("、")}`;
        })
        .join("；");
      return `${day.title}${day.dateIso ? ` (${day.dateIso})` : ""} — ${slots}`;
    })
    .join("\n");
}
