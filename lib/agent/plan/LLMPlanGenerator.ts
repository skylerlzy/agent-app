import {
  TOOL_NAMES,
  type AgentRunInput,
  type ExecutionPlan,
  type ILLMClient,
  type IPlanGenerator,
  type PlanPhase,
  type ToolName,
} from "../contracts";
import { buildAgentTimeContextLines } from "../runtime/agentTimeContext";
import { appendSkillSection } from "../skills/appendSkillSection";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { formatAgentKnowledgeContext } from "../knowledge";
import { buildToolsPromptSection, formatAllowedToolsList } from "../tools/descriptions";
import { resolveEnabledToolNames } from "../tools/resolveEnabledTools";

function allowedToolsForInput(input: AgentRunInput): ToolName[] {
  const resolved = resolveEnabledToolNames([], input.enabledToolNames);
  return resolved?.length ? resolved : [...TOOL_NAMES];
}

function sanitizePlanPhases(phases: PlanPhase[], allowed: Set<string>): PlanPhase[] {
  return phases.map((ph) => ({
    ...ph,
    steps: (ph.steps ?? []).map((st) => {
      const raw = st.suggestedTools ?? [];
      const suggestedTools = raw.filter((n): n is ToolName => allowed.has(n));
      return { ...st, suggestedTools: suggestedTools.length ? suggestedTools : undefined };
    }),
  }));
}

/**
 * 成员2 实现：基于 LLM 的自治计划生成器（无降级：解析失败或 LLM 失败直接抛错）
 */
export class LLMPlanGenerator implements IPlanGenerator {
  private lastSkillSystemSection?: string;
  private lastRunInput?: AgentRunInput;

  constructor(private llmClient: ILLMClient) {}

  async draftPlan(input: AgentRunInput): Promise<ExecutionPlan> {
    this.lastSkillSystemSection = input.skillSystemSection;
    this.lastRunInput = input;
    const { goal, context } = input;
    const allowedNames = allowedToolsForInput(input);
    const allowedSet = new Set<string>(allowedNames);
    const toolsSection = buildToolsPromptSection(allowedNames);
    const toolsListText = formatAllowedToolsList(allowedNames);
    const dest =
      context.preferences.destination?.trim() ||
      goal.slots?.destination?.trim() ||
      "（须从用户目标推断并写入 plannerRationale）";
    const origin =
      context.preferences.originCity?.trim() || goal.slots?.originCity?.trim() || "未指定";
    const tripStart =
      context.preferences.tripStartDateIso?.trim() || goal.slots?.startDateIso?.trim() || "";
    const tripEnd =
      context.preferences.tripEndDateIso?.trim() || goal.slots?.endDateIso?.trim() || "";
    const crossCity =
      origin !== "未指定" &&
      dest !== "（须从用户目标推断并写入 plannerRationale）" &&
      origin.replace(/市$/u, "") !== dest.replace(/市$/u, "");

    const systemPrompt = appendSkillSection(
      `
你是一个专业的智能出行助手。你的任务是根据用户的目标和上下文，制定一个多阶段的执行计划。

【可用工具清单】（名称不可改；执行器会按步骤调用，**禁止同参重复**）
${toolsSection}

【目的地硬性约束】
- 本次行程目的地：${dest}；出发地：${origin}；出行日期：${tripStart || "未指定"} 至 ${tripEnd || "未指定"}
- weather_forecast：city 必须为目的地的城市名（如「北京」），dateIso **必须且仅能**覆盖 ${tripStart || "tripStart"} 至 ${tripEnd || "tripEnd"} 的每一天，禁止查询行程范围外的日期或其它城市
- poi_search：city 必须为目的地的城市，keywords 为**该目的地内**的景点、地标或餐饮
- travelThemes 仅为体验风格标签，**不得**因此查询非目的地城市的 POI 或天气
${crossCity ? `- 跨城行程：**必须**包含至少一步 rail_schedule_hint(originCity=${origin}, destinationCity=${dest}, dateIso=出发日)` : ""}
- **禁止**在计划中安排景点之间的 maps_route_estimate（市内动线由总结阶段写入日程文案即可）

【规划禁忌】
- 不要生成「反复调用直到 AQI 出现」「验证站内换乘通道步行距离」等步骤。
- 跨城段必须用 rail_schedule_hint；maps_route_estimate 仅用于用户明确要求的单段同城接驳验证，不得用于景点串联规划。
- 景点候选收集优先 poi_search；地名禁止「XX区域」「XX青旅」等模糊表述。

【输出要求】
1. 必须严格按照 JSON 格式输出，不要包含任何解释性文字或 Markdown 代码围栏。
2. 根对象必须包含字符串字段 plannerRationale（200–600 字）：说明如何理解用户目标、为何分这些阶段、各工具如何支撑结论（体现规划思考，而非罗列步骤）。**plannerRationale 为必填，不得省略。**
3. 计划应分为若干个逻辑阶段 (phases)，阶段数量与粒度由你根据目标复杂度决定。
4. 每个步骤 (step) 必须有清晰的描述，并指明建议调用的工具；步骤 id 须从 s1 起连续编号（s1,s2,s3…），不要使用 s0。
5. 【严格】每个 step 的 suggestedTools 只能从且仅能使用：${toolsListText}。禁止编造任何其它工具名；禁止在 JSON 或 plannerRationale 中暗示「再接入」未列出的 API。
6. JSON 结构参考：
{
  "plannerRationale": "……",
  "phases": [
    {
      "id": "p1",
      "title": "阶段标题",
      "steps": [
        { "id": "s1", "description": "步骤描述", "suggestedTools": ["工具名"] }
      ]
    }
  ]
}
    `,
      input.skillSystemSection
    );

    const historyBlock = formatHistoryForPrompt(
      input.history,
      input.contextBundle?.conversationSummary
    );
    const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

    const userPrompt = `
${buildAgentTimeContextLines().join("\n")}

${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}${knowledgeBlock ? "【知识约束】必须优先遵守长期记忆中的用户偏好/约束；若使用 RAG 片段中的事实，后续总结须保留对应 [来源: …] 标记。\n\n" : ""}
${historyBlock}用户目标: ${goal.rawText}
已提取信息: ${JSON.stringify(goal.slots || {})}
用户偏好: ${JSON.stringify(context.preferences)}
${historyBlock ? "\n【多轮说明】若用户在「近期对话」中修订预算、节奏或某一天行程，请在 plannerRationale 中说明如何承接前文约束，并在 phases/steps 中体现修订（勿当作全新首次规划）。" : ""}

请生成一个**可执行且工具利用合理**的出行规划：步骤应细化到「查目的地 ${dest} 在 ${tripStart || "tripStart"}～${tripEnd || "tripEnd"} 的逐日天气」「目的地 ${dest} 内 poi_search 景点/餐饮」${crossCity ? `「rail_schedule_hint ${origin}→${dest} 车次」` : ""}；并与 travelThemes、pace、budgetCny、transportPreferences、accommodationType、dietaryPreset、travelParty、additionalNotes 相呼应（在 plannerRationale 中要点名如何服务这些偏好）。每个 (city, dateIso) 或 rail 查询在计划中**最多出现一次**。
**步骤 description 中凡出现公历日期、周几，必须与上文【未来14日】及「下周三」等权威对照行完全一致，禁止自行推算或写错星期。**
    `;

    const response = await this.llmClient.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, requestLabel: "plan_draft" }
    );

    const cleanJson = response.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsedPlan: { phases?: PlanPhase[] };
    try {
      parsedPlan = JSON.parse(cleanJson);
    } catch {
      throw new Error(`LLM 规划输出不是合法 JSON。原始片段: ${cleanJson.slice(0, 400)}`);
    }
    if (!parsedPlan.phases || !Array.isArray(parsedPlan.phases)) {
      throw new Error("LLM 规划 JSON 缺少 phases 数组");
    }

    const plannerRationale =
      typeof (parsedPlan as { plannerRationale?: unknown }).plannerRationale === "string"
        ? String((parsedPlan as { plannerRationale: string }).plannerRationale).trim()
        : undefined;

    return {
      planId: `plan_${Date.now()}_${input.sessionId}`,
      plannerRationale: plannerRationale || undefined,
      phases: sanitizePlanPhases(parsedPlan.phases, allowedSet),
    };
  }

  async revisePlan(plan: ExecutionPlan, feedback: string): Promise<ExecutionPlan> {
    const allowedNames = this.lastRunInput
      ? allowedToolsForInput(this.lastRunInput)
      : [...TOOL_NAMES];
    const toolsListText = formatAllowedToolsList(allowedNames);
    const allowedSet = new Set<string>(allowedNames);
    const systemPrompt = appendSkillSection(
      `你是一个计划修订专家。根据用户或工具反馈的错误信息，对现有的执行计划进行修订。
输出合法 JSON，根级须含 plannerRationale（简述本次修订动机与结构调整）、phases 数组，不要 Markdown。
【严格】每个 step 的 suggestedTools 只能包含：${toolsListText}；禁止编造其他工具名。`,
      this.lastSkillSystemSection
    );
    const historyBlock = formatHistoryForPrompt(
      this.lastRunInput?.history,
      this.lastRunInput?.contextBundle?.conversationSummary
    );
    const knowledgeBlock = formatAgentKnowledgeContext(this.lastRunInput?.contextBundle);
    const userPrompt = `
${buildAgentTimeContextLines().join("\n")}

${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}
${historyBlock}当前计划: ${JSON.stringify(plan)}
反馈信息: ${feedback}
请输出修订后的完整 JSON 计划（含 plannerRationale）。步骤中的日期、周几必须与上文【未来14日】及「下周三」等对照一致。
${historyBlock ? "若反馈来自多轮对话中的追问，保留未提及天数/约束的既有安排，仅修订相关部分。" : ""}
    `;

    const response = await this.llmClient.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, requestLabel: "plan_revise" }
    );
    const cleanJson = response.replace(/```json/g, "").replace(/```/g, "").trim();
    let revised: Partial<ExecutionPlan>;
    try {
      revised = JSON.parse(cleanJson);
    } catch {
      throw new Error(`LLM 修订计划输出不是合法 JSON。片段: ${cleanJson.slice(0, 400)}`);
    }
    const nextRationale =
      typeof revised.plannerRationale === "string" && revised.plannerRationale.trim()
        ? revised.plannerRationale.trim()
        : plan.plannerRationale;

    const phases = sanitizePlanPhases(
      Array.isArray(revised.phases) ? revised.phases : plan.phases,
      allowedSet
    );

    return {
      planId: revised.planId ?? plan.planId,
      plannerRationale: nextRationale,
      phases,
    };
  }
}
