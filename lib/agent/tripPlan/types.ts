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
}

export interface TripPlanFoodRecommendation {
  name: string;
  description: string;
  imageUrl?: string;
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
  packingChecklist?: string[];
}

export interface RunDoneTravelOutput {
  chatReply: string;
  tripPlan: TripPlanDocument;
}
