import type { AgentRunInput } from "../contracts";
import type {
  TripPlanDocument,
  TripPlanFoodRecommendation,
  TripPlanSkillMoment,
  TripPlanThemeHighlight,
} from "./types";
import {
  buildFoodBudgetFromPreferences,
  buildItineraryFromToolLogs,
  buildPackingChecklistFromWeather,
  buildThemeHighlightsFromToolLogs,
  buildTransportBundleFromToolLogs,
  buildWeatherAdviceFromToolLogs,
  buildWeatherAdviceItemsFromToolLogs,
  countTripDays,
  ensureFoodRecommendations,
  extractAttractionsFromPoiSearch,
  extractCuratedAttractionsFromToolLogs,
  extractFoodFromPoiSearch,
  isTemplateFoodName,
  itineraryHasQualityIssues,
  itineraryLooksMonotonous,
  parseDailyWeatherFromToolLogs,
  topPlacesLookMonotonous,
} from "./buildFromToolLogs";
import { isPlaceholderText, stripPlaceholderText } from "./displayText";
import {
  resolveSkillTripHints,
  skillMomentSectionTitle,
} from "./skillTripContext";
import {
  themeCountMismatch,
} from "./tripPlanNarrativeEnrichment";
import {
  filterToolLogsForTrip,
  placeLooksLikeWrongCity,
  resolveTripContext,
  topPlacesMatchDestination,
  weatherMatchesTrip,
  type ToolLogEntry,
} from "./tripContext";
import { TRAVEL_THEME_OPTIONS } from "../../tripPreferenceOptions";

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
      ...extractCuratedAttractionsFromToolLogs(toolLogs, { destination: ctx.destination }).map(
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
    const skillHints = resolveSkillTripHints(input);
    const toolThemes = buildThemeHighlightsFromToolLogs(toolLogs, dest, {
      tripStart: ctx.tripStart,
      tripEnd: ctx.tripEnd,
      skillHints,
    });
    if (toolThemes.length > 0) return toolThemes;

    return [
      {
        title: `${dest}精选线路`,
        description: `以 ${places.slice(0, 3).join("、")} 为核心节点，按日程串联${dest}内经典与休闲点位；${places.length > 3 ? `还可延展至 ${places.slice(3, 5).join("、")} 等。` : "每日 1～2 个重点，避免过度奔波。"}`,
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

const TEMPLATE_RE =
  /比打卡十张合影更像旅行|把时钟调慢半格|本地老字号小吃|待根据工具数据补充|请查看推理轨迹/;

function llmThemesAreUsable(plan: TripPlanDocument, input: AgentRunInput): boolean {
  const themes = plan.themeHighlights;
  if (!themes?.length) return false;
  if (themeCountMismatch(plan, input)) return false;
  return themes.every(
    (t) => t.title && t.description.length >= 40 && !TEMPLATE_RE.test(t.description)
  );
}

function llmItineraryIsUsable(plan: TripPlanDocument): boolean {
  for (const day of plan.itinerary) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const act of day.activities[slot]) {
        if (act.briefDescription.length < 28 || TEMPLATE_RE.test(act.briefDescription)) return false;
        if (/气温|AQI|PM2\.5|降水量/.test(act.briefDescription)) return false;
      }
    }
  }
  return plan.itinerary.length > 0;
}

function buildDefaultSkillMoments(
  plan: TripPlanDocument,
  input: AgentRunInput
): TripPlanSkillMoment[] | undefined {
  const hints = resolveSkillTripHints(input);
  if (!hints.requiresSkillMoments) return undefined;
  if (plan.skillMoments?.length) return plan.skillMoments;

  const sectionTitle = skillMomentSectionTitle(hints);
  return plan.itinerary.slice(0, 3).map((day, i) => {
    const evening = day.activities.evening[0];
    const afternoon = day.activities.afternoon[0];
    const anchor = evening?.itineraryItem ?? afternoon?.itineraryItem ?? day.title;
    return {
      dayLabel: day.dateIso ? `Day ${i + 1} · ${day.dateIso}` : day.title,
      title: `${sectionTitle} · ${day.title}`,
      description: hints.isCoupleRomantic
        ? `建议 ${17 + (i % 2)}:30 前后在 ${anchor} 一带散步，黄昏光线最柔；之后留 40～60 分钟二人自由时间，不赶下一场。`
        : `第 ${i + 1} 天午后安排低强度活动，${anchor} 附近预留休息与亲子互动时间。`,
      tips: hints.isCoupleRomantic
        ? ["可备拍立得或手写小卡片", "热门店建议提前电话确认"]
        : ["携带儿童证件与备用零食", "留意母婴室与无障碍通道"],
    };
  });
}

/** LLM 输出后，用与目的地/日期匹配的工具观测补全天气/交通/美食等 */
export function enrichTripPlanWithToolData(
  plan: TripPlanDocument,
  toolLogs: ToolLogEntry[],
  input: AgentRunInput,
  options?: { narrativeLocked?: boolean }
): TripPlanDocument {
  const narrativeLocked = options?.narrativeLocked ?? false;
  const ctx = resolveTripContext(input, plan);
  const filteredLogs = filterToolLogsForTrip(toolLogs, ctx);
  const dest = ctx.destination ?? plan.meta.destination;
  const skillHints = resolveSkillTripHints(input);
  const effectivePace =
    input.context.preferences.pace ?? skillHints.suggestedPace ?? "balanced";

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

  const weatherAdviceItems =
    plan.weatherAdviceItems?.length && plan.weatherAdviceItems.length >= 2
      ? plan.weatherAdviceItems
      : buildWeatherAdviceItemsFromToolLogs(dailyWeather);

  let weatherTips = stripPlaceholderText(plan.weatherTips);
  if (isPlaceholderText(weatherTips)) {
    weatherTips = weatherAdvice || buildWeatherAdviceFromToolLogs(dailyWeather);
  }

  const transportBundle = buildTransportBundleFromToolLogs(filteredLogs, {
    originCity: ctx.origin ?? plan.meta.origin,
    destination: dest,
    tripStart: ctx.tripStart ?? plan.meta.tripStart,
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
  let foodRecommendations = narrativeLocked &&
    plan.foodRecommendations?.some((f) => f.name && !isTemplateFoodName(f.name))
    ? plan.foodRecommendations
    : ensureFoodRecommendations(
        filteredLogs,
        dest,
        input.context.preferences.dietaryPreset,
        mergeFoodRecommendations(
          plan.foodRecommendations?.filter((f) => f.name && f.description) ?? [],
          poiFood
        )
      );
  if (!foodRecommendations.length && plan.localCuisine?.length) {
    foodRecommendations = ensureFoodRecommendations(
      filteredLogs,
      dest,
      input.context.preferences.dietaryPreset,
      plan.localCuisine.map(parseFoodItem)
    );
  }

  let foodAndBudget = stripPlaceholderText(plan.foodAndBudget);
  if (
    narrativeLocked &&
    plan.foodAndBudget?.trim() &&
    foodRecommendations.some((f) => !isTemplateFoodName(f.name))
  ) {
    foodAndBudget = plan.foodAndBudget;
  } else if (
    !foodAndBudget ||
    foodRecommendations.some((f) => !plan.foodRecommendations?.find((p) => p.name === f.name))
  ) {
    foodAndBudget = buildFoodBudgetFromPreferences({
      destination: dest,
      budgetCny: input.context.preferences.budgetCny,
      dietaryPreset: input.context.preferences.dietaryPreset,
      restaurants: foodRecommendations,
    });
  }

  const poiPlaces = extractCuratedAttractionsFromToolLogs(filteredLogs, { destination: dest }).map(
    ({ name, coordinates }) => ({ name, coordinates })
  );
  let topPlacesToVisit =
    plan.topPlacesToVisit?.length &&
    topPlacesMatchDestination(plan.topPlacesToVisit, dest) &&
    !topPlacesLookMonotonous(plan.topPlacesToVisit)
      ? plan.topPlacesToVisit
      : poiPlaces;

  let itinerary = plan.itinerary;
  const shouldRebuildItinerary =
    !narrativeLocked &&
    !llmItineraryIsUsable(plan) &&
    (itineraryLooksWrong(plan, ctx) ||
      itineraryLooksMonotonous(plan) ||
      itineraryHasQualityIssues(plan) ||
      !topPlacesMatchDestination(
        itinerary.flatMap((d) =>
          [...d.activities.morning, ...d.activities.afternoon, ...d.activities.evening].map((a) => ({
            name: a.itineraryItem,
          }))
        ),
        dest
      ));

  if (shouldRebuildItinerary && (poiPlaces.length > 0 || filteredLogs.length > 0)) {
    itinerary = buildItineraryFromToolLogs(filteredLogs, {
      destination: dest,
      tripStart: ctx.tripStart ?? plan.meta.tripStart,
      tripEnd: ctx.tripEnd ?? plan.meta.tripEnd,
      pace: effectivePace,
      origin: ctx.origin ?? plan.meta.origin,
      skillHints,
    });
  }

  const planForThemes = { ...plan, itinerary, topPlacesToVisit };
  const tripDayCount = countTripDays(ctx.tripStart ?? plan.meta.tripStart, ctx.tripEnd ?? plan.meta.tripEnd);
  let themeHighlights = plan.themeHighlights?.filter((t) => t.title && t.description);
  const themesLookThin =
    !narrativeLocked &&
    !llmThemesAreUsable(plan, input) &&
    (!themeHighlights?.length ||
      themeHighlights.length !== tripDayCount ||
      themeHighlights.every((t) => t.description.length < 40) ||
      themeHighlights.some((t) => (t.highlights?.length ?? 0) < 1));

  if (
    !narrativeLocked &&
    !llmThemesAreUsable(plan, input) &&
    (themesLookThin || (themeHighlights?.length ?? 0) !== tripDayCount)
  ) {
    themeHighlights = buildThemeHighlightsFromToolLogs(filteredLogs, dest, {
      tripStart: ctx.tripStart ?? plan.meta.tripStart,
      tripEnd: ctx.tripEnd ?? plan.meta.tripEnd,
      skillHints,
    });
  } else if (!themeHighlights?.length) {
    themeHighlights = buildThemeHighlights(input, filteredLogs, planForThemes, ctx);
  } else if ((themeHighlights?.length ?? 0) !== tripDayCount) {
    const rebuilt = buildThemeHighlightsFromToolLogs(filteredLogs, dest, {
      tripStart: ctx.tripStart ?? plan.meta.tripStart,
      tripEnd: ctx.tripEnd ?? plan.meta.tripEnd,
      skillHints,
    });
    themeHighlights =
      rebuilt.length === tripDayCount
        ? rebuilt
        : themeHighlights.slice(0, tripDayCount);
  } else {
    themeHighlights = themeHighlights.map((t, i) => ({
      ...t,
      places: t.places?.length
        ? t.places
        : poiPlaces.slice(i * 2, i * 2 + 4).map((p) => p.name),
      highlights: t.highlights?.length ? t.highlights : collectDayActivities(planForThemes, i).slice(0, 2),
    }));
  }

  const skillMoments =
    narrativeLocked && plan.skillMoments?.length
      ? plan.skillMoments
      : buildDefaultSkillMoments({ ...plan, itinerary, themeHighlights }, input);

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
    weatherAdviceItems,
    weatherTips,
    transport,
    transportSegments,
    foodAndBudget,
    themesAndPlaces,
    themeHighlights,
    foodRecommendations,
    skillMoments,
    topPlacesToVisit,
    itinerary,
    packingChecklist,
    tipsAndDisclaimer: plan.tipsAndDisclaimer || "",
  };
}

export { isPlaceholderText, stripPlaceholderText } from "./displayText";
