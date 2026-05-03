/**
 * 与 travel-planner-ai Step2/Step3 对齐的可选项（纯数据，供 UI 与提示词引用）。
 */

export const TRAVEL_THEME_OPTIONS = [
  { id: "historical", label: "历史古迹" },
  { id: "adventure", label: "户外冒险" },
  { id: "culture", label: "人文体验" },
  { id: "beaches", label: "海滩度假" },
  { id: "nightlife", label: "城市夜生活" },
  { id: "nature", label: "自然景观" },
  { id: "shopping", label: "购物休闲" },
] as const;

export const TRAVEL_PACE_OPTIONS = [
  { id: "slow", label: "慢节奏", hint: "每天约 1–2 个重点" },
  { id: "balanced", label: "中等节奏", hint: "每天约 2–3 个重点" },
  { id: "fast", label: "快节奏", hint: "行程紧凑" },
] as const;

export const ACCOMMODATION_OPTIONS = [
  { id: "hotel", label: "星级酒店" },
  { id: "airbnb", label: "民宿 / 短租" },
  { id: "hostel", label: "青年旅舍" },
  { id: "camping", label: "户外露营" },
] as const;

export const DIETARY_PRESET_OPTIONS = [
  { id: "none", label: "无特殊饮食要求" },
  { id: "vegetarian", label: "素食" },
  { id: "halal", label: "清真" },
  { id: "local", label: "尽量当地特色" },
] as const;

export const TRANSPORT_OPTIONS = [
  { id: "Flights", label: "飞机" },
  { id: "Trains", label: "高铁 / 火车" },
  { id: "Buses", label: "大巴" },
  { id: "Road", label: "自驾 / 公路" },
] as const;

export const TRAVEL_PARTY_OPTIONS = [
  { id: "solo", label: "独自" },
  { id: "couple", label: "双人" },
  { id: "family", label: "家庭" },
  { id: "group", label: "小团 / 朋友" },
] as const;
