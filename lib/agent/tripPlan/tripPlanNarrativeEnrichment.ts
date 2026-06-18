import type { AgentRunInput, ILLMClient } from "../contracts";
import { appendSkillSection } from "../skills/appendSkillSection";
import type { TripPlanDocument } from "./types";
import { extractJsonObject } from "../orchestrator/runModeDecision";
import { isTemplateFoodName, countTripDays } from "./buildFromToolLogs";
import { resolveSkillTripHints, skillMomentSectionTitle } from "./skillTripContext";
import type { ToolLogEntry } from "./tripContext";

const TEMPLATE_RE =
  /比打卡十张合影更像旅行|把时钟调慢半格|晨钟暮鼓里，感受东方礼制|本地老字号小吃|待根据工具数据补充|请查看推理轨迹/;

function planNeedsNarrativePolish(plan: TripPlanDocument): boolean {
  if (TEMPLATE_RE.test(plan.overview)) return true;

  for (const theme of plan.themeHighlights ?? []) {
    if (theme.description.length < 50 || TEMPLATE_RE.test(theme.description)) return true;
  }

  for (const day of plan.itinerary) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const act of day.activities[slot]) {
        if (act.briefDescription.length < 36 || TEMPLATE_RE.test(act.briefDescription)) return true;
      }
    }
  }

  const foods = plan.foodRecommendations ?? [];
  if (foods.length < 2) return true;
  if (foods.some((f) => isTemplateFoodName(f.name))) return true;
  if (foods.some((f) => TEMPLATE_RE.test(f.description) || f.description.length < 28)) return true;

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

/**
 * 用 LLM 润色主题、日程、餐饮文案，使输出生动具体并贯彻 Skill 要求。
 * 仅在检测到模板化/薄弱文案或主题数与天数不一致时调用。
 */
export async function enrichTripPlanNarrativesWithLlm(
  llm: ILLMClient,
  plan: TripPlanDocument,
  toolLogs: ToolLogEntry[],
  input: AgentRunInput
): Promise<TripPlanDocument> {
  if (!planNeedsNarrativePolish(plan) && !themeCountMismatch(plan, input)) {
    const hints = resolveSkillTripHints(input);
    if (!hints.requiresSkillMoments || (plan.skillMoments?.length ?? 0) > 0) {
      return plan;
    }
  }

  const hints = resolveSkillTripHints(input);
  const dayCount = countTripDays(
    plan.meta.tripStart ?? input.context.preferences.tripStartDateIso,
    plan.meta.tripEnd ?? input.context.preferences.tripEndDateIso
  );

  const toolsBlock =
    toolLogs.length > 0
      ? toolLogs.map((t) => `--- ${t.toolName} ---\n${t.summary.slice(0, 1200)}`).join("\n\n")
      : "（无工具观测）";

  const skillMomentHint = hints.requiresSkillMoments
    ? `\n- skillMoments：须包含「${skillMomentSectionTitle(hints)}」小节，覆盖 ${dayCount} 天中至少 ${Math.min(dayCount, 3)} 天的浪漫/氛围高光、留白时段与氛围小贴士；不可空泛。`
    : "";

  const system = appendSkillSection(
    `你是资深旅行文案编辑。根据工具事实数据润色结构化行程 JSON，使文字生动、具体、有烟火气，并适当增添诗意；禁止编造工具中未出现的票价/气温/闭园时间。

输出**唯一 JSON 对象**：
{
  "themeHighlights": [{ "title", "description", "places?", "highlights?" }],
  "itinerary": [{ "title", "dateIso?", "activities": { "morning", "afternoon", "evening": [{ "itineraryItem", "briefDescription" }] } }],
  "foodAndBudget": "string",
  "foodRecommendations": [{ "name", "description" }],
  "skillMoments"?: [{ "dayLabel", "title", "description", "tips?"[] }]
}

硬性要求：
- themeHighlights 数量必须等于出行天数 ${dayCount}，每天一个主题
- 每条 theme description 至少 3 句，含具体地点、时段或体验细节
- itinerary 的 briefDescription 禁止写入气温/AQI；须结合景点特色，避免不同景点复用同一段模板
- foodRecommendations 须使用工具 poi_search 中的**真实店名**；description 含地址/招牌菜/用餐场景
- foodAndBudget 须点名至少 2 家具体餐厅并给出人均参考${skillMomentHint}
- 只输出 JSON，不要 Markdown 代码块`,
    input.skillSystemSection
  );

  const user = `【当前方案骨架】\n${JSON.stringify(
    {
      meta: plan.meta,
      themeHighlights: plan.themeHighlights,
      itinerary: plan.itinerary,
      foodAndBudget: plan.foodAndBudget,
      foodRecommendations: plan.foodRecommendations,
      topPlacesToVisit: plan.topPlacesToVisit,
    },
    null,
    2
  )}\n\n【工具观测（事实来源）】\n${toolsBlock}\n\n【用户偏好】\n${JSON.stringify(input.context.preferences, null, 2)}`;

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.45, requestLabel: "trip_plan_narrative_polish" }
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
}

export { planNeedsNarrativePolish, themeCountMismatch };
