/** VoyageMind 界面辅助色：绿色为主品牌色，其余用于分区与状态点缀 */

/** 左侧对话列表 & 中间对话栏共用面板样式，保持视觉一致 */
export const CHAT_PANEL_STYLES = {
  shell:
    "relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-card/85 via-emerald-500/[0.05] to-voyage-sky/[0.06] shadow-lg shadow-primary/8 ring-1 ring-voyage-teal/15",
  topStripe:
    "pointer-events-none absolute inset-x-0 top-0 z-[1] h-1 bg-gradient-to-r from-primary/50 via-voyage-sky/40 to-voyage-amber/35",
  header:
    "shrink-0 border-b border-border/45 bg-gradient-to-r from-voyage-sky/10 via-background/50 to-voyage-amber/8 backdrop-blur-sm",
  footer:
    "relative shrink-0 border-t border-border/45 bg-gradient-to-t from-primary/8 via-voyage-amber/6 to-background/55",
  body: "min-h-0 flex-1 overflow-y-auto",
} as const;

export const SECTION_GRADIENT_ACCENTS = [
  {
    dot: "bg-emerald-500 shadow-emerald-500/40",
    title: "text-emerald-800",
    card: "hover:border-emerald-400/35 hover:shadow-emerald-500/10",
    stripe: "from-emerald-400/60 to-teal-400/40",
  },
  {
    dot: "bg-sky-500 shadow-sky-500/40",
    title: "text-sky-800",
    card: "hover:border-sky-400/35 hover:shadow-sky-500/10",
    stripe: "from-sky-400/60 to-blue-400/40",
  },
  {
    dot: "bg-violet-500 shadow-violet-500/40",
    title: "text-violet-800",
    card: "hover:border-violet-400/35 hover:shadow-violet-500/10",
    stripe: "from-violet-400/60 to-purple-400/40",
  },
  {
    dot: "bg-amber-500 shadow-amber-500/40",
    title: "text-amber-800",
    card: "hover:border-amber-400/35 hover:shadow-amber-500/10",
    stripe: "from-amber-400/60 to-orange-400/40",
  },
  {
    dot: "bg-rose-500 shadow-rose-500/40",
    title: "text-rose-800",
    card: "hover:border-rose-400/35 hover:shadow-rose-500/10",
    stripe: "from-rose-400/60 to-pink-400/40",
  },
  {
    dot: "bg-teal-500 shadow-teal-500/40",
    title: "text-teal-800",
    card: "hover:border-teal-400/35 hover:shadow-teal-500/10",
    stripe: "from-teal-400/60 to-cyan-400/40",
  },
] as const;

export const SETTINGS_NAV_ACCENTS = {
  "/settings/skills": {
    active: "border-amber-500/45 bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-900 shadow-sm shadow-amber-500/10",
    idle: "hover:border-amber-500/30 hover:bg-amber-500/8",
    icon: "text-amber-600",
  },
  "/settings/tools": {
    active: "border-sky-500/45 bg-gradient-to-r from-sky-500/15 to-blue-500/10 text-sky-900 shadow-sm shadow-sky-500/10",
    idle: "hover:border-sky-500/30 hover:bg-sky-500/8",
    icon: "text-sky-600",
  },
  "/settings/memory": {
    active: "border-violet-500/45 bg-gradient-to-r from-violet-500/15 to-purple-500/10 text-violet-900 shadow-sm shadow-violet-500/10",
    idle: "hover:border-violet-500/30 hover:bg-violet-500/8",
    icon: "text-violet-600",
  },
  "/settings/knowledge": {
    active: "border-teal-500/45 bg-gradient-to-r from-teal-500/15 to-emerald-500/10 text-teal-900 shadow-sm shadow-teal-500/10",
    idle: "hover:border-teal-500/30 hover:bg-teal-500/8",
    icon: "text-teal-600",
  },
} as const;
