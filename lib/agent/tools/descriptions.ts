import { TOOL_NAMES, type ToolName } from "../contracts";

/** 各工具依赖的环境变量（供设置页只读展示） */
export const TOOL_ENV_REQUIREMENTS: Record<
  ToolName,
  { envKeys: string[]; label: string }
> = {
  weather_forecast: {
    envKeys: ["QWEATHER_API_KEY", "QWEATHER_API_HOST"],
    label: "和风天气",
  },
  maps_route_estimate: {
    envKeys: ["AMAP_WEBSERVICE_KEY"],
    label: "高德 Web 服务",
  },
  poi_search: {
    envKeys: ["AMAP_WEBSERVICE_KEY"],
    label: "高德 POI 检索",
  },
  rail_schedule_hint: {
    envKeys: ["ALIYUN_RAIL_APPCODE"],
    label: "阿里云云市场火车查询（cmapi033685）",
  },
};

/** LLM 选型用 description（集中维护，stubTools 引用） */
export const TOOL_LLM_DESCRIPTIONS: Record<ToolName, string> = {
  weather_forecast:
    "和风天气：查询城市实时天气、7/15/30 日逐日预报（含降水 mm）、weekOutlookText；可选 AQI。参数 city 必填；dateIso 可选（YYYY-MM-DD，须在 30 日内）。不能返回逐小时降水概率或超 30 日指定日预报。",
  maps_route_estimate:
    "高德路径规划：同城 POI 间 walking/transit/driving 距离与耗时粗估。origin/destination 须「城市+具体 POI」。不适用跨城高铁枢纽 transit、12306 时刻。跨城 transit 失败时会降级 driving。",
  poi_search:
    "高德 POI 关键词检索：按城市+关键词搜索景点、餐饮、酒店等，返回结构化列表（名称、地址、类型、坐标）。适用于规划阶段收集候选 POI，参数 keywords 与 city 均必填。",
  rail_schedule_hint:
    "阿里云云市场火车查询（cmapi033685）：按起讫站名与可选 dateIso（YYYY-MM-DD）查询车次、时刻、历时、席别票价与余票概况。参数 originCity/destinationCity 建议用中文站名（如「南京南」「上海虹桥」）。含免责声明，购票以 12306 为准。",
};

/** 工具中文展示名 */
export const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
  weather_forecast: "天气预报",
  maps_route_estimate: "路线耗时估算",
  poi_search: "POI 景点检索",
  rail_schedule_hint: "铁路车次查询",
};

export function buildToolsPromptSection(names?: ToolName[]): string {
  const list = names?.length ? names : [...TOOL_NAMES];
  return list
    .map((name) => `- ${name}：${TOOL_LLM_DESCRIPTIONS[name]}`)
    .join("\n");
}

export function formatAllowedToolsList(names?: ToolName[]): string {
  const list = names?.length ? names : [...TOOL_NAMES];
  return list.join("、");
}
