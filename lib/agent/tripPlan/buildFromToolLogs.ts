import type { ToolName } from "../contracts";
import type {
  TripPlanDailyWeather,
  TripPlanDay,
  TripPlanDocument,
  TripPlanFoodRecommendation,
  TripPlanPlace,
  TripPlanTransportSegment,
} from "./types";
import { citiesMatch, type ToolLogEntry } from "./tripContext";

export type { ToolLogEntry };

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

const FOOD_POI_KEYWORDS = /餐|食|美食|清真|饭|面|小吃|咖啡|茶|蚝|拉麵|拉面|火锅|粥|烧|菜馆/;
const SCENIC_POI_TYPE = /风景名胜|博物馆|古迹|旅游|公园广场|科教文化|纪念馆|寺庙|观景点|海滩|广场/;
const NON_ATTRACTION_TYPE = /住宿|宾馆|停车|公交|地名地址|道路名|路口|公厕|生活服务场所|交叉口|辅路|辅线/;
const NON_ATTRACTION_NAME = /酒店|停车场|交叉口|辅路|公厕|便利店|咖啡\(|便民服务|营地$/;

/** 从 poi_search 提取目的地内景点（不用 maps 路线端点） */
export function extractAttractionsFromPoiSearch(
  toolLogs: ToolLogEntry[],
  opts?: { destination?: string }
): TripPlanPlace[] {
  const seen = new Set<string>();
  const places: TripPlanPlace[] = [];

  for (const log of toolLogs) {
    if (log.toolName !== "poi_search") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const city = typeof data.city === "string" ? data.city : "";
    if (opts?.destination && !citiesMatch(city, opts.destination)) continue;
    const keywords = typeof data.keywords === "string" ? data.keywords : "";
    if (FOOD_POI_KEYWORDS.test(keywords)) continue;

    const pois = data.pois;
    if (!Array.isArray(pois)) continue;

    for (const raw of pois) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!name || seen.has(name) || NON_ATTRACTION_NAME.test(name)) continue;
      const type = typeof p.type === "string" ? p.type : "";
      if (NON_ATTRACTION_TYPE.test(type) && !SCENIC_POI_TYPE.test(type)) continue;
      if (!SCENIC_POI_TYPE.test(type) && type && !/110/.test(String(p.typecode ?? ""))) continue;

      seen.add(name);
      places.push({
        name,
        coordinates: parseLngLat(p.location),
      });
      if (places.length >= 12) return places;
    }
  }
  return places;
}

export function extractPlacesFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts?: { destination?: string }
): TripPlanPlace[] {
  return extractAttractionsFromPoiSearch(toolLogs, opts);
}

export function buildWeatherTipsFromToolLogs(toolLogs: ToolLogEntry[]): string {
  const daily = parseDailyWeatherFromToolLogs(toolLogs);
  if (daily.length === 0) {
    return "本回合未获取到完整天气预报；请以出发前当地临近预报为准。";
  }
  return buildWeatherAdviceFromToolLogs(daily);
}

export function parseDailyWeatherFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts?: { destination?: string; tripStart?: string; tripEnd?: string }
): TripPlanDailyWeather[] {
  const byDate = new Map<string, TripPlanDailyWeather>();
  for (const log of toolLogs) {
    if (log.toolName !== "weather_forecast") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
    const weather = typeof data.weather === "string" ? data.weather : "";
    if (!dateIso || !weather) continue;
    const city = typeof data.city === "string" ? data.city.replace(/\s·\s.*$/, "") : undefined;
    if (opts?.destination && city && !citiesMatch(city, opts.destination)) continue;
    if (opts?.tripStart && !isDateInRange(dateIso, opts.tripStart, opts.tripEnd)) continue;
    byDate.set(dateIso, {
      dateIso,
      city,
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

function isDateInRange(dateIso: string, start?: string, end?: string): boolean {
  if (!start?.trim()) return true;
  const last = end?.trim() || start;
  return dateIso >= start && dateIso <= last;
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

function formatTrainLine(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const no =
    (typeof t.trainno === "string" ? t.trainno : null) ??
    (typeof t.trainNo === "string" ? t.trainNo : null);
  const dep =
    (typeof t.departureTime === "string" ? t.departureTime : null) ??
    (typeof t.departTime === "string" ? t.departTime : null);
  const arr =
    (typeof t.arrivalTime === "string" ? t.arrivalTime : null) ??
    (typeof t.arriveTime === "string" ? t.arriveTime : null);
  const duration =
    (typeof t.costTime === "string" ? t.costTime : null) ??
    (typeof t.runTime === "string" ? t.runTime : null) ??
    (typeof t.duration === "string" ? t.duration : null);
  const type = typeof t.type === "string" ? t.type : "";
  const parts = [no, type, dep && arr ? `${dep}→${arr}` : dep ?? arr, duration].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function parseRailSegment(data: Record<string, unknown>): TripPlanTransportSegment | null {
  const origin = typeof data.originCity === "string" ? data.originCity : "";
  const dest = typeof data.destinationCity === "string" ? data.destinationCity : "";
  if (!origin || !dest) return null;
  const trains = Array.isArray(data.trains) ? data.trains : [];
  const dateIso = typeof data.dateIso === "string" ? data.dateIso : "";
  const trainLines = trains
    .map(formatTrainLine)
    .filter((line): line is string => Boolean(line))
    .slice(0, 10);

  let recommendation = `${origin} → ${dest}`;
  if (trainLines.length > 0) {
    recommendation += `：铁路查询（${dateIso || "见工具"}，以 12306 为准）— ${trainLines.join("；")}`;
  } else {
    recommendation += "：建议优先高铁/动车；本回合未查到具体车次，请以 12306 为准";
  }
  recommendation += "。抵达后使用地铁/网约车接驳至酒店或首站。";

  const first = trains[0] as Record<string, unknown> | undefined;
  const durationRaw =
    (typeof first?.costTime === "string" ? first.costTime : null) ??
    (typeof first?.runTime === "string" ? first.runTime : null);
  const durationMinutes = durationRaw ? parseDurationMinutes(durationRaw) : undefined;

  return {
    category: "intercity",
    origin,
    destination: dest,
    durationMinutes,
    mode: "rail",
    recommendation,
  };
}

function parseDurationMinutes(text: string): number | undefined {
  const h = text.match(/(\d+)\s*小时/u);
  const m = text.match(/(\d+)\s*分/u);
  if (h || m) return (Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0)) || undefined;
  const colon = text.match(/(\d+):(\d+)/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  return undefined;
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
    if (log.toolName !== "rail_schedule_hint") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const seg = parseRailSegment(data);
    if (seg) {
      segments.push(seg);
      hasIntercity = true;
    }
  }

  if (!hasIntercity) {
    const fallback = buildIntercityFallback(opts?.originCity, opts?.destination);
    if (fallback) segments.push(fallback);
  }

  if (segments.length === 0) {
    return {
      segments: [],
      summary: "本回合未获取到跨城铁路信息；请以 12306 查询车次，市内接驳预留弹性时间。",
    };
  }

  const summary = segments.map((s) => `${s.origin} → ${s.destination}\n${s.recommendation}`).join("\n\n");

  return { segments, summary };
}

export function extractFoodFromPoiSearch(
  toolLogs: ToolLogEntry[],
  opts?: { destination?: string }
): TripPlanFoodRecommendation[] {
  const seen = new Set<string>();
  const items: TripPlanFoodRecommendation[] = [];

  for (const log of toolLogs) {
    if (log.toolName !== "poi_search") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const city = typeof data.city === "string" ? data.city : "";
    if (opts?.destination && !citiesMatch(city, opts.destination)) continue;
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

/** 用工具观测与目的地生成可读的按天行程（避免把规划步骤描述直接展示给用户） */
export function buildItineraryFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts: {
    destination?: string;
    tripStart?: string;
    tripEnd?: string;
    pace?: "slow" | "balanced" | "fast";
    origin?: string;
  }
): TripPlanDay[] {
  const dates = enumerateIsoDates(opts.tripStart, opts.tripEnd);
  const places = extractAttractionsFromPoiSearch(toolLogs, { destination: opts.destination });
  const dest = opts.destination?.trim() || "目的地";
  const slotsPerDay = opts.pace === "slow" ? 2 : opts.pace === "fast" ? 3 : 2;
  const slotOrder: Array<"morning" | "afternoon" | "evening"> = [
    "morning",
    "afternoon",
    "evening",
  ];
  let placeIdx = 0;

  if (dates.length === 0) {
    return buildSingleDayItinerary(places, dest, toolLogs, opts.tripStart);
  }

  return dates.map((dateIso, dayIndex) => {
    const weather = weatherForDate(toolLogs, dateIso);
    const rainy = /雨|雷|雪/.test(weather);
    const activities: TripPlanDay["activities"] = { morning: [], afternoon: [], evening: [] };

    if (dayIndex === 0 && opts.origin && opts.destination && !citiesMatch(opts.origin, opts.destination)) {
      const crossCity = !citiesMatch(opts.origin, opts.destination);
      if (crossCity) {
        activities.morning = [
          {
            itineraryItem: `${opts.origin}出发 · 抵达${dest}`,
            briefDescription: `乘高铁/动车前往${dest}（车次见「交通与耗时」），抵达后办理入住并稍作休整。${weather ? `当日天气：${weather}` : ""}`,
          },
        ];
      }
    }

    let filled = 0;
    for (const slot of slotOrder) {
      if (filled >= slotsPerDay) break;
      if (activities[slot].length > 0) continue;
      const place = places[placeIdx];
      if (!place) break;
      placeIdx += 1;
      filled += 1;
      activities[slot] = [
        {
          itineraryItem: place.name,
          briefDescription: buildActivityBlurb(place.name, dateIso, weather, rainy, slot),
        },
      ];
    }

    if (
      activities.morning.length === 0 &&
      activities.afternoon.length === 0 &&
      activities.evening.length === 0
    ) {
      activities.morning = [
        {
          itineraryItem: `${dest}自由探索`,
          briefDescription: `${dateIso} 在${dest}按节奏安排 1～2 个重点。${weather ? `天气：${weather}` : ""}`,
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

function buildSingleDayItinerary(
  places: TripPlanPlace[],
  dest: string,
  toolLogs: ToolLogEntry[],
  dateIso?: string
): TripPlanDay[] {
  const weather = dateIso ? weatherForDate(toolLogs, dateIso) : "";
  const rainy = /雨|雷|雪/.test(weather);
  return [
    {
      title: "Day 1",
      dateIso,
      activities: {
        morning: places[0]
          ? [
              {
                itineraryItem: places[0].name,
                briefDescription: buildActivityBlurb(places[0].name, dateIso ?? "", weather, rainy, "morning"),
              },
            ]
          : [{ itineraryItem: `${dest}市区`, briefDescription: `在${dest}市区自由安排行程。` }],
        afternoon: places[1]
          ? [
              {
                itineraryItem: places[1].name,
                briefDescription: buildActivityBlurb(places[1].name, dateIso ?? "", weather, rainy, "afternoon"),
              },
            ]
          : [],
        evening: places[2]
          ? [
              {
                itineraryItem: places[2].name,
                briefDescription: buildActivityBlurb(places[2].name, dateIso ?? "", weather, rainy, "evening"),
              },
            ]
          : [],
      },
    },
  ];
}

function buildActivityBlurb(
  placeName: string,
  dateIso: string,
  weather: string,
  rainy: boolean,
  slot: "morning" | "afternoon" | "evening"
): string {
  const timeHint =
    slot === "morning" ? "建议上午" : slot === "afternoon" ? "下午" : "傍晚至夜间";
  if (rainy) {
    return `${dateIso} ${timeHint}游览 ${placeName}；预报${weather || "可能有降水"}，备雨具并准备室内备选。`;
  }
  return `${dateIso} ${timeHint}安排 ${placeName}。${weather ? `天气：${weather}` : "按地图串联，控制步行强度。"}`;
}

export function buildPackingChecklistFromWeather(
  daily: TripPlanDailyWeather[],
  destination?: string
): string[] {
  const items: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      items.push(s);
    }
  };

  if (daily.some((d) => /雨|雷/.test(d.summary))) add("便携雨衣或折叠伞");
  if (daily.some((d) => (d.tempMax ?? 0) >= 28)) add("防晒霜、遮阳帽与补水壶");
  if (daily.some((d) => (d.tempMin ?? 99) <= 12)) add("薄外套或保暖层");
  if (daily.some((d) => /晴|多云/.test(d.summary) && (d.aqi ?? 999) <= 50)) {
    add("口罩（可选，AQI 良好时户外舒适）");
  }
  add("舒适步行鞋");
  if (destination?.trim()) {
    add(`前往${destination.replace(/市$/u, "")}的身份证件与移动支付`);
  }
  if (daily.some((d) => /雪/.test(d.summary))) add("防滑鞋套或保暖手套");
  return items.slice(0, 8);
}

export function buildThemesFromToolLogs(
  toolLogs: ToolLogEntry[],
  destination?: string
): string[] {
  const places = extractAttractionsFromPoiSearch(toolLogs, { destination }).map((p) => p.name);
  if (places.length > 0) return places.slice(0, 6);
  return destination ? [`${destination}城市漫游`, `${destination}美食体验`] : ["城市漫游"];
}

export function isDegradedFallbackPlan(plan: TripPlanDocument): boolean {
  return /降级模板|请查看推理轨迹/.test(plan.tipsAndDisclaimer ?? "");
}
