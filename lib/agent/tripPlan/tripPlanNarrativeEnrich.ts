import type { AgentRunInput, ILLMClient } from "../contracts";
import { appendSkillSection } from "../skills/appendSkillSection";
import {
  extractTripPlanFromLlmPayload,
  isValidTripPlan,
  parseTripPlanDocument,
} from "./schema";
import { resolveSkillTripHints, skillMomentSectionTitle } from "./skillTripContext";
import type { TripPlanDocument } from "./types";
import { extractJsonObject } from "../orchestrator/runModeDecision";
import { formatItineraryJsonForPrompt } from "./incrementalReviseMerge";
import { filterToolLogsForTrip, resolveTripContext, type ToolLogEntry } from "./tripContext";

function toolsBlock(logs: ToolLogEntry[]): string {
  if (!logs.length) return "（无工具观测）";
  return logs.map((t) => `--- ${t.toolName} ---\n${t.summary.slice(0, 1200)}`).join("\n\n");
}

function foodBlock(plan: TripPlanDocument): string {
  return JSON.stringify(plan.foodRecommendations ?? [], null, 2);
}

/**
 * 用 LLM 润色主题、日程、餐饮文案（生动、烟火气、适度诗意；遵循 Skill）。
 * 不改动 meta / dailyWeather / transport 数值事实。
 */
export async function enrichTripPlanNarrativeWithLlm(
  llm: ILLMClient,
  plan: TripPlanDocument,
  input: AgentRunInput,
  toolLogs: ToolLogEntry[]
): Promise<TripPlanDocument> {
  const ctx = resolveTripContext(input, plan);
  const filtered = filterToolLogsForTrip(toolLogs, ctx);
  const hints = resolveSkillTripHints(input);
  const dest = ctx.destination ?? plan.meta.destination ?? "目的地";

  const system = appendSkillSection(
    `你是旅行文案编辑。根据工具事实与用户偏好，**润色**结构化行程中的文字部分，使其生动具体、有烟火气，并适度增添诗意；禁止编造未在工具数据中出现的票价、营业时间或闭园信息。

可修改字段：overview（1～3 句）、themeHighlights（每天 1 条主题，数量须等于行程天数）、itinerary 各活动 briefDescription、foodRecommendations 的 description、foodAndBudget（1～2 句策略）。

不可修改：itineraryItem 名称、meta、坐标、dailyWeather 数值、transportSegments、topPlacesToVisit 名称。

要求：
- themeHighlights 条数 = itinerary 天数；每条 title 含 Day 序号；description 至少 2 句；highlights 2～3 条短 tip
- 日程 briefDescription 每段 2～3 句，含怎么玩/何时去/避坑，不要重复同一模板句
- 餐饮 description 须结合店名与地址/类型，写出招牌或场景感
- 若用户启用情侣/家庭 Skill，须在 themeHighlights 或 overview 体现氛围（留白、黄昏、二人相处等）
- 输出唯一 JSON：{"tripPlan":{...完整 tripPlan 对象...}}`,
    input.skillSystemSection
  );

  const user = `【目的地】${dest}
【行程天数】${plan.itinerary.length}
【Skill 提示】${hints.activeSkillLabels.join("、") || "无"}；${hints.requiresSkillMoments ? `须体现「${skillMomentSectionTitle(hints)}」` : ""}

【当前 overview】
${plan.overview}

【当前 themeHighlights】
${JSON.stringify(plan.themeHighlights ?? [], null, 2)}

【当前 itinerary】
${formatItineraryJsonForPrompt(plan)}

【当前餐饮】
${foodBlock(plan)}

【工具观测（事实边界）】
${toolsBlock(filtered)}

请输出润色后的完整 tripPlan JSON。`;

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.45, requestLabel: "trip_plan_narrative_enrich" }
    );
    const jsonStr = extractJsonObject(raw.trim());
    if (!jsonStr) return plan;
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const enriched = parseTripPlanDocument(extractTripPlanFromLlmPayload(parsed) ?? parsed.tripPlan);
    if (!enriched || !isValidTripPlan(enriched)) return plan;

    return {
      ...plan,
      overview: enriched.overview?.trim() ? enriched.overview : plan.overview,
      themeHighlights:
        enriched.themeHighlights?.length === plan.itinerary.length
          ? enriched.themeHighlights
          : enriched.themeHighlights?.length
            ? enriched.themeHighlights
            : plan.themeHighlights,
      themesAndPlaces: enriched.themeHighlights?.map((t) => t.title) ?? plan.themesAndPlaces,
      itinerary: enriched.itinerary.map((day, i) => ({
        ...plan.itinerary[i],
        ...day,
        title: day.title || plan.itinerary[i]?.title || day.title,
        dateIso: day.dateIso ?? plan.itinerary[i]?.dateIso,
        activities: day.activities,
      })),
      foodRecommendations: enriched.foodRecommendations?.length
        ? enriched.foodRecommendations
        : plan.foodRecommendations,
      foodAndBudget: enriched.foodAndBudget?.trim() ? enriched.foodAndBudget : plan.foodAndBudget,
    };
  } catch {
    return plan;
  }
}
