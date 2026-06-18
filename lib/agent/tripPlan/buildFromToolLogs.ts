import type { ToolName } from "../contracts";
import type {
  TripPlanDailyWeather,
  TripPlanDay,
  TripPlanDocument,
  TripPlanFoodRecommendation,
  TripPlanPlace,
  TripPlanTransportSegment,
} from "./types";

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
  const daily = parseDailyWeatherFromToolLogs(toolLogs);
  if (daily.length === 0) {
    return "本回合未获取到完整天气预报；请以出发前当地临近预报为准。";
  }
  return buildWeatherAdviceFromToolLogs(daily);
}

export function parseDailyWeatherFromToolLogs(toolLogs: ToolLogEntry[]): TripPlanDailyWeather[] {
  const byDate = new Map<string, TripPlanDailyWeather>();
  for (const log of toolLogs) {
    if (log.toolName !== "weather_forecast") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
    const weather = typeof data.weather === "string" ? data.weather : "";
    if (!dateIso || !weather) continue;
    byDate.set(dateIso, {
      dateIso,
      city: typeof data.city === "string" ? data.city.replace(/\s·\s.*$/, "") : undefined,
      summary: weather,
      tempMin: typeof data.tempMin === "number" ? data.tempMin : undefined,
      tempMax: typeof data.tempMax === "number" ? data.tempMax : undefined,
      precipMm: typeof data.precipMm === "number" ? data.precipMm : undefined,
      aqi: typeof data.airQualityAqi === "number" ? data.airQualityAqi : undefined,
      airQuality: typeof data.airQualityCategory === "string" ? data.airQualityCategory : undefined,
    });
  }
  return [...byDate.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

export function buildWeatherAdviceFromToolLogs(daily: TripPlanDailyWeather[]): string {
  if (daily.length === 0) {
    return "请以出发前当地临近预报为准，携带适季衣物与雨具。";
  }
  const rainyDays = daily.filter((d) => /雨|雷|雪/.test(d.summary));
  const hotDays = daily.filter((d) => (d.tempMax ?? 0) >= 30);
  const aqi = daily.find((d) => d.aqi != null)?.aqi;
  const parts: string[] = [];
  if (rainyDays.length > 0) {
    const dates = rainyDays.map((d) => d.dateIso.slice(5)).join("、");
    parts.push(`${dates} 可能有降水或雷阵雨，建议携带便携雨具`);
  }
  if (hotDays.length > 0) {
    parts.push("日间气温偏高，注意防晒补水，体感可能闷热");
  }
  if (aqi != null && aqi <= 50) {
    parts.push(`空气质量优（AQI ${aqi}），适合户外活动`);
  } else if (aqi != null && aqi > 100) {
    parts.push(`部分日期 AQI 偏高（${aqi}），敏感人群减少长时间户外`);
  }
  if (rainyDays.length >= Math.ceil(daily.length / 2)) {
    parts.push("雨日优先安排室内备选或缩短户外停留");
  } else if (rainyDays.length > 0) {
    parts.push("可错峰安排晨间或傍晚户外，避开对流高发时段");
  }
  return parts.length > 0 ? parts.join("；") + "。" : "整体天气适宜出行，请备轻便外套与舒适步行鞋。";
}

export function buildTransportFromToolLogs(toolLogs: ToolLogEntry[]): string {
  return buildTransportBundleFromToolLogs(toolLogs).summary;
}

function recommendLocalMode(
  mode: string,
  distanceKm: number,
  durationMinutes: number,
  note?: string
): string {
  const parts: string[] = [];
  if (mode === "walking") {
    if (distanceKm <= 1.2) {
      parts.push("推荐步行，适合慢游拍照");
    } else if (distanceKm <= 2.5) {
      parts.push(`可步行（约 ${durationMinutes} 分钟），也可共享单车缩短路程`);
    } else {
      parts.push(`步行约 ${durationMinutes} 分钟偏长，建议公交/打车/骑行接驳`);
    }
  } else if (mode === "transit") {
    parts.push("优先公交/地铁；高峰时段请预留候车与换乘缓冲");
  } else if (mode === "driving") {
    parts.push("驾车/网约车适合携带行李或雨天出行");
  } else {
    parts.push("按实际路况选择步行或公共交通");
  }
  if (note && note !== "OK") parts.push(note);
  return parts.join("；");
}

function parseRailSegment(data: Record<string, unknown>): TripPlanTransportSegment | null {
  const origin = typeof data.originCity === "string" ? data.originCity : "";
  const dest = typeof data.destinationCity === "string" ? data.destinationCity : "";
  if (!origin || !dest) return null;
  const trains = Array.isArray(data.trains) ? data.trains : [];
  const first = trains[0] as Record<string, unknown> | undefined;
  const duration =
    typeof first?.runTime === "string"
      ? first.runTime
      : typeof first?.duration === "string"
        ? first.duration
        : undefined;
  const trainNo = typeof first?.trainNo === "string" ? first.trainNo : undefined;
  const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
  let recommendation = `${origin} → ${dest}：建议优先高铁/动车`;
  if (trainNo && duration) {
    recommendation += `（例：${trainNo} 历时约 ${duration}，查询日 ${dateIso || "见工具"}）`;
  } else if (trains.length === 0) {
    recommendation += "；本回合未查到具体车次，请以 12306 为准";
  }
  recommendation += "。抵达目的地后使用打车/地铁接驳至酒店。";
  return {
    category: "intercity",
    origin,
    destination: dest,
    durationMinutes: undefined,
    mode: "rail",
    recommendation,
  };
}

function buildIntercityFallback(origin?: string, destination?: string): TripPlanTransportSegment | null {
  if (!origin?.trim() || !destination?.trim() || origin.trim() === destination.trim()) return null;
  return {
    category: "intercity",
    origin: origin.trim(),
    destination: destination.trim(),
    mode: "rail",
    recommendation: `${origin} → ${destination}：跨城段建议高铁/动车或航班，购票与时刻以 12306 / 航司为准；抵达后打车或地铁前往市区首站。`,
  };
}

export function buildTransportBundleFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts?: { originCity?: string; destination?: string }
): { segments: TripPlanTransportSegment[]; summary: string } {
  const segments: TripPlanTransportSegment[] = [];
  let hasIntercity = false;

  for (const log of toolLogs) {
    if (log.toolName === "rail_schedule_hint") {
      const data = parseToolJson(log.summary);
      if (!data) continue;
      const seg = parseRailSegment(data);
      if (seg) {
        segments.push(seg);
        hasIntercity = true;
      }
      continue;
    }
    if (log.toolName !== "maps_route_estimate") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const origin =
      (typeof data.origin === "string" ? data.origin.trim() : null) ??
      shortPlaceName(data.originFormattedAddress) ??
      null;
    const dest =
      (typeof data.destination === "string" ? data.destination.trim() : null) ??
      shortPlaceName(data.destinationFormattedAddress) ??
      null;
    if (!origin || !dest) continue;

    const mode = String(data.modeUsedForMetrics ?? data.mode ?? "walking");
    const distanceKm = Number(
      data.distanceKm ?? (Number(data.distanceMeters) / 1000).toFixed(1)
    );
    const durationMinutes = Number(data.durationMinutes ?? Math.round(Number(data.durationSeconds) / 60));
    const note = typeof data.note === "string" ? data.note : undefined;

    segments.push({
      category: "local",
      origin,
      destination: dest,
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : undefined,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : undefined,
      mode,
      recommendation: recommendLocalMode(
        mode,
        Number.isFinite(distanceKm) ? distanceKm : 0,
        Number.isFinite(durationMinutes) ? durationMinutes : 0,
        note
      ),
    });
  }

  if (!hasIntercity) {
    const fallback = buildIntercityFallback(opts?.originCity, opts?.destination);
    if (fallback) segments.unshift(fallback);
  }

  if (segments.length === 0) {
    return {
      segments: [],
      summary: "本回合未获取到路线耗时；跨城请以 12306 为准，市内请预留弹性接驳时间。",
    };
  }

  const summary = segments
    .map((s) => {
      const dist = s.distanceKm != null ? ` · ${s.distanceKm} km` : "";
      const dur = s.durationMinutes != null ? ` · 约 ${s.durationMinutes} 分钟` : "";
      const mode = s.mode ? ` · ${s.mode}` : "";
      return `${s.origin} → ${s.destination}${mode}${dist}${dur}\n${s.recommendation}`;
    })
    .join("\n\n");

  return { segments, summary };
}

const FOOD_POI_KEYWORDS = /餐|食|美食|清真|饭|面|小吃|咖啡|茶|蚝|拉麵|拉面|火锅|粥|烧|菜馆/;

export function extractFoodFromPoiSearch(toolLogs: ToolLogEntry[]): TripPlanFoodRecommendation[] {
  const seen = new Set<string>();
  const items: TripPlanFoodRecommendation[] = [];

  for (const log of toolLogs) {
    if (log.toolName !== "poi_search") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const keywords = typeof data.keywords === "string" ? data.keywords : "";
    if (!FOOD_POI_KEYWORDS.test(keywords)) continue;

    const pois = data.pois;
    if (!Array.isArray(pois)) continue;

    for (const raw of pois) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const address = typeof p.address === "string" ? p.address.trim() : "";
      const type = typeof p.type === "string" ? p.type.split(";").pop()?.trim() : "";
      const tel = typeof p.tel === "string" ? p.tel : "";
      const descParts = [address, type].filter(Boolean);
      if (tel) descParts.push(`电话 ${tel}`);
      items.push({
        name,
        description: descParts.length > 0 ? descParts.join(" · ") : "本地餐饮 POI，可结合行程就近用餐",
      });
      if (items.length >= 6) return items;
    }
  }
  return items;
}

export function buildFoodBudgetFromPreferences(opts: {
  destination?: string;
  budgetCny?: number;
  dietaryPreset?: string;
}): string {
  const dest = opts.destination || "当地";
  const parts: string[] = [`${dest}用餐参考：`];
  if (opts.dietaryPreset && opts.dietaryPreset !== "none") {
    const label =
      opts.dietaryPreset === "halal"
        ? "清真友好"
        : opts.dietaryPreset === "vegetarian"
          ? "素食"
          : "本地风味";
    parts.push(`已按${label}偏好筛选`);
  }
  if (opts.budgetCny != null && opts.budgetCny > 0) {
    parts.push(`人均约 ${opts.budgetCny} 元/天`);
  }
  parts.push("下列门店来自本轮 POI 检索，到店前可电话确认营业时间与是否合口味。");
  return parts.join("，") + "。";
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
