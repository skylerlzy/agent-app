import type { ToolName } from "../contracts";
import type {
  CuratedAttraction,
  TripPlanDailyWeather,
  TripPlanDay,
  TripPlanDocument,
  TripPlanFoodRecommendation,
  TripPlanPlace,
  TripPlanRailOption,
  TripPlanThemeHighlight,
  TripPlanTransportSegment,
} from "./types";
import {
  buildThemeDescription,
  buildThemePlaceHighlights,
  buildThemeTitle,
  buildWeatherAdviceItems,
  buildWeatherAdviceProse,
  describeActivityForSlot,
  describeAttractionSpotlight,
  describeCrossCityArrival,
  describeNeighborhoodExplore,
} from "./attractionNarrative";
import { buildFoodBudgetSummary, composeFoodRecommendation } from "./foodNarrative";
import { buildSampleRailTransportSegment } from "./railSampleFallback";
import type { SkillTripHints } from "./skillTripContext";
import { citiesMatch, type ToolLogEntry } from "./tripContext";

export type { ToolLogEntry, CuratedAttraction };

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
const SCENIC_POI_TYPE = /风景名胜|博物馆|古迹|旅游|公园广场|科教文化|纪念馆|寺庙|观景点|海滩|广场|艺术/;
const NON_ATTRACTION_TYPE = /住宿|宾馆|停车|公交|地名地址|道路名|路口|公厕|生活服务场所|交叉口|辅路|辅线|交通设施/;
const NON_ATTRACTION_NAME =
  /酒店|停车场|交叉口|辅路|公厕|便利店|咖啡\(|便民服务|营地$|检票|售票|出口|入口|地铁站|公交站|服务|办公|观礼台|国旗|地下停车/;
const SUB_VENUE_SUFFIX =
  /(午门|端门|神武门|东华门|检票|售票|停车|出口|入口|地铁站|公交站|服务|办公|观礼台|国旗|角楼|西南角|东北角|西门|东门|南门|北门|城墙|内$|外$|领票|文创|剧场|A区|B区|C区|D区|E区|F区|北区|南区|东区|西区|地下|卡口)/;
const ARRIVAL_CLUSTER =
  /天安门|故宫|前门|王府井|大栅栏|北京坊|情侣路|珠海渔女|拱北|野狸岛|香炉湾|海滨泳场|渔女|日月贝/;
const INDOOR_KEYWORDS = /博物馆|美术馆|艺术区|商场|太古里|坊|图书馆/;

/** 归一化景区主名，用于去重（如「故宫博物院-午门」→「故宫博物院」） */
export function normalizeVenueKey(name: string): string {
  const trimmed = name.trim();
  const dash = trimmed.split(/[-·]/)[0]?.trim();
  return dash || trimmed;
}

function isSubVenuePoi(name: string, keywords: string): boolean {
  if (!/[-·]/u.test(name)) return false;
  const kwCore = keywords.replace(/清真餐厅\s+/u, "").trim().split(/\s+/)[0] ?? "";
  if (kwCore && name.startsWith(kwCore)) return false;
  return SUB_VENUE_SUFFIX.test(name);
}

function scoreAttractionPoi(p: Record<string, unknown>, index: number, keywords: string): number {
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const type = typeof p.type === "string" ? p.type : "";
  const typecode = String(p.typecode ?? "");
  const kwCore = keywords.replace(/清真餐厅\s+/u, "").trim().split(/\s+/)[0] ?? keywords;

  let score = 80 - index;

  if (kwCore && (name === kwCore || name.startsWith(kwCore))) score += 45;
  else if (kwCore && name.includes(kwCore)) score += 25;

  if (!/[-·]/u.test(name)) score += 20;
  if (isSubVenuePoi(name, keywords)) score -= 55;
  if (NON_ATTRACTION_NAME.test(name)) score -= 70;
  if (NON_ATTRACTION_TYPE.test(type) && !SCENIC_POI_TYPE.test(type)) score -= 80;

  if (/世界遗产|国家级景点/.test(type)) score += 30;
  if (/^110201|^110202/.test(typecode)) score += 25;
  if (/博物馆;博物馆|风景名胜;风景名胜/.test(type)) score += 20;
  if (/商场|购物/.test(type) && !INDOOR_KEYWORDS.test(keywords + name)) score -= 25;

  return score;
}

function classifyAttraction(
  name: string,
  type: string,
  keywords: string,
  typecode?: string
): CuratedAttraction["category"] {
  const blob = `${name}${type}${keywords}`;
  const tc = typecode ?? "";
  const isMajorScenic =
    /世界遗产|国家级景点|风景名胜/.test(type) || /^110201|^110202/.test(tc);

  if (isMajorScenic) {
    if (/艺术区|创意|798/.test(blob)) return "cultural";
    if (/中山陵|明孝陵|陵墓|纪念/i.test(name)) return "cultural";
    if (
      /园|湖|海|湿地|森林|草原|公园|长城|天坛|西湖|东湖|颐和园|植物园|玄武湖|张家界|黄山|鼓浪屿/.test(
        name
      ) &&
      !/中山|钟山/i.test(name)
    ) {
      return "outdoor";
    }
    if (/(?<![中南西东])山(?:景区|公园|风景区|体)|^山/.test(name)) return "outdoor";
    return "cultural";
  }

  if (/商场|购物|太古里|商业街/.test(blob) && !/艺术区/.test(blob)) return "commercial";
  if (/美术馆|图书馆/.test(blob)) return "indoor";
  if (/博物馆|纪念馆/.test(blob) && !/风景名胜/.test(type)) return "indoor";
  if (/艺术|文化|历史|遗产|胡同/.test(blob)) return "cultural";
  return "outdoor";
}

function pickPrimaryAttractionFromSearch(data: Record<string, unknown>): CuratedAttraction | null {
  const keywords = typeof data.keywords === "string" ? data.keywords : "";
  if (FOOD_POI_KEYWORDS.test(keywords)) return null;

  const pois = data.pois;
  if (!Array.isArray(pois) || pois.length === 0) return null;

  let best: { p: Record<string, unknown>; score: number } | null = null;
  for (let i = 0; i < pois.length; i++) {
    const raw = pois[i];
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) continue;
    const type = typeof p.type === "string" ? p.type : "";
    if (NON_ATTRACTION_TYPE.test(type) && !SCENIC_POI_TYPE.test(type)) continue;
    if (!SCENIC_POI_TYPE.test(type) && type && !/110|140/.test(String(p.typecode ?? ""))) continue;

    const score = scoreAttractionPoi(p, i, keywords);
    if (!best || score > best.score) best = { p, score };
  }

  if (!best || best.score < 10) return null;

  const name = (best.p.name as string).trim();
  const type = typeof best.p.type === "string" ? best.p.type : "";
  const typecode = String(best.p.typecode ?? "");
  const address = typeof best.p.address === "string" ? best.p.address.trim() : undefined;

  return {
    name,
    coordinates: parseLngLat(best.p.location),
    searchKeywords: keywords,
    address,
    poiType: type,
    category: classifyAttraction(name, type, keywords, typecode),
  };
}

/** 从 poi_search 提取目的地内主景点：每次检索只取 1 个代表 POI，避免子景点占满列表 */
export function extractCuratedAttractionsFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts?: { destination?: string }
): CuratedAttraction[] {
  const seenKeys = new Set<string>();
  const places: CuratedAttraction[] = [];

  for (const log of toolLogs) {
    if (log.toolName !== "poi_search") continue;
    const data = parseToolJson(log.summary);
    if (!data) continue;
    const city = typeof data.city === "string" ? data.city : "";
    if (opts?.destination && !citiesMatch(city, opts.destination)) continue;

    const curated = pickPrimaryAttractionFromSearch(data);
    if (!curated) continue;

    const venueKey = normalizeVenueKey(curated.name);
    if (seenKeys.has(venueKey)) continue;
    seenKeys.add(venueKey);
    places.push(curated);
  }
  return places;
}

/** 从 poi_search 提取目的地内景点（不用 maps 路线端点） */
export function extractAttractionsFromPoiSearch(
  toolLogs: ToolLogEntry[],
  opts?: { destination?: string }
): TripPlanPlace[] {
  return extractCuratedAttractionsFromToolLogs(toolLogs, opts).map(({ name, coordinates }) => ({
    name,
    coordinates,
  }));
}

/** 推荐景点列表是否缺乏多样性（如全是同一景区子 POI） */
export function topPlacesLookMonotonous(places: TripPlanPlace[]): boolean {
  if (places.length < 2) return false;
  const keys = places.map((p) => normalizeVenueKey(p.name)).filter(Boolean);
  const unique = new Set(keys);
  if (unique.size === 1) return true;
  return unique.size < Math.min(3, places.length) && places.length >= 3;
}

/** 行程是否单调（如多天全是同一景区子 POI） */
export function itineraryLooksMonotonous(plan: TripPlanDocument): boolean {
  const items = plan.itinerary.flatMap((d) => [
    ...d.activities.morning,
    ...d.activities.afternoon,
    ...d.activities.evening,
  ]);
  if (items.length < 2) return false;

  const keys = items
    .map((a) => normalizeVenueKey(a.itineraryItem))
    .filter((k) => k && !/出发|抵达|自由探索/.test(k));

  if (keys.length < 2) return false;

  const unique = new Set(keys);
  if (unique.size === 1) return true;

  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return max >= Math.ceil(keys.length * 0.55);
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
  return buildWeatherAdviceProse(daily);
}

export function buildWeatherAdviceItemsFromToolLogs(
  daily: TripPlanDailyWeather[]
): string[] {
  if (daily.length === 0) return ["出发前查看临近天气预报，按实际气温增减衣物"];
  return buildWeatherAdviceItems(daily);
}

export function buildTransportFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts?: { originCity?: string; destination?: string; tripStart?: string }
): string {
  return buildTransportBundleFromToolLogs(toolLogs, opts).summary;
}

/** 识别兜底模板店名（非 poi_search 真实 POI） */
export function isTemplateFoodName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  return (
    /老字号小吃$|本地特色菜$|夜市\/商圈美食$|素食友好$|创意轻食$|清真风味小馆$|民族风味餐厅$/.test(
      n
    ) || /^当地/.test(n)
  );
}

type ParsedTrain = {
  trainno: string;
  type: string;
  departStation: string;
  arriveStation: string;
  departureTime: string;
  arrivalTime: string;
  costTime: string;
  durationMinutes: number;
  priceSecond?: number;
  priceFirst?: string;
  seatsAvailable?: string;
};

function parseTrainRecord(raw: unknown): ParsedTrain | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const trainno =
    (typeof t.trainno === "string" ? t.trainno : null) ??
    (typeof t.trainNo === "string" ? t.trainNo : null);
  const departureTime =
    (typeof t.departureTime === "string" ? t.departureTime : null) ??
    (typeof t.departTime === "string" ? t.departTime : null);
  const arrivalTime =
    (typeof t.arrivalTime === "string" ? t.arrivalTime : null) ??
    (typeof t.arriveTime === "string" ? t.arriveTime : null);
  const costTime =
    (typeof t.costTime === "string" ? t.costTime : null) ??
    (typeof t.runTime === "string" ? t.runTime : null) ??
    (typeof t.duration === "string" ? t.duration : null);
  if (!trainno || !departureTime || !arrivalTime || !costTime) return null;

  const durationMinutes = parseDurationMinutes(costTime);
  if (!durationMinutes) return null;

  const priceSecondRaw = t.priceSecond ?? t.priceHardSeat;
  const priceSecond =
    typeof priceSecondRaw === "string" && priceSecondRaw !== "-"
      ? Number(priceSecondRaw)
      : typeof priceSecondRaw === "number"
        ? priceSecondRaw
        : undefined;

  const priceFirstRaw = t.priceFirst;
  const priceFirst =
    typeof priceFirstRaw === "string" && priceFirstRaw !== "-"
      ? priceFirstRaw
      : typeof priceFirstRaw === "number"
        ? String(priceFirstRaw)
        : undefined;

  return {
    trainno,
    type: typeof t.type === "string" ? t.type : "",
    departStation: typeof t.departStation === "string" ? t.departStation : "",
    arriveStation: typeof t.arriveStation === "string" ? t.arriveStation : "",
    departureTime,
    arrivalTime,
    costTime,
    durationMinutes,
    priceSecond: Number.isFinite(priceSecond) ? priceSecond : undefined,
    priceFirst,
    seatsAvailable: typeof t.seatsAvailable === "string" ? t.seatsAvailable : undefined,
  };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((s) => Number(s.trim()));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function toRailOption(train: ParsedTrain, tag: TripPlanRailOption["tag"]): TripPlanRailOption {
  return {
    trainNo: train.trainno,
    trainType: train.type || undefined,
    departStation: train.departStation || "始发站",
    arriveStation: train.arriveStation || "到达站",
    departureTime: train.departureTime,
    arrivalTime: train.arrivalTime,
    duration: train.costTime,
    priceSecond: train.priceSecond != null ? String(train.priceSecond) : undefined,
    priceFirst: train.priceFirst,
    seatsAvailable: train.seatsAvailable,
    tag,
  };
}

function curateRailOptions(trains: ParsedTrain[]): {
  options: TripPlanRailOption[];
  recommendedDurationMinutes: number;
} {
  if (trains.length === 0) {
    return { options: [], recommendedDurationMinutes: 0 };
  }

  const highSpeed = trains.filter((t) => t.type === "G" || /^G/u.test(t.trainno));
  const pool = highSpeed.length > 0 ? highSpeed : trains;

  const fastest = [...pool].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  const morning = pool.filter((t) => {
    const dep = timeToMinutes(t.departureTime);
    return dep >= 7 * 60 && dep <= 10 * 60 + 30;
  });
  const recommended =
    [...morning].sort((a, b) => a.durationMinutes - b.durationMinutes)[0] ?? fastest;

  const priced = pool.filter((t) => t.priceSecond != null && t.priceSecond > 0);
  const budget = [...priced].sort((a, b) => (a.priceSecond ?? 9999) - (b.priceSecond ?? 9999))[0];

  const options: TripPlanRailOption[] = [];
  const seen = new Set<string>();
  const push = (train: ParsedTrain | undefined, tag: TripPlanRailOption["tag"]) => {
    if (!train || seen.has(train.trainno)) return;
    seen.add(train.trainno);
    options.push(toRailOption(train, tag));
  };

  push(fastest, "最快");
  push(recommended, "推荐");
  if (budget && budget.trainno !== recommended.trainno) {
    push(budget, "经济");
  }

  return {
    options: options.slice(0, 3),
    recommendedDurationMinutes: recommended.durationMinutes,
  };
}

function formatRailRecommendationText(
  origin: string,
  dest: string,
  dateIso: string,
  total: number,
  options: TripPlanRailOption[]
): string {
  if (options.length === 0) {
    return `${origin} → ${dest}：建议优先高铁/动车；本回合未查到具体车次，请以 12306 为准。抵达后使用地铁/网约车接驳至酒店或首站。`;
  }

  const lines = options.map((o) => {
    const price =
      o.priceSecond && o.priceSecond !== "-"
        ? `二等 ¥${o.priceSecond}`
        : o.priceFirst && o.priceFirst !== "-"
          ? `一等 ¥${o.priceFirst}`
          : "";
    const seats = o.seatsAvailable ? ` · ${o.seatsAvailable.split("；")[0]}` : "";
    return `【${o.tag}】${o.trainNo} ${o.departureTime} ${o.departStation}→${o.arrivalTime} ${o.arriveStation}（${o.duration}${price ? `，${price}` : ""}${seats}）`;
  });

  return [
    `${origin} → ${dest} · ${dateIso || "出行日"} 铁路参考（共查询 ${total} 趟，展示 ${options.length} 条精选，购票以 12306 为准）：`,
    ...lines,
    "抵达后使用地铁/网约车接驳至市区酒店或首站；若携带大件行李可预留 30 分钟出站缓冲。",
  ].join("\n");
}

function railLogNeedsReferenceData(data: Record<string, unknown>, trainCount: number): boolean {
  if (trainCount > 0 && data.degraded !== true && data.apiUnavailable !== true) return false;
  return trainCount === 0 || data.degraded === true || data.apiUnavailable === true;
}

function parseRailSegment(data: Record<string, unknown>): TripPlanTransportSegment | null {
  const origin = typeof data.originCity === "string" ? data.originCity : "";
  const dest = typeof data.destinationCity === "string" ? data.destinationCity : "";
  if (!origin || !dest) return null;

  const dateIso =
    (typeof data.dateIso === "string" && data.dateIso) ||
    (typeof data.queryDate === "string" && data.queryDate) ||
    "";

  const rawTrains = Array.isArray(data.trains) ? data.trains : [];
  const trains = rawTrains
    .map(parseTrainRecord)
    .filter((t): t is ParsedTrain => t != null);

  if (railLogNeedsReferenceData(data, trains.length)) {
    return buildSampleRailTransportSegment(origin, dest, dateIso || undefined);
  }

  const total = typeof data.total === "number" ? data.total : trains.length;

  const { options, recommendedDurationMinutes } = curateRailOptions(trains);
  const recommendation = formatRailRecommendationText(origin, dest, dateIso, total, options);

  return {
    category: "intercity",
    origin,
    destination: dest,
    durationMinutes: recommendedDurationMinutes || undefined,
    mode: "rail",
    recommendation,
    railOptions: options.length > 0 ? options : undefined,
    queryDateIso: dateIso || undefined,
    totalTrains: total > 0 ? total : undefined,
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

function buildIntercityFallback(
  origin?: string,
  destination?: string,
  dateIso?: string
): TripPlanTransportSegment | null {
  if (!origin?.trim() || !destination?.trim() || origin.trim() === destination.trim()) return null;
  return buildSampleRailTransportSegment(origin.trim(), destination.trim(), dateIso);
}

export function buildTransportBundleFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts?: { originCity?: string; destination?: string; tripStart?: string }
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
    const fallback = buildIntercityFallback(
      opts?.originCity,
      opts?.destination,
      opts?.tripStart
    );
    if (fallback) segments.push(fallback);
  }

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.category !== "intercity" || (seg.railOptions?.length ?? 0) > 0) continue;
    segments[i] = buildSampleRailTransportSegment(
      seg.origin,
      seg.destination,
      seg.queryDateIso
    );
  }

  if (segments.length === 0) {
    return {
      segments: [],
      summary: "本回合未获取到跨城铁路信息；请以 12306 查询车次，市内接驳预留弹性时间。",
    };
  }

  const summary = segments
    .map((s) => {
      const head = `${s.origin} → ${s.destination}`;
      if (s.railOptions?.length) {
        const opts = s.railOptions
          .map(
            (o) =>
              `${o.tag} ${o.trainNo} ${o.departureTime}-${o.arrivalTime}（${o.duration}）`
          )
          .join("；");
        return `${head}\n${opts}。购票以 12306 为准，到站后地铁/网约车接驳。`;
      }
      return `${head}\n${s.recommendation}`;
    })
    .join("\n\n");

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

/** 从所有 poi_search 结果中提取餐饮 POI（不限 keywords） */
export function extractRestaurantsFromAllPoiLogs(
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

    const pois = data.pois;
    if (!Array.isArray(pois)) continue;

    for (const raw of pois) {
      if (!raw || typeof raw !== "object") continue;
      const p = raw as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      const type = typeof p.type === "string" ? p.type : "";
      if (!name || seen.has(name)) continue;
      if (!/餐饮|美食|餐|小吃|咖啡|火锅|菜馆|饭店|bakery/i.test(type + name)) continue;

      seen.add(name);
      const address = typeof p.address === "string" ? p.address.trim() : "";
      const typeLabel = type.split(";").pop()?.trim() ?? "本地餐饮";
      const tel = typeof p.tel === "string" ? p.tel.trim() : "";
      const descParts = [address, typeLabel, tel ? `电话 ${tel}` : ""].filter(Boolean);
      items.push({
        name,
        description: descParts.join(" · ") || "本地人气餐饮",
      });
      if (items.length >= 6) return items;
    }
  }
  return items;
}

export function buildFallbackFoodRecommendations(
  destination?: string,
  dietaryPreset?: string
): TripPlanFoodRecommendation[] {
  const dest = destination?.replace(/市$/u, "") || "当地";
  const halal = dietaryPreset === "halal";
  const veg = dietaryPreset === "vegetarian";

  const templates = halal
    ? [
        { name: `${dest}清真风味小馆`, description: "以牛羊肉与面点为主，适合穆斯林或偏好清淡蛋白的旅人；到店可询问非酒精饮品。" },
        { name: `${dest}民族风味餐厅`, description: "新疆/西北或本地清真菜系，分享式点菜更划算，记得预留等位时间。" },
      ]
    : veg
      ? [
          { name: `${dest}素食友好餐厅`, description: "以时蔬、菌菇与豆制品为主，建议提前电话确认是否含葱蒜五辛。" },
          { name: `${dest}创意轻食`, description: "沙拉、碗饭或烘焙，适合午间快速补给后继续逛展。" },
        ]
      : [
          { name: `${dest}老字号小吃`, description: "早市或胡同里的口碑档口，点 1～2 样招牌即可体验市井烟火气。" },
          { name: `${dest}本地特色菜`, description: "选有明档厨房、翻台率高的店，招牌菜通常最能代表城市味道。" },
          { name: `${dest}夜市/商圈美食`, description: "傍晚集中解决晚餐，边走边尝，注意卫生与适量。" },
        ];

  return templates.map((t) => composeFoodRecommendation(t));
}

/** 保证至少 2 条美食推荐（工具 POI → 全量餐饮扫描 → 通用兜底） */
export function ensureFoodRecommendations(
  toolLogs: ToolLogEntry[],
  destination: string | undefined,
  dietaryPreset: string | undefined,
  existing: TripPlanFoodRecommendation[] = []
): TripPlanFoodRecommendation[] {
  const seen = new Set<string>();
  const merged: TripPlanFoodRecommendation[] = [];

  const push = (item: TripPlanFoodRecommendation) => {
    if (!item.name?.trim() || seen.has(item.name)) return;
    seen.add(item.name);
    merged.push(composeFoodRecommendation(item));
  };

  for (const item of existing) push(item);
  for (const item of extractFoodFromPoiSearch(toolLogs, { destination })) push(item);
  for (const item of extractRestaurantsFromAllPoiLogs(toolLogs, { destination })) push(item);
  for (const item of buildFallbackFoodRecommendations(destination, dietaryPreset)) {
    if (merged.length >= 4) break;
    if (merged.some((m) => !isTemplateFoodName(m.name))) break;
    push(item);
  }

  const realOnly = merged.filter((m) => !isTemplateFoodName(m.name));
  if (realOnly.length >= 2) return realOnly.slice(0, 6);
  return merged.slice(0, 6);
}

export function buildFoodBudgetFromPreferences(opts: {
  destination?: string;
  budgetCny?: number;
  dietaryPreset?: string;
  restaurants?: Array<{ name: string; description?: string }>;
}): string {
  return buildFoodBudgetSummary(opts);
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

function splitAttractionsForItinerary(attractions: CuratedAttraction[]): {
  arrivalCluster: CuratedAttraction[];
  dayTrips: CuratedAttraction[];
  indoorBackups: CuratedAttraction[];
} {
  const arrivalCluster: CuratedAttraction[] = [];
  const dayTrips: CuratedAttraction[] = [];
  const indoorBackups: CuratedAttraction[] = [];

  for (const a of attractions) {
    const blob = `${a.name}${a.searchKeywords ?? ""}`;
    if (a.category === "indoor" || a.category === "commercial") {
      indoorBackups.push(a);
      continue;
    }
    if (ARRIVAL_CLUSTER.test(blob)) {
      arrivalCluster.push(a);
    } else {
      dayTrips.push(a);
    }
  }

  return { arrivalCluster, dayTrips, indoorBackups };
}

function buildActivity(
  place: CuratedAttraction,
  slot: "morning" | "afternoon" | "evening",
  role: "main" | "companion" | "indoor-fallback" | "evening-stroll"
): TripPlanDay["activities"]["morning"][0] {
  return {
    itineraryItem: place.name,
    briefDescription: describeActivityForSlot(place, slot, role),
  };
}

function buildOrderedAttractionPool(attractions: CuratedAttraction[]): CuratedAttraction[] {
  const { arrivalCluster, dayTrips, indoorBackups } = splitAttractionsForItinerary(attractions);
  const trueIndoor = indoorBackups.filter((a) => a.category === "indoor" || a.category === "commercial");
  return [...arrivalCluster, ...dayTrips, ...trueIndoor];
}

function takeFromPool(
  pool: CuratedAttraction[],
  usedGlobal: Set<string>,
  usedToday: Set<string>
): CuratedAttraction | undefined {
  for (const a of pool) {
    const key = normalizeVenueKey(a.name);
    if (usedGlobal.has(key) || usedToday.has(key)) continue;
    usedGlobal.add(key);
    usedToday.add(key);
    return a;
  }
  return undefined;
}

/** 检测行程文案质量（含天气串、空洞日、同日重复景点等） */
export function itineraryHasQualityIssues(plan: TripPlanDocument): boolean {
  const weatherRe = /气温|降水量|AQI|PM2\.5|白天.*夜间|天气预报/;
  let thinDays = 0;

  for (const day of plan.itinerary) {
    const acts = [...day.activities.morning, ...day.activities.afternoon, ...day.activities.evening];
    if (acts.length === 0) {
      thinDays += 1;
      continue;
    }
    for (const a of acts) {
      if (weatherRe.test(a.briefDescription)) return true;
    }
    const genericOnly = acts.every(
      (a) =>
        /自由探索|按节奏安排 1～2 个重点/.test(a.briefDescription) ||
        /自由探索/.test(a.itineraryItem)
    );
    if (genericOnly) thinDays += 1;

    const venueKeys = acts
      .map((a) => normalizeVenueKey(a.itineraryItem.replace(/\s*(深度游览|延展体验)$/u, "")))
      .filter((k) => k && !/出发|抵达|街巷|慢行|市集/.test(k));
    if (venueKeys.length >= 2 && new Set(venueKeys).size === 1) return true;
  }

  return thinDays >= Math.max(1, Math.floor(plan.itinerary.length / 2));
}

/** 用工具观测与目的地生成可读的按天行程（每次 poi_search 取 1 个主景点，按天分配） */
export function buildItineraryFromToolLogs(
  toolLogs: ToolLogEntry[],
  opts: {
    destination?: string;
    tripStart?: string;
    tripEnd?: string;
    pace?: "slow" | "balanced" | "fast";
    origin?: string;
    skillHints?: SkillTripHints;
  }
): TripPlanDay[] {
  const dates = enumerateIsoDates(opts.tripStart, opts.tripEnd);
  const attractions = extractCuratedAttractionsFromToolLogs(toolLogs, {
    destination: opts.destination,
  });
  const dest = opts.destination?.trim() || "目的地";
  const crossCity =
    Boolean(opts.origin?.trim()) &&
    Boolean(opts.destination?.trim()) &&
    !citiesMatch(opts.origin, opts.destination);

  if (dates.length === 0) {
    return buildSingleDayItinerary(attractions, dest);
  }

  const pool = buildOrderedAttractionPool(attractions);
  const usedGlobal = new Set<string>();

  return dates.map((dateIso, dayIndex) => {
    const usedToday = new Set<string>();
    const activities: TripPlanDay["activities"] = { morning: [], afternoon: [], evening: [] };

    const assignNeighborhood = (slot: "morning" | "afternoon" | "evening", offset: number) => {
      const explore = describeNeighborhoodExplore(dest, dayIndex + offset, {
        coupleRomantic: opts.skillHints?.isCoupleRomantic,
      });
      activities[slot] = [{ itineraryItem: explore.title, briefDescription: explore.description }];
    };

    const assignFromPool = (
      slot: "morning" | "afternoon" | "evening",
      role: "main" | "companion" | "indoor-fallback" | "evening-stroll"
    ): boolean => {
      const place = takeFromPool(pool, usedGlobal, usedToday);
      if (!place) return false;
      activities[slot] = [buildActivity(place, slot, role)];
      return true;
    };

    if (dayIndex === 0 && crossCity) {
      activities.morning = [
        {
          itineraryItem: `${opts.origin}出发 · 抵达${dest}`,
          briefDescription: describeCrossCityArrival(opts.origin!, dest),
        },
      ];
      if (!assignFromPool("afternoon", "main")) assignNeighborhood("afternoon", 0);
      if (!assignFromPool("evening", "companion")) assignNeighborhood("evening", 1);
    } else {
      if (!assignFromPool("morning", "main")) assignNeighborhood("morning", 0);

      if (opts.pace === "fast") {
        if (!assignFromPool("afternoon", "companion")) assignNeighborhood("afternoon", 1);
        if (!assignFromPool("evening", "evening-stroll")) assignNeighborhood("evening", 2);
      } else {
        if (!assignFromPool("afternoon", "companion")) assignNeighborhood("afternoon", 1);
        if (!assignFromPool("evening", "evening-stroll")) assignNeighborhood("evening", 2);
      }
    }

    return {
      title: `Day ${dayIndex + 1}`,
      dateIso,
      activities,
    };
  });
}

function buildSingleDayItinerary(places: CuratedAttraction[], dest: string): TripPlanDay[] {
  const [a, b, c] = places;
  return [
    {
      title: "Day 1",
      activities: {
        morning: a
          ? [buildActivity(a, "morning", "main")]
          : [
              {
                itineraryItem: `${dest}城区`,
                briefDescription: describeNeighborhoodExplore(dest, 0).description,
              },
            ],
        afternoon: b ? [buildActivity(b, "afternoon", "companion")] : [],
        evening: c ? [buildActivity(c, "evening", "evening-stroll")] : [],
      },
    },
  ];
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
  const curated = extractCuratedAttractionsFromToolLogs(toolLogs, { destination });
  if (curated.length > 0) {
    return curated.slice(0, 6).map((p) => p.name);
  }
  return destination ? [`${destination}城市漫游`, `${destination}美食体验`] : ["城市漫游"];
}

export function countTripDays(tripStart?: string, tripEnd?: string): number {
  const dates = enumerateIsoDates(tripStart, tripEnd);
  return Math.max(1, dates.length);
}

/** 按出行天数生成主题：主题数量与天数一致，每天一个主题 */
export function buildThemeHighlightsFromToolLogs(
  toolLogs: ToolLogEntry[],
  destination?: string,
  opts?: { tripStart?: string; tripEnd?: string; skillHints?: SkillTripHints }
): TripPlanThemeHighlight[] {
  const curated = extractCuratedAttractionsFromToolLogs(toolLogs, { destination });
  const dest = destination || "目的地";
  const city = dest.replace(/市$/u, "");
  const dayCount = countTripDays(opts?.tripStart, opts?.tripEnd);
  const pool = buildOrderedAttractionPool(curated);

  const romantic = opts?.skillHints?.isCoupleRomantic;

  if (curated.length === 0) {
    return Array.from({ length: dayCount }, (_, i) => ({
      title: romantic
        ? `Day ${i + 1} · ${city}二人慢游`
        : `Day ${i + 1} · ${city}漫游`,
      description: romantic
        ? `在${city}把第 ${i + 1} 天留给彼此：选 1 个心动点位深游，黄昏留 40 分钟并肩散步，再找一家景观或巷弄小馆慢慢吃。`
        : `在${city}按当日天气与体力安排 1～2 个重点，留足用餐与通勤缓冲；第 ${i + 1} 天可侧重不同片区，避免重复奔波。`,
      highlights: romantic
        ? ["黄金时段优先户外/河景", "热门店提前电话确认", "留一段无日程的二人空白"]
        : ["结合上方逐日天气调整户外时长", "热门景点建议预约或错峰"],
    }));
  }

  const themes: TripPlanThemeHighlight[] = [];
  const used = new Set<string>();

  for (let i = 0; i < dayCount; i++) {
    const dayPlaces: CuratedAttraction[] = [];
    for (let j = 0; j < 2; j++) {
      const next = pool.find((a) => {
        const key = normalizeVenueKey(a.name);
        return !used.has(key);
      });
      if (!next) break;
      used.add(normalizeVenueKey(next.name));
      dayPlaces.push(next);
    }

    if (dayPlaces.length === 0) {
      const explore = describeNeighborhoodExplore(city, i, { coupleRomantic: romantic });
      themes.push({
        title: `Day ${i + 1} · ${explore.title.replace(`${city} · `, "")}`,
        description: explore.description,
        highlights: romantic
          ? ["黄昏光线最柔，适合并肩拍照", "选河景/小馆而非赶场打卡"]
          : ["按当日天气灵活调整", "留 30～60 分钟自由漫步"],
      });
      continue;
    }

    const primary = dayPlaces[0];
    const spot = describeAttractionSpotlight(primary);
    const kind =
      i === 0 && pool.some((a) => ARRIVAL_CLUSTER.test(`${a.name}${a.searchKeywords ?? ""}`))
        ? "arrival"
        : primary.category === "indoor" || primary.category === "commercial"
          ? "indoor"
          : "landmarks";

    const romanticTail = romantic
      ? " 傍晚留一段只属于两个人的河景或街巷慢行，比多赶一个景点更值钱。"
      : " 节奏宜慢，把意外遇见当作旅途彩蛋。";

    themes.push({
      title:
        i === 0
          ? `Day ${i + 1} · ${buildThemeTitle(kind === "arrival" ? "arrival" : "landmarks", dest).replace(/^初识\s/u, "初识·")}`
          : `Day ${i + 1} · ${primary.name.replace(/景区$/u, "")}${romantic ? " · 二人时光" : ""}`,
      description: `${spot.tagline}。${spot.experience} 第 ${i + 1} 天以 ${dayPlaces.map((p) => p.name).join("、")} 为主线。${romanticTail}`,
      places: dayPlaces.map((p) => p.name),
      highlights: buildThemePlaceHighlights(dayPlaces),
    });
  }

  return themes;
}

export function isDegradedFallbackPlan(plan: TripPlanDocument): boolean {
  return /降级模板|请查看推理轨迹/.test(plan.tipsAndDisclaimer ?? "");
}
