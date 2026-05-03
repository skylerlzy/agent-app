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
  constructor(private llmClient: ILLMClient) {}

  async draftPlan(input: AgentRunInput): Promise<ExecutionPlan> {
    const { goal, context } = input;

    const systemPrompt = `
你是一个专业的智能出行助手。你的任务是根据用户的目标和上下文，制定一个多阶段的执行计划。

【可用工具清单】（名称不可改；执行器会按步骤多次调用）
- weather_forecast：和风 GeoAPI 定位城市 → 实时 now、可选 dateIso 匹配 7 日预报单日、空气质量 air/now；**每次返回还附带未来 7 日 outlook 文本**，便于安排连续行程与穿衣。应规划对**多城市 / 多日期**的查询步骤（出发地、目的地、关键游玩日）。
- maps_route_estimate：高德地理编码 + 路径规划。**应对不同 OD 分段**（枢纽→酒店、酒店→景区、景区间），mode 含 transit（同城）、walking（短距离）、driving（跨城或公交不可用时的路网近似）；返回 human-readable 耗时与公里数、过路费（若有）、跨城时含「勿当作高铁时刻」提示。

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
    `;

    const userPrompt = `
${buildAgentTimeContextLines().join("\n")}

用户目标: ${goal.rawText}
已提取信息: ${JSON.stringify(goal.slots || {})}
用户偏好: ${JSON.stringify(context.preferences)}

请生成一个**可执行且工具利用充分**的出行规划（仅使用已列出的两种工具）：步骤应细化到「查哪几天的天气」「哪几段路线」；**必须**结合用户给出的 **tripStartDateIso / tripEndDateIso**（或 goal.slots 中的 startDateIso/endDateIso）安排逐日天气查询与日程跨度，并与 travelThemes、pace、budgetCny、transportPreferences、accommodationType、dietaryPreset、travelParty、additionalNotes 相呼应（在 plannerRationale 中要点名如何服务这些偏好）。
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
    const systemPrompt = `你是一个计划修订专家。根据用户或工具反馈的错误信息，对现有的执行计划进行修订。
输出合法 JSON，根级须含 plannerRationale（简述本次修订动机与结构调整）、phases 数组，不要 Markdown。
【严格】每个 step 的 suggestedTools 只能包含：weather_forecast、maps_route_estimate；禁止编造其他工具名。`;
    const userPrompt = `
${buildAgentTimeContextLines().join("\n")}

当前计划: ${JSON.stringify(plan)}
反馈信息: ${feedback}
请输出修订后的完整 JSON 计划（含 plannerRationale）。步骤中的日期、周几必须与上文【未来14日】及「下周三」等对照一致。
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
