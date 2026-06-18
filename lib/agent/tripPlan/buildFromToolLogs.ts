import type { ToolName } from "../contracts";
import type { TripPlanDay, TripPlanDocument, TripPlanPlace } from "./types";

type ToolLogEntry = { stepId: string; toolName: ToolName; summary: string };

function parseToolJson(summary: string): Record<string, unknown> | null {
  const trimmed = summary.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseLngLat(pair?: unknown): { lat: number; lng: number } | undefined {
  if (typeof pair !== "string") return undefined;
  const [lngS, latS] = pair.split(",").map((s) => s.trim());
  const lng = Number(lngS);
  const lat = Number(latS);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return { lat, lng };
}

function shortPlaceName(address?: unknown): string | null {
  if (typeof address !== "string" || !address.trim()) return null;
  const t = address.trim();
  const m = t.match(/[\u4e00-\u9fa5A-Za-z0-9（）()·\-]+$/);
  return (m?.[0] ?? t).slice(0, 40);
}

export function extractPlacesFromToolLogs(toolLogs: ToolLogEntry[]): TripPlanPlace[] {
  const seen = new Set<string>();
  const places: TripPlanPlace[] = [];

  for (const log of toolLogs) {
    if (log.toolName !== "maps_route_estimate") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;

    for (const [addrKey, coordKey] of [
      ["originFormattedAddress", "originResolved"],
      ["destinationFormattedAddress", "destinationResolved"],
    ] as const) {
      const name = shortPlaceName(data[addrKey]);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      places.push({ name, coordinates: parseLngLat(data[coordKey]) });
    }
  }
  return places.slice(0, 12);
}

export function buildWeatherTipsFromToolLogs(toolLogs: ToolLogEntry[]): string {
  const lines: string[] = [];
  for (const log of toolLogs) {
    if (log.toolName !== "weather_forecast") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
    const city = typeof data.city === "string" ? data.city : "";
    const weather = typeof data.weather === "string" ? data.weather : "";
    const note = typeof data.note === "string" ? data.note : "";
    if (dateIso && weather) {
      lines.push(`${dateIso} ${city || ""}：${weather}${note ? `（${note}）` : ""}`);
    }
  }
  return lines.length > 0
    ? lines.join("\n")
    : "本回合未获取到完整天气预报；请以出发前当地临近预报为准。";
}

export function buildTransportFromToolLogs(toolLogs: ToolLogEntry[]): string {
  const lines: string[] = [];
  for (const log of toolLogs) {
    if (log.toolName !== "maps_route_estimate") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const origin = shortPlaceName(data.originFormattedAddress) ?? data.origin;
    const dest = shortPlaceName(data.destinationFormattedAddress) ?? data.destination;
    const mode = data.modeUsedForMetrics ?? data.mode;
    const dist = data.distanceKm ?? (Number(data.distanceMeters) / 1000).toFixed(1);
    const dur = data.durationHuman ?? (data.durationMinutes ? `约 ${data.durationMinutes} 分钟` : "");
    const note = typeof data.note === "string" && data.note !== "OK" ? data.note : "";
    if (origin && dest) {
      lines.push(
        `${origin} → ${dest}：${mode ?? "路线"}，约 ${dist} km，${dur}${note ? `；${note}` : ""}`
      );
    }
  }
  if (lines.length === 0) {
    return "本回合未获取到完整路线耗时；市内接驳请预留弹性，跨城铁路以 12306 为准。";
  }
  return lines.join("\n");
}

function enumerateIsoDates(start?: string, end?: string): string[] {
  if (!start?.trim()) return [];
  const endIso = end?.trim() || start;
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  const last = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [start];
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function weatherForDate(toolLogs: ToolLogEntry[], dateIso: string): string {
  for (const log of toolLogs) {
    if (log.toolName !== "weather_forecast") continue;
    const data = parseToolJson(log.summary);
    if (data?.dateIso === dateIso && typeof data.weather === "string") return data.weather;
  }
  return "";
}

function slotLabel(index: number): "morning" | "afternoon" | "evening" {
  if (index % 3 === 0) return "morning";
  if (index % 3 === 1) return "afternoon";
  return "evening";
}

/** 用工具观测与目的地生成可读的按天行程（避免把规划步骤描述直接展示给用户） */
export function buildItineraryFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts: { destination?: string; tripStart?: string; tripEnd?: string }
): TripPlanDay[] {
  const dates = enumerateIsoDates(opts.tripStart, opts.tripEnd);
  const places = extractPlacesFromToolLogs(toolLogs);
  const dest = opts.destination?.trim() || "目的地";

  if (dates.length === 0) {
    return [
      {
        title: "Day 1",
        activities: {
          morning: places[0]
            ? [{ itineraryItem: places[0].name, briefDescription: `游览 ${places[0].name}。` }]
            : [{ itineraryItem: `${dest}市区`, briefDescription: `在${dest}市区自由安排行程。` }],
          afternoon: places[1]
            ? [{ itineraryItem: places[1].name, briefDescription: `前往 ${places[1].name}。` }]
            : [],
          evening: places[2]
            ? [{ itineraryItem: places[2].name, briefDescription: `晚间可在 ${places[2].name} 附近散步。` }]
            : [],
        },
      },
    ];
  }

  return dates.map((dateIso, dayIndex) => {
    const weather = weatherForDate(toolLogs, dateIso);
    const place = places[dayIndex] ?? places[dayIndex % Math.max(places.length, 1)];
    const rainy = /雨|雷|雪/.test(weather);
    const activities: TripPlanDay["activities"] = { morning: [], afternoon: [], evening: [] };

    if (place) {
      activities[slotLabel(dayIndex)] = [
        {
          itineraryItem: place.name,
          briefDescription: rainy
            ? `${dateIso} 预报${weather || "可能有降水"}，建议以 ${place.name} 室内或就近备选为主，外出携带雨具。`
            : `${dateIso} 可安排游览 ${place.name}。${weather ? `当日天气：${weather}` : ""}`,
        },
      ];
    } else {
      activities.morning = [
        {
          itineraryItem: `${dest} Day ${dayIndex + 1}`,
          briefDescription: `${dateIso} 在${dest}自由探索。${weather ? `天气：${weather}` : ""}`,
        },
      ];
    }

    if (places[dayIndex + 1]) {
      activities.evening = [
        {
          itineraryItem: places[dayIndex + 1].name,
          briefDescription: `晚间可顺路体验 ${places[dayIndex + 1].name} 周边氛围。`,
        },
      ];
    }

    return {
      title: `Day ${dayIndex + 1}`,
      dateIso,
      activities,
    };
  });
}

export function buildThemesFromToolLogs(toolLogs: ToolLogEntry[], destination?: string): string[] {
  const places = extractPlacesFromToolLogs(toolLogs).map((p) => p.name);
  if (places.length > 0) return places.slice(0, 6);
  return destination ? [`${destination}城市漫游`, `${destination}美食体验`] : ["城市漫游"];
}

export function isDegradedFallbackPlan(plan: TripPlanDocument): boolean {
  return /降级模板|请查看推理轨迹/.test(plan.tipsAndDisclaimer ?? "");
}
