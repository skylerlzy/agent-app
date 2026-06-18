import type { AgentRunInput } from "../contracts";
import type {
  TripPlanDocument,
  TripPlanFoodRecommendation,
  TripPlanThemeHighlight,
} from "./types";
import {
  buildFoodBudgetFromPreferences,
  buildItineraryFromToolLogs,
  buildPackingChecklistFromWeather,
  buildTransportBundleFromToolLogs,
  buildWeatherAdviceFromToolLogs,
  extractAttractionsFromPoiSearch,
  extractFoodFromPoiSearch,
  parseDailyWeatherFromToolLogs,
} from "./buildFromToolLogs";
import { isPlaceholderText, stripPlaceholderText } from "./displayText";
import {
  filterToolLogsForTrip,
  placeLooksLikeWrongCity,
  resolveTripContext,
  topPlacesMatchDestination,
  weatherMatchesTrip,
  type ToolLogEntry,
} from "./tripContext";
import { TRAVEL_THEME_OPTIONS } from "@/lib/tripPreferenceOptions";

const THEME_COPY: Record<string, { blurb: (dest: string) => string; highlights: string[] }> = {
  historical: {
    blurb: (dest) =>
      `在${dest}串联故宫、长城、胡同或同类史迹，上午参观、午后博物馆室内备选，雨天可改展陈类景点。`,
    highlights: ["热门史迹建议预约或错峰", "穿舒适步行鞋", "留意闭馆日与最后入场时间"],
  },
  adventure: {
    blurb: (dest) =>
      `在${dest}安排 1～2 段户外体验（徒步、骑行或近郊自然点），结合天气控制强度并备补给。`,
    highlights: ["雷雨或高温日缩短户外", "携带水与基础急救用品", "提前确认开放与装备要求"],
  },
  culture: {
    blurb: (dest) =>
      `在${dest}体验本地人文：街区漫步、非遗展示、演出或市集，穿插咖啡馆休整。`,
    highlights: ["傍晚街区氛围更佳", "演出/展览提前查场次", "尊重当地礼仪与拍照规定"],
  },
  beaches: {
    blurb: (dest) =>
      `在${dest}安排滨海或水岸漫步，预留黄昏拍照时间；降水日改室内观景或商圈。`,
    highlights: ["备防晒与轻便外套", "关注潮汐与风况", "沙滩活动注意安全警示"],
  },
  nightlife: {
    blurb: (dest) =>
      `在${dest}把夜间时段留给灯光秀、滨江步道或特色街区，控制返程交通与安全。`,
    highlights: ["热门区域 18:30 前到店", "夜间打车预留缓冲", "避免深夜偏僻路段"],
  },
  nature: {
    blurb: (dest) =>
      `在${dest}选择公园、山岳或湿地等自然点位，按节奏安排 1～2 个重点并留足缓冲。`,
    highlights: ["晨间或傍晚体感更舒适", "备驱蚊与雨具", "遵守保护区规定"],
  },
  shopping: {
    blurb: (dest) =>
      `在${dest}串联商圈、特色市集与伴手礼店，与正餐时段错开以提升体验。`,
    highlights: ["理性消费、比价", "大件行李考虑快递", "节假日商场人流大"],
  },
  halal: {
    blurb: (dest) =>
      `在${dest}优先选择明确清真或可提供清真选项的门店，行程中预留用餐弹性。`,
    highlights: ["到店前电话确认", "携带备选零食", "避开含酒精伴手礼"],
  },
};

function themeLabel(id: string): string {
  return TRAVEL_THEME_OPTIONS.find((t) => t.id === id)?.label ?? id;
}

function buildThemeHighlights(
  input: AgentRunInput,
  toolLogs: ToolLogEntry[],
  plan: TripPlanDocument,
  ctx: ReturnType<typeof resolveTripContext>
): TripPlanThemeHighlight[] {
  const places = [
    ...new Set([
      ...extractAttractionsFromPoiSearch(toolLogs, { destination: ctx.destination }).map(
        (p) => p.name
      ),
      ...(plan.topPlacesToVisit?.map((p) => p.name) ?? []),
    ]),
  ].filter((name) => !placeLooksLikeWrongCity(name, ctx.destination));
  const themes = input.context.preferences.travelThemes ?? [];
  const dest = ctx.destination || plan.meta.destination || "目的地";

  if (themes.length > 0) {
    return themes.map((id, i) => {
      const preset = THEME_COPY[id];
      const title = themeLabel(id);
      const themePlaces = places.slice(i * 2, i * 2 + 4);
      const dayActs = collectDayActivities(plan, i);
      return {
        title,
        description: preset?.blurb(dest) ?? buildThemeDescription(title, dest, places, plan.itinerary, i),
        places: themePlaces.length > 0 ? themePlaces : places.slice(0, 3),
        highlights: preset?.highlights ?? dayActs.slice(0, 3),
      };
    });
  }

  if (places.length > 0) {
    return [
      {
        title: `${dest}精选线路`,
        description: `以 ${places.slice(0, 3).join("、")} 为核心节点，按日程串联${dest}内经典与休闲点位，兼顾打卡与留白。`,
        places: places.slice(0, 6),
        highlights: [
          "参考右侧地图查看节点分布",
          "结合天气预报调整户外时长",
          "热门时段可错峰出行",
        ],
      },
    ];
  }

  return plan.themesAndPlaces.map((title) => ({
    title,
    description: `在${dest}深度体验「${title}」，建议结合下方按日行程与地图安排 1～2 个重点时段。`,
    highlights: ["可追问 Agent 细化某一天的安排"],
  }));
}

function collectDayActivities(plan: TripPlanDocument, dayIndex: number): string[] {
  const day = plan.itinerary[dayIndex];
  if (!day) return [];
  return [...day.activities.morning, ...day.activities.afternoon, ...day.activities.evening].map(
    (a) => `${a.itineraryItem}：${a.briefDescription.slice(0, 36)}`
  );
}

function buildThemeDescription(
  theme: string,
  dest: string,
  places: string[],
  itinerary: TripPlanDocument["itinerary"],
  index: number
): string {
  const spot = places[index] ?? places[0];
  const dayHint = itinerary[index]?.activities.morning[0]?.itineraryItem;
  const parts = [`在${dest}围绕「${theme}」设计体验动线`];
  if (spot) parts.push(`推荐串联 ${spot} 及周边`);
  if (dayHint) parts.push(`Day ${index + 1} 可重点安排 ${dayHint}`);
  parts.push("具体时段与交通见日程与地图。");
  return parts.join("，") + "。";
}

function parseFoodItem(raw: string): TripPlanFoodRecommendation {
  const cleaned = raw.replace(/^🍜\s*/, "").trim();
  const paren = cleaned.match(/^(.+?)（(.+)）$/);
  if (paren) {
    return { name: paren[1].trim(), description: paren[2].trim() };
  }
  return { name: cleaned.slice(0, 24), description: cleaned };
}

function mergeFoodRecommendations(
  primary: TripPlanFoodRecommendation[],
  fromPoi: TripPlanFoodRecommendation[]
): TripPlanFoodRecommendation[] {
  const seen = new Set<string>();
  const merged: TripPlanFoodRecommendation[] = [];
  for (const item of [...primary, ...fromPoi]) {
    if (!item.name?.trim() || seen.has(item.name)) continue;
    seen.add(item.name);
    merged.push(item);
    if (merged.length >= 6) break;
  }
  return merged;
}

function itineraryLooksWrong(plan: TripPlanDocument, ctx: ReturnType<typeof resolveTripContext>): boolean {
  if (!ctx.destination) return false;
  const items = plan.itinerary.flatMap((d) => [
    ...d.activities.morning,
    ...d.activities.afternoon,
    ...d.activities.evening,
  ]);
  if (items.length === 0) return true;
  return items.some((a) => placeLooksLikeWrongCity(a.itineraryItem, ctx.destination));
}

/** LLM 输出后，用与目的地/日期匹配的工具观测补全天气/交通/美食等 */
export function enrichTripPlanWithToolData(
  plan: TripPlanDocument,
  toolLogs: ToolLogEntry[],
  input: AgentRunInput
): TripPlanDocument {
  const ctx = resolveTripContext(input, plan);
  const filteredLogs = filterToolLogsForTrip(toolLogs, ctx);
  const dest = ctx.destination ?? plan.meta.destination;

  const toolWeather = parseDailyWeatherFromToolLogs(filteredLogs, {
    destination: dest,
    tripStart: ctx.tripStart,
    tripEnd: ctx.tripEnd,
  });

  let dailyWeather = plan.dailyWeather?.length && weatherMatchesTrip(plan.dailyWeather, ctx)
    ? plan.dailyWeather
    : toolWeather;
  if (dailyWeather.length === 0 && toolWeather.length > 0) dailyWeather = toolWeather;

  let weatherAdvice = stripPlaceholderText(plan.weatherAdvice);
  if (isPlaceholderText(weatherAdvice) || !weatherMatchesTrip(
    dailyWeather.map((d) => ({ ...d, summary: d.summary })),
    ctx
  )) {
    weatherAdvice = buildWeatherAdviceFromToolLogs(dailyWeather);
  }

  let weatherTips = stripPlaceholderText(plan.weatherTips);
  if (isPlaceholderText(weatherTips)) {
    weatherTips = weatherAdvice || buildWeatherAdviceFromToolLogs(dailyWeather);
  }

  const transportBundle = buildTransportBundleFromToolLogs(filteredLogs, {
    originCity: ctx.origin ?? plan.meta.origin,
    destination: dest,
  });
  let transport = stripPlaceholderText(plan.transport);
  let transportSegments = plan.transportSegments?.filter((s) => s.category === "intercity");
  if (transportBundle.segments.length > 0) {
    transportSegments = transportBundle.segments;
    transport = transportBundle.summary;
  } else if (isPlaceholderText(transport)) {
    transport = transportBundle.summary;
    transportSegments = transportBundle.segments.length ? transportBundle.segments : transportSegments;
  }

  const poiFood = extractFoodFromPoiSearch(filteredLogs, { destination: dest });
  let foodRecommendations = mergeFoodRecommendations(
    plan.foodRecommendations?.filter((f) => f.name && f.description) ?? [],
    poiFood
  );
  if (!foodRecommendations.length && plan.localCuisine?.length) {
    foodRecommendations = plan.localCuisine.map(parseFoodItem);
  }

  let foodAndBudget = stripPlaceholderText(plan.foodAndBudget);
  if (!foodAndBudget && foodRecommendations.length > 0) {
    foodAndBudget = buildFoodBudgetFromPreferences({
      destination: dest,
      budgetCny: input.context.preferences.budgetCny,
      dietaryPreset: input.context.preferences.dietaryPreset,
    });
  }

  const poiPlaces = extractAttractionsFromPoiSearch(filteredLogs, { destination: dest });
  let topPlacesToVisit =
    plan.topPlacesToVisit?.length && topPlacesMatchDestination(plan.topPlacesToVisit, dest)
      ? plan.topPlacesToVisit
      : poiPlaces;

  let itinerary = plan.itinerary;
  if (
    (itineraryLooksWrong(plan, ctx) || !topPlacesMatchDestination(
      itinerary.flatMap((d) =>
        [...d.activities.morning, ...d.activities.afternoon, ...d.activities.evening].map((a) => ({
          name: a.itineraryItem,
        }))
      ),
      dest
    )) &&
    (poiPlaces.length > 0 || filteredLogs.length > 0)
  ) {
    itinerary = buildItineraryFromToolLogs(filteredLogs, {
      destination: dest,
      tripStart: ctx.tripStart ?? plan.meta.tripStart,
      tripEnd: ctx.tripEnd ?? plan.meta.tripEnd,
      pace: input.context.preferences.pace,
      origin: ctx.origin ?? plan.meta.origin,
    });
  }

  const planForThemes = { ...plan, itinerary, topPlacesToVisit };
  let themeHighlights = plan.themeHighlights?.filter((t) => t.title && t.description);
  if (!themeHighlights?.length || themeHighlights.every((t) => t.description.length < 16)) {
    themeHighlights = buildThemeHighlights(input, filteredLogs, planForThemes, ctx);
  } else {
    themeHighlights = themeHighlights.map((t, i) => ({
      ...t,
      places: t.places?.length
        ? t.places
        : poiPlaces.slice(i * 2, i * 2 + 4).map((p) => p.name),
      highlights: t.highlights?.length ? t.highlights : collectDayActivities(planForThemes, i).slice(0, 2),
    }));
  }

  const themesAndPlaces =
    themeHighlights.length > 0 ? themeHighlights.map((t) => t.title) : plan.themesAndPlaces;

  const packingChecklist =
    plan.packingChecklist?.length && plan.packingChecklist.length >= 3
      ? plan.packingChecklist
      : buildPackingChecklistFromWeather(dailyWeather, dest);

  return {
    ...plan,
    meta: {
      ...plan.meta,
      destination: dest ?? plan.meta.destination,
      origin: ctx.origin ?? plan.meta.origin,
      tripStart: ctx.tripStart ?? plan.meta.tripStart,
      tripEnd: ctx.tripEnd ?? plan.meta.tripEnd,
    },
    dailyWeather,
    weatherAdvice,
    weatherTips,
    transport,
    transportSegments,
    foodAndBudget,
    themesAndPlaces,
    themeHighlights,
    foodRecommendations,
    topPlacesToVisit,
    itinerary,
    packingChecklist,
    tipsAndDisclaimer: plan.tipsAndDisclaimer || "",
  };
}

export { isPlaceholderText, stripPlaceholderText } from "./displayText";
