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

const ALLOWED_TOOLS = new Set<string>(TOOL_NAMES);

function sanitizePlanPhases(phases: PlanPhase[]): PlanPhase[] {
  return phases.map((ph) => ({
    ...ph,
    steps: (ph.steps ?? []).map((st) => {
      const raw = st.suggestedTools ?? [];
      const suggestedTools = raw.filter((n): n is ToolName => ALLOWED_TOOLS.has(n));
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

    const systemPrompt = appendSkillSection(
      `
你是一个专业的智能出行助手。你的任务是根据用户的目标和上下文，制定一个多阶段的执行计划。

【可用工具清单】（名称不可改；执行器会按步骤调用，**禁止同参重复**）
- weather_forecast：**能** 7/15/30 日逐日预报（precip 日总量）、实时、weekOutlook、airQualityAvailable；**不能** 超 30 日指定日、逐小时降水概率。超出范围时工具会 note + doNotRetrySameArgs，步骤应规划「查关键日一次即可」，禁止「查 AQI 直到返回」类循环步骤。
- maps_route_estimate：**仅** 同城 POI 间 walking/transit/driving 粗估；origin/destination 须「城市+具体 POI」。**禁止** 规划：跨城高铁/枢纽 transit、验证站内换乘 500m、12306 时刻/票价、同站步行 1 分钟类 OD。跨城铁路用文字+12306，不调用 maps。

【规划禁忌】
- 不要生成「反复调用直到 AQI 出现」「验证站内换乘通道步行距离」等步骤。
- 跨城段（如南京南→深圳北）勿用 maps；仅同城接驳（如「深圳市深圳北站→深圳市南山区某酒店」）可用 maps。
- 地名禁止「XX区域」「XX青旅」等模糊表述；示例：「深圳市南山区深圳湾公园南门」。

【输出要求】
1. 必须严格按照 JSON 格式输出，不要包含任何解释性文字或 Markdown 代码围栏。
2. 根对象必须包含字符串字段 plannerRationale（200–600 字）：说明如何理解用户目标、为何分这些阶段、各工具如何支撑结论（体现规划思考，而非罗列步骤）。**plannerRationale 为必填，不得省略。**
3. 计划应分为若干个逻辑阶段 (phases)，阶段数量与粒度由你根据目标复杂度决定。
4. 每个步骤 (step) 必须有清晰的描述，并指明建议调用的工具；步骤 id 须从 s1 起连续编号（s1,s2,s3…），不要使用 s0。
5. 【严格】每个 step 的 suggestedTools 只能从且仅能使用：weather_forecast、maps_route_estimate。禁止编造任何其它工具名（含 air_forecast、air_quality、flight_api、booking_service 等）；禁止在 JSON 或 plannerRationale 中暗示「再接入」未列出的 API。
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

请生成一个**可执行且工具利用合理**的出行规划（仅使用已列出的两种工具）：步骤应细化到「查哪几天的天气」「哪几段**同城**路线」；**必须**结合用户给出的 **tripStartDateIso / tripEndDateIso**（或 goal.slots 中的 startDateIso/endDateIso）安排逐日天气查询与日程跨度，并与 travelThemes、pace、budgetCny、transportPreferences、accommodationType、dietaryPreset、travelParty、additionalNotes 相呼应（在 plannerRationale 中要点名如何服务这些偏好）。每个 (city, dateIso) 或 (origin, destination, mode) 组合在计划中**最多出现一次**。
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
      phases: sanitizePlanPhases(parsedPlan.phases),
    };
  }

  async revisePlan(plan: ExecutionPlan, feedback: string): Promise<ExecutionPlan> {
    const systemPrompt = appendSkillSection(
      `你是一个计划修订专家。根据用户或工具反馈的错误信息，对现有的执行计划进行修订。
输出合法 JSON，根级须含 plannerRationale（简述本次修订动机与结构调整）、phases 数组，不要 Markdown。
【严格】每个 step 的 suggestedTools 只能包含：weather_forecast、maps_route_estimate；禁止编造其他工具名。`,
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

    const phases = sanitizePlanPhases(Array.isArray(revised.phases) ? revised.phases : plan.phases);

    return {
      planId: revised.planId ?? plan.planId,
      plannerRationale: nextRationale,
      phases,
    };
  }
}
