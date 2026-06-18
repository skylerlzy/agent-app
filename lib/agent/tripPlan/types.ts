/** 结构化全程出行方案（对齐 travel-planner-ai 展示模型 + 课程七段内容） */

export interface TripPlanActivity {
  itineraryItem: string;
  briefDescription: string;
}

export interface TripPlanDay {
  title: string;
  dateIso?: string;
  activities: {
    morning: TripPlanActivity[];
    afternoon: TripPlanActivity[];
    evening: TripPlanActivity[];
  };
}

export interface TripPlanPlace {
  name: string;
  coordinates?: { lat: number; lng: number };
}

/** 单次 poi_search 策展后的主景点（含检索上下文） */
export interface CuratedAttraction extends TripPlanPlace {
  searchKeywords?: string;
  address?: string;
  poiType?: string;
  category?: "outdoor" | "indoor" | "cultural" | "commercial";
}

export interface TripPlanDailyWeather {
  dateIso: string;
  city?: string;
  summary: string;
  tempMin?: number;
  tempMax?: number;
  precipMm?: number;
  aqi?: number;
  airQuality?: string;
}

export interface TripPlanThemeHighlight {
  title: string;
  description: string;
  places?: string[];
  /** 主题下的体验要点 */
  highlights?: string[];
}

/** 铁路车次摘要（由 rail_schedule_hint 策展，供 UI 卡片展示） */
export interface TripPlanRailOption {
  trainNo: string;
  trainType?: string;
  departStation: string;
  arriveStation: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  priceSecond?: string;
  priceFirst?: string;
  seatsAvailable?: string;
  /** 策展标签：最快 / 推荐 / 经济 */
  tag?: "最快" | "推荐" | "经济";
}

export interface TripPlanTransportSegment {
  /** 段落类型：跨城 / 市内 */
  category: "intercity" | "local";
  origin: string;
  destination: string;
  distanceKm?: number;
  durationMinutes?: number;
  mode?: string;
  /** 交通方式选择与耗时说明 */
  recommendation: string;
  /** 策展后的推荐车次（最多 3 条） */
  railOptions?: TripPlanRailOption[];
  /** 查询日期 YYYY-MM-DD */
  queryDateIso?: string;
  /** 接口返回总车次数 */
  totalTrains?: number;
}

export interface TripPlanFoodRecommendation {
  name: string;
  description: string;
  imageUrl?: string;
}

/** Skill 注入的专属体验高光（如情侣浪漫时刻） */
export interface TripPlanSkillMoment {
  dayLabel: string;
  title: string;
  description: string;
  tips?: string[];
}

export interface TripPlanDocument {
  version: 1;
  meta: {
    destination?: string;
    origin?: string;
    tripStart?: string;
    tripEnd?: string;
    routeLabel?: string;
  };
  overview: string;
  /** @deprecated 展示优先用 dailyWeather + weatherAdvice */
  weatherTips: string;
  /** 按日天气预报（来自 weather_forecast 工具） */
  dailyWeather?: TripPlanDailyWeather[];
  /** 着装与出行建议（综合多日天气） */
  weatherAdvice?: string;
  /** 分条着装建议（UI 展示） */
  weatherAdviceItems?: string[];
  transport: string;
  /** 分段交通（优先展示） */
  transportSegments?: TripPlanTransportSegment[];
  themesAndPlaces: string[];
  /** 主题详解（标题 + 说明 + 关联景点） */
  themeHighlights?: TripPlanThemeHighlight[];
  itinerary: TripPlanDay[];
  foodAndBudget: string;
  /** @deprecated UI 不再展示；保留 schema 兼容 */
  tipsAndDisclaimer: string;
  citations?: string[];
  topPlacesToVisit: TripPlanPlace[];
  adventuresActivities?: string[];
  localCuisine?: string[];
  /** 美食推荐卡片（含描述，可选配图） */
  foodRecommendations?: TripPlanFoodRecommendation[];
  /** Skill 专属体验高光（情侣浪漫、亲子友好等） */
  skillMoments?: TripPlanSkillMoment[];
  packingChecklist?: string[];
}

export interface RunDoneTravelOutput {
  chatReply: string;
  tripPlan: TripPlanDocument;
}
