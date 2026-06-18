import type { AgentRunInput } from "../contracts";
import type { ToolName } from "../contracts";
import { inferCityFromText } from "../tools/ToolArgumentValidator";
import type { TripPlanDailyWeather, TripPlanDocument, TripPlanPlace } from "./types";

export type ToolLogEntry = { stepId: string; toolName: ToolName; summary: string };

export interface ResolvedTripContext {
  destination?: string;
  origin?: string;
  tripStart?: string;
  tripEnd?: string;
}

function parseToolJson(summary: string): Record<string, unknown> | null {
  const trimmed = summary.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 归一化城市名：去掉「市」后缀与「 · 省名」等附加信息 */
export function normalizeCityName(city: string): string {
  return city
    .replace(/\s·\s.*$/u, "")
    .replace(/市$/u, "")
    .trim();
}

export function citiesMatch(a?: string, b?: string): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizeCityName(a);
  const nb = normalizeCityName(b);
  if (na === nb) return true;
  return a.includes(nb) || b.includes(na);
}

export function isDateInTripRange(
  dateIso: string,
  tripStart?: string,
  tripEnd?: string
): boolean {
  if (!tripStart?.trim()) return true;
  const end = tripEnd?.trim() || tripStart;
  return dateIso >= tripStart && dateIso <= end;
}

export function resolveTripContext(
  input: AgentRunInput,
  plan?: TripPlanDocument
): ResolvedTripContext {
  const prefs = input.context.preferences;
  const slots = input.goal.slots;

  let destination =
    plan?.meta.destination?.trim() ||
    prefs.destination?.trim() ||
    slots?.destination?.trim();

  const inferred = inferCityFromText(input.goal.rawText);
  if (inferred) {
    const bare = normalizeCityName(inferred);
    if (input.goal.rawText.includes(bare)) {
      destination = destination && citiesMatch(destination, bare) ? destination : bare;
    }
  }

  const origin =
    plan?.meta.origin?.trim() ||
    prefs.originCity?.trim() ||
    slots?.originCity?.trim();

  const tripStart =
    plan?.meta.tripStart?.trim() ||
    prefs.tripStartDateIso?.trim() ||
    slots?.startDateIso?.trim();

  const tripEnd =
    plan?.meta.tripEnd?.trim() ||
    prefs.tripEndDateIso?.trim() ||
    slots?.endDateIso?.trim();

  return { destination, origin, tripStart, tripEnd };
}

export function filterToolLogsForTrip(
  toolLogs: ToolLogEntry[],
  ctx: ResolvedTripContext
): ToolLogEntry[] {
  const dest = ctx.destination;
  if (!dest?.trim()) {
    return toolLogs.filter((log) => log.toolName !== "maps_route_estimate");
  }

  return toolLogs.filter((log) => {
    const data = parseToolJson(log.summary);

    if (log.toolName === "maps_route_estimate") return false;

    if (log.toolName === "rail_schedule_hint") {
      if (!data) return true;
      const oc = String(data.originCity ?? "");
      const dc = String(data.destinationCity ?? "");
      if (ctx.origin && ctx.destination) {
        return (
          (citiesMatch(oc, ctx.origin) && citiesMatch(dc, ctx.destination)) ||
          (citiesMatch(dc, ctx.origin) && citiesMatch(oc, ctx.destination))
        );
      }
      return citiesMatch(dc, ctx.destination) || citiesMatch(oc, ctx.origin);
    }

    if (log.toolName === "weather_forecast") {
      if (!data) return false;
      const city = typeof data.city === "string" ? data.city : "";
      const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
      if (!citiesMatch(city, dest)) return false;
      if (dateIso && ctx.tripStart && !isDateInTripRange(dateIso, ctx.tripStart, ctx.tripEnd)) {
        return false;
      }
      return true;
    }

    if (log.toolName === "poi_search") {
      if (!data) return false;
      const city = typeof data.city === "string" ? data.city : "";
      return citiesMatch(city, dest);
    }

    return true;
  });
}

export function weatherMatchesTrip(
  daily: TripPlanDailyWeather[],
  ctx: ResolvedTripContext
): boolean {
  if (daily.length === 0) return false;
  const dest = ctx.destination;
  return daily.every((d) => {
    if (dest && d.city && !citiesMatch(d.city, dest)) return false;
    if (ctx.tripStart && d.dateIso && !isDateInTripRange(d.dateIso, ctx.tripStart, ctx.tripEnd)) {
      return false;
    }
    return true;
  });
}

export function placeLooksLikeWrongCity(name: string, destination?: string): boolean {
  if (!destination?.trim()) return false;
  const d = normalizeCityName(destination);
  if (name.includes(d)) return false;
  const m = name.match(/([\u4e00-\u9fff]{2,8})市/u);
  if (m && !citiesMatch(m[1], destination)) return true;
  if (/^广东省|^浙江省|^江苏省|^四川省/u.test(name) && !name.includes(d)) return true;
  return false;
}

export function topPlacesMatchDestination(
  places: TripPlanPlace[],
  destination?: string
): boolean {
  if (places.length === 0) return true;
  return !places.some((p) => placeLooksLikeWrongCity(p.name, destination));
}
