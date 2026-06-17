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

export type PreferenceChipPalette = {
  emoji: string;
  idle: string;
  active: string;
};

/** 每个选项独立配色 + 表情，用于出行偏好标签 */
export const PREFERENCE_OPTION_PALETTES: Record<string, PreferenceChipPalette> = {
  // 旅行主题
  historical: {
    emoji: "🏛️",
    idle: "border-amber-600/30 bg-amber-500/[0.08] text-amber-950/85 hover:border-amber-600/45 hover:bg-amber-500/12",
    active:
      "border-amber-600/55 bg-gradient-to-r from-amber-400/25 via-amber-500/20 to-orange-400/20 text-amber-950 shadow-md shadow-amber-500/20",
  },
  adventure: {
    emoji: "🧗",
    idle: "border-orange-500/30 bg-orange-500/[0.08] text-orange-950/85 hover:border-orange-500/45 hover:bg-orange-500/12",
    active:
      "border-orange-500/55 bg-gradient-to-r from-orange-400/25 via-red-400/15 to-orange-500/20 text-orange-950 shadow-md shadow-orange-500/20",
  },
  culture: {
    emoji: "🎭",
    idle: "border-violet-500/30 bg-violet-500/[0.08] text-violet-950/85 hover:border-violet-500/45 hover:bg-violet-500/12",
    active:
      "border-violet-500/55 bg-gradient-to-r from-violet-400/25 via-purple-400/15 to-fuchsia-400/15 text-violet-950 shadow-md shadow-violet-500/20",
  },
  beaches: {
    emoji: "🏖️",
    idle: "border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-950/85 hover:border-cyan-500/45 hover:bg-cyan-500/12",
    active:
      "border-cyan-500/55 bg-gradient-to-r from-cyan-400/25 via-sky-400/20 to-blue-400/15 text-cyan-950 shadow-md shadow-cyan-500/20",
  },
  nightlife: {
    emoji: "🌃",
    idle: "border-indigo-500/30 bg-indigo-500/[0.08] text-indigo-950/85 hover:border-indigo-500/45 hover:bg-indigo-500/12",
    active:
      "border-indigo-500/55 bg-gradient-to-r from-indigo-400/25 via-violet-500/20 to-purple-500/15 text-indigo-950 shadow-md shadow-indigo-500/20",
  },
  nature: {
    emoji: "🌲",
    idle: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-950/85 hover:border-emerald-500/45 hover:bg-emerald-500/12",
    active:
      "border-emerald-500/55 bg-gradient-to-r from-emerald-400/25 via-green-400/20 to-lime-400/15 text-emerald-950 shadow-md shadow-emerald-500/20",
  },
  shopping: {
    emoji: "🛍️",
    idle: "border-rose-500/30 bg-rose-500/[0.08] text-rose-950/85 hover:border-rose-500/45 hover:bg-rose-500/12",
    active:
      "border-rose-500/55 bg-gradient-to-r from-rose-400/25 via-pink-400/20 to-fuchsia-400/15 text-rose-950 shadow-md shadow-rose-500/20",
  },

  // 旅行节奏
  slow: {
    emoji: "🐢",
    idle: "border-teal-500/30 bg-teal-500/[0.08] text-teal-950/85 hover:border-teal-500/45 hover:bg-teal-500/12",
    active:
      "border-teal-500/55 bg-gradient-to-r from-teal-400/25 via-emerald-400/15 to-cyan-400/15 text-teal-950 shadow-md shadow-teal-500/20",
  },
  balanced: {
    emoji: "⚖️",
    idle: "border-blue-500/30 bg-blue-500/[0.08] text-blue-950/85 hover:border-blue-500/45 hover:bg-blue-500/12",
    active:
      "border-blue-500/55 bg-gradient-to-r from-blue-400/25 via-sky-400/20 to-indigo-400/15 text-blue-950 shadow-md shadow-blue-500/20",
  },
  fast: {
    emoji: "⚡",
    idle: "border-red-500/30 bg-red-500/[0.08] text-red-950/85 hover:border-red-500/45 hover:bg-red-500/12",
    active:
      "border-red-500/55 bg-gradient-to-r from-red-400/25 via-orange-400/20 to-amber-400/15 text-red-950 shadow-md shadow-red-500/20",
  },

  // 住宿
  hotel: {
    emoji: "🏨",
    idle: "border-yellow-600/30 bg-yellow-500/[0.08] text-yellow-950/85 hover:border-yellow-600/45 hover:bg-yellow-500/12",
    active:
      "border-yellow-600/55 bg-gradient-to-r from-yellow-400/25 via-amber-400/20 to-orange-300/15 text-yellow-950 shadow-md shadow-yellow-500/20",
  },
  airbnb: {
    emoji: "🏡",
    idle: "border-orange-500/30 bg-orange-500/[0.08] text-orange-950/85 hover:border-orange-500/45 hover:bg-orange-500/12",
    active:
      "border-orange-500/55 bg-gradient-to-r from-orange-400/25 via-amber-400/15 to-yellow-400/15 text-orange-950 shadow-md shadow-orange-500/20",
  },
  hostel: {
    emoji: "🎒",
    idle: "border-lime-600/30 bg-lime-500/[0.08] text-lime-950/85 hover:border-lime-600/45 hover:bg-lime-500/12",
    active:
      "border-lime-600/55 bg-gradient-to-r from-lime-400/25 via-green-400/15 to-emerald-400/15 text-lime-950 shadow-md shadow-lime-500/20",
  },
  camping: {
    emoji: "⛺",
    idle: "border-green-600/30 bg-green-500/[0.08] text-green-950/85 hover:border-green-600/45 hover:bg-green-500/12",
    active:
      "border-green-600/55 bg-gradient-to-r from-green-400/25 via-emerald-400/20 to-teal-400/15 text-green-950 shadow-md shadow-green-500/20",
  },

  // 饮食
  none: {
    emoji: "🍽️",
    idle: "border-slate-400/35 bg-slate-500/[0.07] text-slate-800/90 hover:border-slate-400/50 hover:bg-slate-500/10",
    active:
      "border-slate-500/55 bg-gradient-to-r from-slate-400/20 via-slate-500/15 to-zinc-400/15 text-slate-900 shadow-md shadow-slate-500/15",
  },
  vegetarian: {
    emoji: "🥗",
    idle: "border-green-500/30 bg-green-500/[0.08] text-green-950/85 hover:border-green-500/45 hover:bg-green-500/12",
    active:
      "border-green-500/55 bg-gradient-to-r from-green-400/25 via-emerald-400/20 to-lime-400/15 text-green-950 shadow-md shadow-green-500/20",
  },
  halal: {
    emoji: "🕌",
    idle: "border-emerald-600/30 bg-emerald-500/[0.08] text-emerald-950/85 hover:border-emerald-600/45 hover:bg-emerald-500/12",
    active:
      "border-emerald-600/55 bg-gradient-to-r from-emerald-400/25 via-teal-400/15 to-cyan-400/15 text-emerald-950 shadow-md shadow-emerald-500/20",
  },
  local: {
    emoji: "🍜",
    idle: "border-amber-500/30 bg-amber-500/[0.08] text-amber-950/85 hover:border-amber-500/45 hover:bg-amber-500/12",
    active:
      "border-amber-500/55 bg-gradient-to-r from-amber-400/25 via-orange-400/20 to-yellow-400/15 text-amber-950 shadow-md shadow-amber-500/20",
  },

  // 交通
  Flights: {
    emoji: "✈️",
    idle: "border-sky-500/30 bg-sky-500/[0.08] text-sky-950/85 hover:border-sky-500/45 hover:bg-sky-500/12",
    active:
      "border-sky-500/55 bg-gradient-to-r from-sky-400/25 via-blue-400/20 to-indigo-400/15 text-sky-950 shadow-md shadow-sky-500/20",
  },
  Trains: {
    emoji: "🚄",
    idle: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-950/85 hover:border-emerald-500/45 hover:bg-emerald-500/12",
    active:
      "border-emerald-500/55 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-400/15 text-emerald-950 shadow-md shadow-emerald-500/20",
  },
  Buses: {
    emoji: "🚌",
    idle: "border-amber-500/30 bg-amber-500/[0.08] text-amber-950/85 hover:border-amber-500/45 hover:bg-amber-500/12",
    active:
      "border-amber-500/55 bg-gradient-to-r from-amber-400/25 via-yellow-400/20 to-orange-400/15 text-amber-950 shadow-md shadow-amber-500/20",
  },
  Road: {
    emoji: "🚗",
    idle: "border-orange-500/30 bg-orange-500/[0.08] text-orange-950/85 hover:border-orange-500/45 hover:bg-orange-500/12",
    active:
      "border-orange-500/55 bg-gradient-to-r from-orange-400/25 via-red-400/15 to-amber-400/15 text-orange-950 shadow-md shadow-orange-500/20",
  },

  // 同行
  solo: {
    emoji: "🧳",
    idle: "border-violet-500/30 bg-violet-500/[0.08] text-violet-950/85 hover:border-violet-500/45 hover:bg-violet-500/12",
    active:
      "border-violet-500/55 bg-gradient-to-r from-violet-400/25 via-purple-400/20 to-fuchsia-400/15 text-violet-950 shadow-md shadow-violet-500/20",
  },
  couple: {
    emoji: "💑",
    idle: "border-rose-500/30 bg-rose-500/[0.08] text-rose-950/85 hover:border-rose-500/45 hover:bg-rose-500/12",
    active:
      "border-rose-500/55 bg-gradient-to-r from-rose-400/25 via-pink-400/20 to-red-400/15 text-rose-950 shadow-md shadow-rose-500/20",
  },
  family: {
    emoji: "👨‍👩‍👧",
    idle: "border-amber-500/30 bg-amber-500/[0.08] text-amber-950/85 hover:border-amber-500/45 hover:bg-amber-500/12",
    active:
      "border-amber-500/55 bg-gradient-to-r from-amber-400/25 via-orange-400/15 to-yellow-400/15 text-amber-950 shadow-md shadow-amber-500/20",
  },
  group: {
    emoji: "👯",
    idle: "border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-950/85 hover:border-cyan-500/45 hover:bg-cyan-500/12",
    active:
      "border-cyan-500/55 bg-gradient-to-r from-cyan-400/25 via-teal-400/20 to-sky-400/15 text-cyan-950 shadow-md shadow-cyan-500/20",
  },
};

const FALLBACK_PALETTE: PreferenceChipPalette = {
  emoji: "✨",
  idle: "border-primary/25 bg-primary/[0.06] text-foreground/85 hover:border-primary/40 hover:bg-primary/10",
  active: "border-primary/50 bg-primary/15 text-foreground shadow-md shadow-primary/15",
};

export function getPreferenceChipPalette(optionId: string): PreferenceChipPalette {
  return PREFERENCE_OPTION_PALETTES[optionId] ?? FALLBACK_PALETTE;
}

/** @deprecated 使用 getPreferenceChipPalette 按选项取色 */
export const PREFERENCE_CHIP_STYLES = {
  theme: {
    idle: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-900/80 hover:border-emerald-500/40",
    active: "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 shadow-sm shadow-emerald-500/10",
  },
  pace: {
    idle: "border-teal-500/25 bg-teal-500/[0.06] text-teal-900/80 hover:border-teal-500/40",
    active: "border-teal-500/50 bg-teal-500/15 text-teal-800 shadow-sm shadow-teal-500/10",
  },
  accommodation: {
    idle: "border-violet-500/25 bg-violet-500/[0.06] text-violet-900/80 hover:border-violet-500/40",
    active: "border-violet-500/50 bg-violet-500/15 text-violet-800 shadow-sm shadow-violet-500/10",
  },
  dietary: {
    idle: "border-amber-500/25 bg-amber-500/[0.06] text-amber-900/80 hover:border-amber-500/40",
    active: "border-amber-500/50 bg-amber-500/15 text-amber-900 shadow-sm shadow-amber-500/10",
  },
  transport: {
    idle: "border-sky-500/25 bg-sky-500/[0.06] text-sky-900/80 hover:border-sky-500/40",
    active: "border-sky-500/50 bg-sky-500/15 text-sky-800 shadow-sm shadow-sky-500/10",
  },
  party: {
    idle: "border-rose-500/25 bg-rose-500/[0.06] text-rose-900/80 hover:border-rose-500/40",
    active: "border-rose-500/50 bg-rose-500/15 text-rose-800 shadow-sm shadow-rose-500/10",
  },
  budget: {
    idle: "border-primary/25 bg-primary/[0.06]",
    active: "border-primary/40 bg-primary/10",
  },
} as const;

/** 分组标题装饰色 */
export const PREFERENCE_SECTION_ACCENTS = {
  theme: "from-emerald-500/20 to-teal-500/10 text-emerald-800",
  pace: "from-blue-500/20 to-cyan-500/10 text-blue-800",
  accommodation: "from-violet-500/20 to-purple-500/10 text-violet-800",
  dietary: "from-amber-500/20 to-orange-500/10 text-amber-800",
  transport: "from-sky-500/20 to-indigo-500/10 text-sky-800",
  party: "from-rose-500/20 to-pink-500/10 text-rose-800",
  budget: "from-yellow-500/20 to-amber-500/10 text-amber-800",
} as const;
