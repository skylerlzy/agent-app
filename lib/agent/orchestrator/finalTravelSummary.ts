import type { AgentRunInput, ExecutionPlan, ILLMClient, ToolName } from "../contracts";
import { appendSkillSection } from "../skills/appendSkillSection";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { formatAgentKnowledgeContext, formatCitations } from "../knowledge";
import type { RunDoneTravelOutput, TripPlanDocument } from "../tripPlan/types";
import {
  buildItineraryFromToolLogs,
  buildThemesFromToolLogs,
  buildTransportFromToolLogs,
  buildWeatherTipsFromToolLogs,
  extractPlacesFromToolLogs,
} from "../tripPlan/buildFromToolLogs";
import {
  extractTripPlanFromLlmPayload,
  parseTripPlanDocument,
  isValidTripPlan,
} from "../tripPlan/schema";
import { extractJsonObject } from "./runModeDecision";

function flattenSteps(plan: ExecutionPlan) {
  return plan.phases.flatMap((phase) => phase.steps ?? []);
}

export type ToolLogEntry = { stepId: string; toolName: ToolName; summary: string };

function buildFallbackTripPlan(
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[],
  citations?: string
): TripPlanDocument {
  const prefs = input.context.preferences;
  const steps = flattenSteps(plan);
  const weatherTips = buildWeatherTipsFromToolLogs(toolLogs);
  const transport = buildTransportFromToolLogs(toolLogs);
  const places = extractPlacesFromToolLogs(toolLogs);
  const themes = buildThemesFromToolLogs(toolLogs, prefs.destination);
  const itinerary = buildItineraryFromToolLogs(toolLogs, {
    destination: prefs.destination,
    tripStart: prefs.tripStartDateIso,
    tripEnd: prefs.tripEndDateIso,
  });

  const routeLabel =
    prefs.originCity && prefs.destination
      ? `${prefs.originCity} → ${prefs.destination}`
      : prefs.destination;

  return {
    version: 1,
    meta: {
      destination: prefs.destination,
      origin: prefs.originCity,
      tripStart: prefs.tripStartDateIso,
      tripEnd: prefs.tripEndDateIso,
      routeLabel,
    },
    overview:
      plan.plannerRationale?.trim().slice(0, 400) ||
      `已结合 ${toolLogs.length} 条工具观测与 ${steps.length} 个规划步骤，为 ${prefs.destination || "本次出行"} 生成可执行行程草案。`,
    weatherTips,
    transport,
    themesAndPlaces: themes,
    itinerary,
    foodAndBudget:
      prefs.budgetCny != null && prefs.budgetCny > 0
        ? `参考预算约 ${prefs.budgetCny} 元/人；餐饮可结合当地特色灵活安排。`
        : "餐饮可结合当地特色与预算灵活安排；具体消费以现场为准。",
    tipsAndDisclaimer:
      "方案基于工具观测与知识检索生成；开放时间与票价以官方为准，铁路时刻以 12306 为准。",
    citations: citations ? [citations] : undefined,
    topPlacesToVisit: places,
    adventuresActivities: themes.slice(0, 4),
    localCuisine: [],
    packingChecklist: /雨|雷/.test(weatherTips) ? ["折叠伞或雨衣", "防滑鞋"] : undefined,
  };
}

const TRIP_PLAN_JSON_HINT = `tripPlan 对象须包含字段：
version=1, meta{destination,origin,tripStart,tripEnd,routeLabel},
overview, weatherTips, transport, themesAndPlaces(string[]),
itinerary[{title, dateIso?, activities{morning,afternoon,evening:[{itineraryItem,briefDescription}]}}],
foodAndBudget, tipsAndDisclaimer, citations?(string[]),
topPlacesToVisit[{name, coordinates?{lat,lng}}]（至少 3 个，尽量带坐标）,
adventuresActivities?, localCuisine?, packingChecklist?`;

async function requestStructuredPlan(
  llm: ILLMClient,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  label: string
): Promise<RunDoneTravelOutput> {
  const raw = await llm.complete(messages, { temperature: 0.3, requestLabel: label });
  const jsonStr = extractJsonObject(raw.trim());
  if (!jsonStr) throw new Error("structured plan: no json");
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  const tripPlan = parseTripPlanDocument(extractTripPlanFromLlmPayload(parsed));
  const chatReply = typeof parsed.chatReply === "string" ? parsed.chatReply.trim() : "";
  if (!chatReply || !tripPlan || !isValidTripPlan(tripPlan)) {
    throw new Error("structured plan: invalid payload");
  }
  return { chatReply, tripPlan };
}

export async function synthesizeStructuredTravelPlan(
  llm: ILLMClient,
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[]
): Promise<RunDoneTravelOutput> {
  const planBrief = [
    plan.plannerRationale ? `【规划论证】\n${plan.plannerRationale}` : "",
    ...plan.phases.flatMap((ph) => [
      `【阶段】${ph.title}`,
      ...(ph.steps ?? []).map((s) => `  ${s.id}: ${s.description}`),
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  const toolsBlock =
    toolLogs.length > 0
      ? toolLogs.map((t) => `--- ${t.stepId} / ${t.toolName} ---\n${t.summary}`).join("\n\n")
      : "（本回合无成功工具 JSON。请仅依据用户目标与偏好给出原则性建议，并明确写出「未查询到实时天气/路线数据」。）";

  const system = appendSkillSection(
    `你是面向最终用户的智能出行顾问。你只能把「工具观测数据」中出现的数值与文字当作事实；禁止编造未出现在其中的气温、AQI、距离、耗时或票价。

请输出**唯一一个 JSON 对象**（不要 Markdown 代码块外的文字），键：
- chatReply（string）：2～4 句简短回复，告知用户完整方案已生成在右侧面板，概括亮点；**不要**在 chatReply 中粘贴完整行程。
- tripPlan（object）：结构化全程出行方案。${TRIP_PLAN_JSON_HINT}

要求：
- **禁止**把「执行计划」里的步骤描述（如「查询天气预报」）原样写入 itinerary；itinerary 必须是用户可执行的游览/交通/餐饮安排。
- itinerary 按天排列，每天分 morning/afternoon/evening；结合 tripStart/tripEnd 写真实日期与景点名。
- 从工具数据提炼 weatherTips、transport 的具体数值与结论。
- topPlacesToVisit 至少 3 个，优先使用路线工具中的地点与坐标。
- 若工具数据缺失，诚实说明，不得杜撰。
- 若【RAG 知识片段】非空，写入 citations：[来源: 文档标题 · 引用位置]。
- 铁路以 12306 为准。`,
    input.skillSystemSection
  );

  const historyBlock = formatHistoryForPrompt(
    input.history,
    input.contextBundle?.conversationSummary
  );
  const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

  const user = `${historyBlock}${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}【用户目标】\n${input.goal.rawText}\n\n【结构化槽位】\n${JSON.stringify(input.goal.slots ?? {}, null, 2)}\n\n【用户偏好】\n${JSON.stringify(input.context.preferences, null, 2)}\n\n【执行计划（仅供理解，勿原样复制到 itinerary）】\n${planBrief}\n\n【工具观测数据（事实来源）】\n${toolsBlock}`;

  const baseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    return await requestStructuredPlan(llm, baseMessages, "run_structured_travel_plan");
  } catch (firstError) {
    const retryMessages = [
      ...baseMessages,
      {
        role: "assistant" as const,
        content: `上次输出无效：${firstError instanceof Error ? firstError.message : "parse failed"}`,
      },
      {
        role: "user" as const,
        content:
          "请重新输出合法 JSON：{\"chatReply\":\"...\",\"tripPlan\":{...}}。tripPlan.itinerary 须为按天可执行行程（景点/活动名），不得写「查询天气」类步骤；所有字段非空。",
      },
    ];
    return await requestStructuredPlan(llm, retryMessages, "run_structured_travel_plan_retry");
  }
}

export async function buildRunDoneTravelOutput(
  llm: ILLMClient | undefined,
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[]
): Promise<RunDoneTravelOutput> {
  const citations = formatCitations(input.contextBundle?.ragChunks ?? []);
  const fallback = () => {
    const tripPlan = buildFallbackTripPlan(input, plan, toolLogs, citations || undefined);
    return {
      chatReply:
        "已根据工具观测生成结构化行程，请在右侧查看按天安排、天气与路线摘要；细节可继续追问调整。",
      tripPlan,
    };
  };

  if (!llm) return fallback();

  try {
    const result = await synthesizeStructuredTravelPlan(llm, input, plan, toolLogs);
    if (citations && !result.tripPlan.citations?.length) {
      result.tripPlan.citations = [citations];
    }
    if (!result.tripPlan.topPlacesToVisit?.length) {
      result.tripPlan.topPlacesToVisit = extractPlacesFromToolLogs(toolLogs);
    }
    return result;
  } catch {
    return fallback();
  }
}

/** @deprecated 保留类型导出兼容 */
export async function buildRunDoneSummary(
  llm: ILLMClient | undefined,
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[]
): Promise<string> {
  const out = await buildRunDoneTravelOutput(llm, input, plan, toolLogs);
  return out.chatReply;
}
