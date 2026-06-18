import type { AgentRunInput, ExecutionPlan, ILLMClient } from "../contracts";
import { appendSkillSection } from "../skills/appendSkillSection";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { formatAgentKnowledgeContext, formatCitations } from "../knowledge";
import type { RunDoneTravelOutput, TripPlanDocument } from "../tripPlan/types";
import {
  buildItineraryFromToolLogs,
  buildPackingChecklistFromWeather,
  buildTransportFromToolLogs,
  buildWeatherAdviceFromToolLogs,
  extractPlacesFromToolLogs,
  parseDailyWeatherFromToolLogs,
} from "../tripPlan/buildFromToolLogs";
import { enrichTripPlanWithToolData } from "../tripPlan/enrichTripPlan";
import {
  filterToolLogsForTrip,
  resolveTripContext,
  type ToolLogEntry,
} from "../tripPlan/tripContext";
import {
  extractTripPlanFromLlmPayload,
  parseTripPlanDocument,
  isValidTripPlan,
} from "../tripPlan/schema";
import { extractJsonObject } from "./runModeDecision";

export type { ToolLogEntry };

function buildFallbackTripPlan(
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[],
  citations?: string
): TripPlanDocument {
  const ctx = resolveTripContext(input);
  const filteredLogs = filterToolLogsForTrip(toolLogs, ctx);
  const prefs = input.context.preferences;
  const dest = ctx.destination ?? prefs.destination;
  const dailyWeather = parseDailyWeatherFromToolLogs(filteredLogs, {
    destination: dest,
    tripStart: ctx.tripStart ?? prefs.tripStartDateIso,
    tripEnd: ctx.tripEnd ?? prefs.tripEndDateIso,
  });
  const weatherAdvice = buildWeatherAdviceFromToolLogs(dailyWeather);
  const transport = buildTransportFromToolLogs(filteredLogs);
  const places = extractPlacesFromToolLogs(filteredLogs, { destination: dest });
  const itinerary = buildItineraryFromToolLogs(filteredLogs, {
    destination: dest,
    tripStart: ctx.tripStart ?? prefs.tripStartDateIso,
    tripEnd: ctx.tripEnd ?? prefs.tripEndDateIso,
    pace: prefs.pace,
    origin: ctx.origin ?? prefs.originCity,
  });

  const routeLabel =
    (ctx.origin ?? prefs.originCity) && dest
      ? `${ctx.origin ?? prefs.originCity} → ${dest}`
      : dest;

  const draft: TripPlanDocument = {
    version: 1,
    meta: {
      destination: dest,
      origin: ctx.origin ?? prefs.originCity,
      tripStart: ctx.tripStart ?? prefs.tripStartDateIso,
      tripEnd: ctx.tripEnd ?? prefs.tripEndDateIso,
      routeLabel,
    },
    overview:
      plan.plannerRationale?.trim().slice(0, 400) ||
      `已结合 ${filteredLogs.length} 条与目的地匹配的工具观测，为 ${dest || "本次出行"} 生成可执行行程草案。`,
    weatherTips: weatherAdvice,
    dailyWeather,
    weatherAdvice,
    transport,
    themesAndPlaces: [],
    itinerary,
    foodAndBudget: "",
    tipsAndDisclaimer: "",
    citations: citations ? [citations] : undefined,
    topPlacesToVisit: places,
    adventuresActivities: [],
    localCuisine: [],
    packingChecklist: buildPackingChecklistFromWeather(dailyWeather, dest),
  };
  return enrichTripPlanWithToolData(draft, toolLogs, input);
}

const TRIP_PLAN_JSON_HINT = `tripPlan 对象须包含字段：
version=1, meta{destination,origin,tripStart,tripEnd,routeLabel}（须与用户偏好一致）,
overview,
dailyWeather[{dateIso,city?,summary,tempMin?,tempMax?,precipMm?,aqi?,airQuality?}]（仅填写目的地、且 dateIso 在 tripStart～tripEnd 内的逐日天气）,
weatherAdvice（string，综合着装与出行建议，勿与 dailyWeather 重复罗列）,
weatherTips（可与 weatherAdvice 相同，兼容字段）,
transport（跨城交通摘要；优先 transportSegments）,
transportSegments[{category:"intercity",origin,destination,durationMinutes?,mode:"rail",recommendation}]（**仅**跨城铁路/高铁；须汇总 rail_schedule_hint 中全部相关车次，禁止写入景点间步行/驾车段）,
themeHighlights[{title,description,places?,highlights?}]（至少 2 条，景点须为目的地内 POI）,
themesAndPlaces(string[]，与 themeHighlights 标题一致),
itinerary[{title, dateIso?, activities{morning,afternoon,evening:[{itineraryItem,briefDescription}]}}]（按天、不重复、仅目的地景点）,
foodAndBudget（预算与用餐策略，勿写「待补充」；无把握可留空字符串）,
foodRecommendations[{name,description}]（至少 2 条**目的地**餐饮，来自 poi_search）,
citations?(string[]),
topPlacesToVisit[{name, coordinates?{lat,lng}}]（至少 3 个**目的地景点**，来自 poi_search，勿用 maps 路线端点）,
localCuisine?, packingChecklist?（结合天气与活动，勿只写「折叠伞」两项）`;

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
  const ctx = resolveTripContext(input);
  const filteredLogs = filterToolLogsForTrip(toolLogs, ctx);
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
    filteredLogs.length > 0
      ? filteredLogs.map((t) => `--- ${t.stepId} / ${t.toolName} ---\n${t.summary}`).join("\n\n")
      : toolLogs.length > 0
        ? "（本回合工具观测与目的地/日期不匹配，已忽略；请仅依据用户目标与 RAG 给出原则性建议，并明确写出「未查询到与目的地匹配的天气/铁路/POI 数据」。）"
        : "（本回合无成功工具 JSON。请仅依据用户目标与偏好给出原则性建议，并明确写出「未查询到实时天气/路线数据」。）";

  const dest = ctx.destination ?? input.context.preferences.destination ?? "目的地";
  const system = appendSkillSection(
    `你是面向最终用户的智能出行顾问。你只能把「工具观测数据」中与目的地 ${dest} 匹配的数值与文字当作事实；禁止编造未出现在其中的气温、AQI、距离、耗时或票价；**禁止**把其它城市的 POI/天气写入方案。

请输出**唯一一个 JSON 对象**（不要 Markdown 代码块外的文字），键：
- chatReply（string）：2～4 句简短回复，告知用户完整方案已生成在右侧面板，概括亮点；**不要**在 chatReply 中粘贴完整行程。
- tripPlan（object）：结构化全程出行方案。${TRIP_PLAN_JSON_HINT}

要求：
- meta.destination 必须为 ${dest}；dailyWeather 仅含 tripStart～tripEnd 且 city 为目的地
- **禁止**把「执行计划」里的步骤描述（如「查询天气预报」）原样写入 itinerary；itinerary 必须是用户可执行的游览/交通/餐饮安排。
- itinerary 按天排列，每天分 morning/afternoon/evening；结合 tripStart/tripEnd 写真实日期与**目的地**景点名，避免重复与跨城混用
- transportSegments **仅**含跨城 rail 段，汇总 rail_schedule_hint 全部车次；禁止景点间 maps 步行段
- 从工具数据提炼 dailyWeather、weatherAdvice、transport 的具体数值与结论；**禁止**输出「待根据工具数据补充」。
- themeHighlights 每条 description 至少 2 句，places 须为目的地 poi_search 景点
- foodRecommendations 至少 2 条目的地餐饮；若 poi_search 含餐厅 POI，须写入（名称+地址/类型）
- topPlacesToVisit 至少 3 个目的地景点（poi_search），勿用 maps 路线 formattedAddress
- 若工具数据缺失，诚实说明，不得杜撰其它城市内容
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
    result.tripPlan = enrichTripPlanWithToolData(result.tripPlan, toolLogs, input);
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
