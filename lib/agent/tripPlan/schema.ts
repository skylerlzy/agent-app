import { z } from "zod";
import type { TripPlanDocument } from "./types";

const activitySchema = z.object({
  itineraryItem: z.string().min(1),
  briefDescription: z.string().min(1),
});

const daySchema = z.object({
  title: z.string().min(1),
  dateIso: z.string().optional(),
  activities: z.object({
    morning: z.array(activitySchema).default([]),
    afternoon: z.array(activitySchema).default([]),
    evening: z.array(activitySchema).default([]),
  }),
});

const placeSchema = z.object({
  name: z.string().min(1),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

const dailyWeatherSchema = z.object({
  dateIso: z.string().min(1),
  city: z.string().optional(),
  summary: z.string().min(1),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  precipMm: z.number().optional(),
  aqi: z.number().optional(),
  airQuality: z.string().optional(),
});

const themeHighlightSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  places: z.array(z.string()).optional(),
  highlights: z.array(z.string()).optional(),
});

const foodRecommendationSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  imageUrl: z.string().optional(),
});

const transportSegmentSchema = z.object({
  category: z.enum(["intercity", "local"]),
  origin: z.string().min(1),
  destination: z.string().min(1),
  distanceKm: z.number().optional(),
  durationMinutes: z.number().optional(),
  mode: z.string().optional(),
  recommendation: z.string().min(1),
});

export const tripPlanDocumentSchema = z.object({
  version: z.literal(1).default(1),
  meta: z
    .object({
      destination: z.string().optional(),
      origin: z.string().optional(),
      tripStart: z.string().optional(),
      tripEnd: z.string().optional(),
      routeLabel: z.string().optional(),
    })
    .default({}),
  overview: z.string().min(1),
  weatherTips: z.string().min(1),
  dailyWeather: z.array(dailyWeatherSchema).optional(),
  weatherAdvice: z.string().optional(),
  transport: z.string().min(1),
  transportSegments: z.array(transportSegmentSchema).optional(),
  themesAndPlaces: z.array(z.string()).default([]),
  themeHighlights: z.array(themeHighlightSchema).optional(),
  itinerary: z.array(daySchema).min(1),
  foodAndBudget: z.string().default(""),
  tipsAndDisclaimer: z.string().default(""),
  citations: z.array(z.string()).optional(),
  topPlacesToVisit: z.array(placeSchema).default([]),
  adventuresActivities: z.array(z.string()).optional(),
  localCuisine: z.array(z.string()).optional(),
  foodRecommendations: z.array(foodRecommendationSchema).optional(),
  packingChecklist: z.array(z.string()).optional(),
});

const FALLBACK_TEXT = "（待根据工具数据补充）";
const PLACEHOLDER_RE = /（待根据工具数据补充）|（待补充）|^待补充|请查看推理轨迹/;

function stripPlaceholderFromField(value: string): string {
  return value
    .replace(/（待根据工具数据补充）/g, "")
    .replace(/（待补充）/g, "")
    .trim();
}

function asNonEmptyString(value: unknown, fallback = FALLBACK_TEXT): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeActivities(raw: unknown): z.infer<typeof daySchema>["activities"] {
  const empty = { morning: [], afternoon: [], evening: [] };
  if (!raw || typeof raw !== "object") return empty;
  const a = raw as Record<string, unknown>;
  const pick = (key: "morning" | "afternoon" | "evening") => {
    const arr = a[key];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const itineraryItem = asNonEmptyString(o.itineraryItem ?? o.name ?? o.title, "");
        const briefDescription = asNonEmptyString(
          o.briefDescription ?? o.description ?? o.brief ?? itineraryItem,
          itineraryItem
        );
        if (!itineraryItem) return null;
        return { itineraryItem, briefDescription };
      })
      .filter((x): x is { itineraryItem: string; briefDescription: string } => x != null);
  };
  return {
    morning: pick("morning"),
    afternoon: pick("afternoon"),
    evening: pick("evening"),
  };
}

/** 修正 LLM 常见 JSON 偏差，提高解析成功率 */
export function normalizeTripPlanRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  o.version = 1;
  o.overview = asNonEmptyString(o.overview);
  o.weatherTips = asNonEmptyString(o.weatherTips);
  o.transport = asNonEmptyString(o.transport);
  o.foodAndBudget =
    typeof o.foodAndBudget === "string" && o.foodAndBudget.trim() && !PLACEHOLDER_RE.test(o.foodAndBudget.trim())
      ? stripPlaceholderFromField(o.foodAndBudget)
      : "";
  o.tipsAndDisclaimer =
    typeof o.tipsAndDisclaimer === "string" ? o.tipsAndDisclaimer.trim() : "";
  if (!Array.isArray(o.themesAndPlaces)) o.themesAndPlaces = [];
  if (!Array.isArray(o.topPlacesToVisit)) o.topPlacesToVisit = [];
  if (Array.isArray(o.itinerary)) {
    o.itinerary = o.itinerary.map((day, i) => {
      if (!day || typeof day !== "object") {
        return {
          title: `Day ${i + 1}`,
          activities: { morning: [], afternoon: [], evening: [] },
        };
      }
      const d = day as Record<string, unknown>;
      return {
        title: asNonEmptyString(d.title, `Day ${i + 1}`),
        dateIso: typeof d.dateIso === "string" ? d.dateIso : undefined,
        activities: normalizeActivities(d.activities ?? d),
      };
    });
  }
  if (o.meta && typeof o.meta === "object") {
    /* keep meta */
  } else {
    o.meta = {};
  }
  return o;
}

export function extractTripPlanFromLlmPayload(parsed: Record<string, unknown>): unknown {
  return parsed.tripPlan ?? parsed.tripPlanStructured ?? parsed.plan;
}

export function parseTripPlanDocument(raw: unknown): TripPlanDocument | null {
  const normalized = normalizeTripPlanRaw(raw);
  const parsed = tripPlanDocumentSchema.safeParse(normalized);
  if (!parsed.success) return null;
  return parsed.data as TripPlanDocument;
}

export function parseTripPlanJsonString(json: string | undefined | null): TripPlanDocument | null {
  if (!json?.trim()) return null;
  try {
    return parseTripPlanDocument(JSON.parse(json));
  } catch {
    return null;
  }
}

export function isValidTripPlan(doc: TripPlanDocument | null | undefined): doc is TripPlanDocument {
  if (!doc) return false;
  const hasActivity = doc.itinerary.some(
    (d) =>
      d.activities.morning.length > 0 ||
      d.activities.afternoon.length > 0 ||
      d.activities.evening.length > 0
  );
  return Boolean(
    doc.overview?.trim() &&
      doc.itinerary?.length > 0 &&
      hasActivity &&
      doc.weatherTips?.trim() &&
      doc.transport?.trim()
  );
}

export function serializeTripPlan(doc: TripPlanDocument): string {
  return JSON.stringify(doc);
}
