import type { TripPreferences, UserGoal } from "../contracts";

/** 将 TripPreferences 与已有槽位合并为 UserGoal（成员3 对话续聊与单次 runAgent 共用） */
export function mergeGoalFromPreferences(
  rawText: string,
  preferences: TripPreferences,
  existingSlots?: UserGoal["slots"]
): UserGoal {
  const baseSlots = existingSlots ?? {};
  const mergedSlots = {
    ...baseSlots,
    /** 用户已在出行设置中确认的目的地/出发地优先于历史槽位 */
    destination: preferences.destination?.trim() || baseSlots.destination,
    originCity: preferences.originCity?.trim() || baseSlots.originCity,
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
