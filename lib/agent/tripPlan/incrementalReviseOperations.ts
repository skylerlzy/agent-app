import type { TripPlanDay, TripPlanDocument } from "./types";

export type TimeSlot = "morning" | "afternoon" | "evening";

export type RevisionOperation =
  | {
      action: "clear";
      slot: TimeSlot;
      dayIndex?: number;
      dateIso?: string;
      dayTitle?: string;
    }
  | {
      action: "replace";
      slot: TimeSlot;
      itineraryItem: string;
      briefDescription: string;
      dayIndex?: number;
      dateIso?: string;
      dayTitle?: string;
    };

function resolveDayIndex(plan: TripPlanDocument, op: RevisionOperation): number {
  if (op.dayIndex != null && op.dayIndex >= 1 && op.dayIndex <= plan.itinerary.length) {
    return op.dayIndex - 1;
  }
  if (op.dateIso) {
    const idx = plan.itinerary.findIndex((d) => d.dateIso === op.dateIso);
    if (idx >= 0) return idx;
  }
  if (op.dayTitle) {
    const idx = plan.itinerary.findIndex((d) => d.title === op.dayTitle);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 将 LLM 解析出的结构化修订操作应用到 baseline（不依赖用户原文正则） */
export function applyRevisionOperations(
  plan: TripPlanDocument,
  operations: RevisionOperation[]
): TripPlanDocument {
  if (!operations.length) return plan;

  const itinerary = plan.itinerary.map((day) => ({
    ...day,
    activities: {
      morning: [...day.activities.morning],
      afternoon: [...day.activities.afternoon],
      evening: [...day.activities.evening],
    },
  }));

  for (const op of operations) {
    const dayIndex = resolveDayIndex(plan, op);
    if (dayIndex < 0) continue;

    if (op.action === "clear") {
      itinerary[dayIndex].activities[op.slot] = [];
    } else {
      itinerary[dayIndex].activities[op.slot] = [
        { itineraryItem: op.itineraryItem.trim(), briefDescription: op.briefDescription.trim() },
      ];
    }
  }

  return { ...plan, itinerary };
}

export function parseRevisionOperations(raw: unknown): RevisionOperation[] {
  if (!Array.isArray(raw)) return [];
  const slots = new Set<TimeSlot>(["morning", "afternoon", "evening"]);
  const out: RevisionOperation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const slot = o.slot;
    if (typeof slot !== "string" || !slots.has(slot as TimeSlot)) continue;

    const dayIndex = typeof o.dayIndex === "number" ? o.dayIndex : undefined;
    const dateIso = typeof o.dateIso === "string" ? o.dateIso.trim() : undefined;
    const dayTitle = typeof o.dayTitle === "string" ? o.dayTitle.trim() : undefined;
    const action = o.action;

    if (action === "clear") {
      out.push({ action: "clear", slot: slot as TimeSlot, dayIndex, dateIso, dayTitle });
      continue;
    }

    if (action === "replace") {
      const itineraryItem = typeof o.itineraryItem === "string" ? o.itineraryItem.trim() : "";
      const briefDescription =
        typeof o.briefDescription === "string" ? o.briefDescription.trim() : itineraryItem;
      if (!itineraryItem) continue;
      out.push({
        action: "replace",
        slot: slot as TimeSlot,
        itineraryItem,
        briefDescription,
        dayIndex,
        dateIso,
        dayTitle,
      });
    }
  }

  return out;
}
