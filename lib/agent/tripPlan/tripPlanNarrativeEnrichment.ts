import type { AgentRunInput, ILLMClient } from "../contracts";
import { appendSkillSection } from "../skills/appendSkillSection";
import type { TripPlanDocument } from "./types";
import { extractJsonObject } from "../orchestrator/runModeDecision";
import { countTripDays, isTemplateFoodName, itineraryHasQualityIssues } from "./buildFromToolLogs";
import { resolveSkillTripHints, skillMomentSectionTitle } from "./skillTripContext";
import type { ToolLogEntry } from "./tripContext";

const TEMPLATE_RE =
  /待根据工具数据补充|请查看推理轨迹|本地老字号小吃（待补充）|降级模板/;

export type NarrativePolishOptions = {
  /** fast：压缩 prompt + 限时，用于确定性定稿后的单次润色 */
  mode?: "fast" | "full";
  /** 为 true 时跳过「已够好」的早退，确保走 LLM */
  forcePolish?: boolean;
};

function readNarrativePolishTimeoutMs(mode: "fast" | "full"): number {
  const raw = process.env.TRIP_NARRATIVE_POLISH_TIMEOUT_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 10_000) return Math.min(n, 180_000);
  }
  return mode === "fast" ? 95_000 : 120_000;
}

function readNarrativePolishMaxTokens(mode: "fast" | "full"): number {
  const raw = process.env.TRIP_NARRATIVE_POLISH_MAX_TOKENS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 512) return Math.min(n, 16_000);
  }
  return mode === "fast" ? 4_096 : 8_192;
}

function buildCompactToolsBlock(toolLogs: ToolLogEntry[], maxLogs = 8, maxChars = 700): string {
  if (toolLogs.length === 0) return "（无工具观测）";
  return toolLogs
    .slice(0, maxLogs)
    .map((t) => `--- ${t.toolName} ---\n${t.summary.trim().slice(0, maxChars)}`)
    .join("\n\n");
}

function buildCompactPlanSkeleton(plan: TripPlanDocument) {
  return {
    meta: plan.meta,
    overview: plan.overview.slice(0, 240),
    themeHighlights: (plan.themeHighlights ?? []).map((t) => ({
      title: t.title,
      description: t.description.slice(0, 160),
      places: t.places,
    })),
    itinerary: plan.itinerary.map((d) => ({
      title: d.title,
      dateIso: d.dateIso,
      activities: {
        morning: d.activities.morning.map((a) => ({
          itineraryItem: a.itineraryItem,
          briefDescription: a.briefDescription.slice(0, 120),
        })),
        afternoon: d.activities.afternoon.map((a) => ({
          itineraryItem: a.itineraryItem,
          briefDescription: a.briefDescription.slice(0, 120),
        })),
        evening: d.activities.evening.map((a) => ({
          itineraryItem: a.itineraryItem,
          briefDescription: a.briefDescription.slice(0, 120),
        })),
      },
    })),
    foodAndBudget: plan.foodAndBudget.slice(0, 400),
    foodRecommendations: (plan.foodRecommendations ?? []).map((f) => ({
      name: f.name,
      description: f.description.slice(0, 120),
    })),
    topPlacesToVisit: (plan.topPlacesToVisit ?? []).map((p) => p.name),
  };
}

async function withNarrativeDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function planNeedsNarrativePolish(plan: TripPlanDocument): boolean {
  if (TEMPLATE_RE.test(plan.overview)) return true;
  if (itineraryHasQualityIssues(plan)) return true;

  for (const theme of plan.themeHighlights ?? []) {
    if (theme.description.length < 40 || TEMPLATE_RE.test(theme.description)) return true;
  }

  const foods = plan.foodRecommendations ?? [];
  if (foods.length < 2) return true;
  if (foods.some((f) => isTemplateFoodName(f.name))) return true;
  if (foods.some((f) => TEMPLATE_RE.test(f.description) || f.description.length < 20)) return true;

  return false;
}

function themeCountMismatch(plan: TripPlanDocument, input: AgentRunInput): boolean {
  const days = countTripDays(
    plan.meta.tripStart ?? input.context.preferences.tripStartDateIso,
    plan.meta.tripEnd ?? input.context.preferences.tripEndDateIso
  );
  const themes = plan.themeHighlights?.length ?? plan.themesAndPlaces.length;
  return themes !== days;
}

function fallbackPlanLooksComplete(plan: TripPlanDocument, input: AgentRunInput): boolean {
  const dayCount = countTripDays(
    plan.meta.tripStart ?? input.context.preferences.tripStartDateIso,
    plan.meta.tripEnd ?? input.context.preferences.tripEndDateIso
  );
  const themes = plan.themeHighlights?.length ?? plan.themesAndPlaces.length;
  const foods = plan.foodRecommendations?.length ?? 0;
  const places = plan.topPlacesToVisit?.length ?? 0;
  const hasItinerary = plan.itinerary.length > 0;
  const overviewOk = plan.overview.length >= 40 && !TEMPLATE_RE.test(plan.overview);

  return overviewOk && hasItinerary && foods >= 3 && places >= 3 && themes >= Math.max(1, dayCount);
}

/**
 * 用 LLM 润色主题、日程、餐饮文案，使输出生动具体并贯彻 Skill 要求。
 * fast 模式：压缩 prompt + 限时，配合确定性定稿，总收尾目标 < 2 分钟。
 */
export async function enrichTripPlanNarrativesWithLlm(
  llm: ILLMClient,
  plan: TripPlanDocument,
  toolLogs: ToolLogEntry[],
  input: AgentRunInput,
  polishOptions?: NarrativePolishOptions
): Promise<TripPlanDocument> {
  const mode = polishOptions?.mode ?? "full";
  const forcePolish = polishOptions?.forcePolish === true;

  if (!forcePolish) {
    if (fallbackPlanLooksComplete(plan, input)) {
      const hints = resolveSkillTripHints(input);
      if (!hints.requiresSkillMoments || (plan.skillMoments?.length ?? 0) > 0) {
        return plan;
      }
    }

    if (!planNeedsNarrativePolish(plan) && !themeCountMismatch(plan, input)) {
      const hints = resolveSkillTripHints(input);
      if (!hints.requiresSkillMoments || (plan.skillMoments?.length ?? 0) > 0) {
        return plan;
      }
    }
  }

  const hints = resolveSkillTripHints(input);
  const dayCount = countTripDays(
    plan.meta.tripStart ?? input.context.preferences.tripStartDateIso,
    plan.meta.tripEnd ?? input.context.preferences.tripEndDateIso
  );

  const toolsBlock =
    mode === "fast"
      ? buildCompactToolsBlock(toolLogs)
      : toolLogs.length > 0
        ? toolLogs.map((t) => `--- ${t.toolName} ---\n${t.summary.slice(0, 1200)}`).join("\n\n")
        : "（无工具观测）";

  const skillMomentHint = hints.requiresSkillMoments
    ? `\n- skillMoments：须包含「${skillMomentSectionTitle(hints)}」小节，覆盖 ${dayCount} 天中至少 ${Math.min(dayCount, 3)} 天的浪漫/氛围高光。`
    : "";

  const descRule =
    mode === "fast"
      ? "每条 theme description 2～3 句；itinerary briefDescription 每段 2 句，结合景点特色，禁止写入气温/AQI。"
      : "每条 theme description 至少 3 句，含具体地点、时段或体验细节；itinerary briefDescription 禁止写入气温/AQI。";

  const system = appendSkillSection(
    `你是资深旅行文案编辑。根据工具事实数据润色结构化行程 JSON，使文字生动、具体、有烟火气；禁止编造工具中未出现的票价/气温/闭园时间。

输出**唯一 JSON 对象**（字段名保持不变）：
{
  "themeHighlights": [{ "title", "description", "places?", "highlights?" }],
  "itinerary": [{ "title", "dateIso?", "activities": { "morning", "afternoon", "evening": [{ "itineraryItem", "briefDescription" }] } }],
  "foodAndBudget": "string",
  "foodRecommendations": [{ "name", "description" }],
  "skillMoments"?: [{ "dayLabel", "title", "description", "tips?"[] }]
}

硬性要求：
- themeHighlights 数量 = 出行天数 ${dayCount}
- ${descRule}
- foodRecommendations 使用工具 poi_search 中的**真实店名**；description 含地址/招牌/场景
- foodAndBudget 点名至少 2 家具体餐厅${skillMomentHint}
- 只输出 JSON，不要 Markdown 代码块`,
    input.skillSystemSection
  );

  const skeleton =
    mode === "fast" ? buildCompactPlanSkeleton(plan) : {
        meta: plan.meta,
        themeHighlights: plan.themeHighlights,
        itinerary: plan.itinerary,
        foodAndBudget: plan.foodAndBudget,
        foodRecommendations: plan.foodRecommendations,
        topPlacesToVisit: plan.topPlacesToVisit,
      };

  const prefs =
    mode === "fast"
      ? {
          destination: input.context.preferences.destination,
          pace: input.context.preferences.pace,
          travelParty: input.context.preferences.travelParty,
          dietaryPreset: input.context.preferences.dietaryPreset,
          travelThemes: input.context.preferences.travelThemes,
        }
      : input.context.preferences;

  const user = `【当前方案骨架】\n${JSON.stringify(skeleton)}\n\n【工具观测（事实来源）】\n${toolsBlock}\n\n【用户偏好】\n${JSON.stringify(prefs)}`;

  const runPolish = async (): Promise<TripPlanDocument> => {
    try {
      const raw = await llm.complete(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        {
          temperature: mode === "fast" ? 0.42 : 0.45,
          requestLabel: mode === "fast" ? "trip_plan_narrative_polish_fast" : "trip_plan_narrative_polish",
          maxTokens: readNarrativePolishMaxTokens(mode),
          timeoutMs: readNarrativePolishTimeoutMs(mode),
        }
      );

      const jsonStr = extractJsonObject(raw.trim());
      if (!jsonStr) return plan;

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      const next: TripPlanDocument = { ...plan };

      if (Array.isArray(parsed.themeHighlights) && parsed.themeHighlights.length > 0) {
        const themes = parsed.themeHighlights as NonNullable<TripPlanDocument["themeHighlights"]>;
        next.themeHighlights = themes.length >= dayCount ? themes.slice(0, dayCount) : themes;
        next.themesAndPlaces = next.themeHighlights.map((t) => t.title);
      }

      if (Array.isArray(parsed.itinerary) && parsed.itinerary.length > 0) {
        next.itinerary = parsed.itinerary as TripPlanDocument["itinerary"];
      }

      if (typeof parsed.foodAndBudget === "string" && parsed.foodAndBudget.trim()) {
        next.foodAndBudget = parsed.foodAndBudget.trim();
      }

      if (Array.isArray(parsed.foodRecommendations) && parsed.foodRecommendations.length >= 2) {
        next.foodRecommendations = parsed.foodRecommendations as TripPlanDocument["foodRecommendations"];
      }

      if (Array.isArray(parsed.skillMoments) && parsed.skillMoments.length > 0) {
        next.skillMoments = parsed.skillMoments as TripPlanDocument["skillMoments"];
      }

      return next;
    } catch {
      return plan;
    }
  };

  return withNarrativeDeadline(runPolish(), readNarrativePolishTimeoutMs(mode) + 2_000, plan);
}

export { planNeedsNarrativePolish, themeCountMismatch };
