import type { TripPreferences, UserGoal } from "../contracts";
import { inferCityFromText } from "../tools/ToolArgumentValidator";
import { normalizeCityName } from "../tripPlan/tripContext";

function destinationFromMessage(rawText: string, prefDest?: string): string | undefined {
  const inferred = inferCityFromText(rawText);
  if (!inferred) return prefDest;
  const bare = normalizeCityName(inferred);
  if (rawText.includes(bare)) {
    if (prefDest && normalizeCityName(prefDest) === bare) return prefDest;
    return bare;
  }
  return prefDest;
}

/** 将 TripPreferences 与已有槽位合并为 UserGoal（成员3 对话续聊与单次 runAgent 共用） */
export function mergeGoalFromPreferences(
  rawText: string,
  preferences: TripPreferences,
  existingSlots?: UserGoal["slots"]
): UserGoal {
  const baseSlots = existingSlots ?? {};
  const mergedSlots = {
    ...baseSlots,
    destination: destinationFromMessage(
      rawText,
      preferences.destination ?? baseSlots.destination
    ),
    originCity: preferences.originCity ?? baseSlots.originCity,
    startDateIso: preferences.tripStartDateIso ?? baseSlots.startDateIso,
    endDateIso: preferences.tripEndDateIso ?? baseSlots.endDateIso,
    pace: preferences.pace ?? baseSlots.pace,
    budgetCny: preferences.budgetCny ?? baseSlots.budgetCny,
  };
  const goalSlots = Object.fromEntries(
    Object.entries(mergedSlots).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const slotsOut =
    Object.keys(goalSlots).length > 0 ? (goalSlots as UserGoal["slots"]) : undefined;
  return { rawText, slots: slotsOut };
}
