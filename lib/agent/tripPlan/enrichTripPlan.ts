import type { AgentRunInput } from "../contracts";
import type { ToolName } from "../contracts";
import type {
  TripPlanDocument,
  TripPlanFoodRecommendation,
  TripPlanThemeHighlight,
} from "./types";
import {
  buildFoodBudgetFromPreferences,
  buildTransportBundleFromToolLogs,
  buildWeatherAdviceFromToolLogs,
  extractFoodFromPoiSearch,
  extractPlacesFromToolLogs,
  parseDailyWeatherFromToolLogs,
} from "./buildFromToolLogs";
import { isPlaceholderText, stripPlaceholderText } from "./displayText";

type ToolLogEntry = { stepId: string; toolName: ToolName; summary: string };

const THEME_COPY: Record<string, { blurb: string; highlights: string[] }> = {
  海滨浪漫: {
    blurb: "沿情侣路、香炉湾等海岸线安排晨昏漫步，预留拍照与休憩时间，雨天可改室内观景或咖啡馆。",
    highlights: ["黄昏时段优先海滨步道", "步行段控制在舒适距离内", "备轻便外套应对海风"],
  },
  自然海岸线: {
    blurb: "串联沙滩、渔女雕像与滨海公园，结合潮汐与天气选择户外或半户外动线。",
    highlights: ["赤足沙滩体验宜选傍晚", "雷阵雨前后缩短户外停留", "注意防晒与补水"],
  },
  城市慢生活: {
    blurb: "在老街、滨海商圈与公共艺术空间之间慢节奏穿行，穿插本地餐饮与市集。",
    highlights: ["上午避开人流高峰", "午间安排室内或 shaded 区域", "留足自由漫步缓冲"],
  },
  清真友好旅行: {
    blurb: "餐饮优先选择明确标注清真或可提供清真选项的门店，行程中预留用餐弹性。",
    highlights: ["提前确认餐厅认证情况", "携带备选零食", "避开含酒精的伴手礼"],
  },
};

function buildThemeHighlights(
  input: AgentRunInput,
  toolLogs: ToolLogEntry[],
  plan: TripPlanDocument
): TripPlanThemeHighlight[] {
  const places = [
    ...new Set([
      ...extractPlacesFromToolLogs(toolLogs).map((p) => p.name),
      ...(plan.topPlacesToVisit?.map((p) => p.name) ?? []),
    ]),
  ];
  const themes = input.context.preferences.travelThemes ?? [];
  const dest = input.context.preferences.destination || plan.meta.destination || "目的地";

  if (themes.length > 0) {
    return themes.map((title, i) => {
      const preset = THEME_COPY[title];
      const themePlaces = places.slice(i * 2, i * 2 + 4);
      const dayActs = collectDayActivities(plan, i);
      return {
        title,
        description: preset?.blurb ?? buildThemeDescription(title, dest, places, plan.itinerary, i),
        places: themePlaces.length > 0 ? themePlaces : places.slice(0, 3),
        highlights: preset?.highlights ?? dayActs.slice(0, 3),
      };
    });
  }

  if (places.length > 0) {
    return [
      {
        title: `${dest}精选线路`,
        description: `以 ${places.slice(0, 3).join("、")} 为核心节点，按日程步行或短途接驳串联，兼顾经典打卡与休闲节奏。`,
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

/** LLM 输出后，用工具观测补全天气/交通/美食等 */
export function enrichTripPlanWithToolData(
  plan: TripPlanDocument,
  toolLogs: ToolLogEntry[],
  input: AgentRunInput
): TripPlanDocument {
  const prefs = input.context.preferences;
  const dailyWeather =
    plan.dailyWeather?.length ? plan.dailyWeather : parseDailyWeatherFromToolLogs(toolLogs);

  let weatherAdvice = stripPlaceholderText(plan.weatherAdvice);
  if (isPlaceholderText(weatherAdvice)) {
    weatherAdvice = buildWeatherAdviceFromToolLogs(dailyWeather);
  }

  let weatherTips = stripPlaceholderText(plan.weatherTips);
  if (isPlaceholderText(weatherTips)) {
    weatherTips = weatherAdvice || buildWeatherAdviceFromToolLogs(dailyWeather);
  }

  const transportBundle = buildTransportBundleFromToolLogs(toolLogs, {
    originCity: prefs.originCity ?? plan.meta.origin,
    destination: prefs.destination ?? plan.meta.destination,
  });
  let transport = stripPlaceholderText(plan.transport);
  let transportSegments = plan.transportSegments?.length ? plan.transportSegments : undefined;
  if (transportBundle.segments.length > 0) {
    transportSegments = transportBundle.segments;
    transport = transportBundle.summary;
  } else if (isPlaceholderText(transport)) {
    transport = transportBundle.summary;
  }

  const poiFood = extractFoodFromPoiSearch(toolLogs);
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
      destination: prefs.destination ?? plan.meta.destination,
      budgetCny: prefs.budgetCny,
      dietaryPreset: prefs.dietaryPreset,
    });
  }

  let themeHighlights = plan.themeHighlights?.filter((t) => t.title && t.description);
  if (!themeHighlights?.length || themeHighlights.every((t) => t.description.length < 16)) {
    themeHighlights = buildThemeHighlights(input, toolLogs, plan);
  } else {
    themeHighlights = themeHighlights.map((t, i) => ({
      ...t,
      places: t.places?.length
        ? t.places
        : extractPlacesFromToolLogs(toolLogs)
            .slice(i * 2, i * 2 + 4)
            .map((p) => p.name),
      highlights: t.highlights?.length ? t.highlights : collectDayActivities(plan, i).slice(0, 2),
    }));
  }

  const themesAndPlaces =
    themeHighlights.length > 0 ? themeHighlights.map((t) => t.title) : plan.themesAndPlaces;

  let topPlacesToVisit = plan.topPlacesToVisit?.length
    ? plan.topPlacesToVisit
    : extractPlacesFromToolLogs(toolLogs);

  return {
    ...plan,
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
    tipsAndDisclaimer: plan.tipsAndDisclaimer || "",
  };
}

export { isPlaceholderText, stripPlaceholderText } from "./displayText";
