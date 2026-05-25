import { v } from "convex/values";

export const runPreferencesValidator = v.optional(
  v.object({
    tripStartDateIso: v.optional(v.string()),
    tripEndDateIso: v.optional(v.string()),
    dietaryNotes: v.optional(v.string()),
    dietaryPreset: v.optional(
      v.union(v.literal("none"), v.literal("vegetarian"), v.literal("halal"), v.literal("local"))
    ),
    pace: v.optional(v.union(v.literal("slow"), v.literal("balanced"), v.literal("fast"))),
    accommodationType: v.optional(
      v.union(v.literal("hotel"), v.literal("airbnb"), v.literal("hostel"), v.literal("camping"))
    ),
    travelThemes: v.optional(v.array(v.string())),
    transportPreferences: v.optional(v.array(v.string())),
    budgetCny: v.optional(v.number()),
    additionalNotes: v.optional(v.string()),
    travelParty: v.optional(
      v.union(v.literal("solo"), v.literal("couple"), v.literal("family"), v.literal("group"))
    ),
  })
);

export const runModeValidator = v.optional(
  v.union(v.literal("full_plan_execute"), v.literal("incremental_revise"), v.literal("quick_reply"))
);

export const activeSkillIdsValidator = v.optional(v.array(v.string()));
