import type {
  AgentRunInput,
  ExecutionPlan,
  IPlanGenerator,
  ILLMClient,
  PlanPhase,
  PlanStep,
  ToolName
} from "../contracts";

/**
 * 成员2 实现：基于 LLM 的自治计划生成器
 */
export class LLMPlanGenerator implements IPlanGenerator {
  constructor(private llmClient: ILLMClient) {}

  async draftPlan(input: AgentRunInput): Promise<ExecutionPlan> {
    const { goal, context } = input;

    // 1. 构建系统提示词 (System Prompt)
    // 明确告诉模型：必须输出 JSON，且必须符合我们的接口定义
    const systemPrompt = `
你是一个专业的智能出行与日程协调助手。你的任务是根据用户的目标和上下文，制定一个多阶段的执行计划。

【可用工具清单】
- weather_forecast: 获取目的地天气。
- maps_route_estimate: 估算两地间的交通时间。
- calendar_conflict_check: 检查建议的时间段是否与用户现有日程冲突。

【输出要求】
1. 必须严格按照 JSON 格式输出，不要包含任何解释性文字。
2. 计划应分为若干个逻辑阶段 (phases)。
3. 每个步骤 (step) 必须有清晰的描述，并指明建议调用的工具。
4. JSON 结构参考：
{
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

    // 2. 构建用户提示词 (User Prompt)
    const userPrompt = `
用户目标: ${goal.rawText}
已提取信息: ${JSON.stringify(goal.slots || {})}
用户偏好: ${JSON.stringify(context.preferences)}

请生成一个合理的出行规划和日程检测计划。
    `;

    try {
      // 3. 调用 LLM
      const response = await this.llmClient.complete([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], { temperature: 0.2 }); // 低温度保证 JSON 输出稳定

      // 4. 解析结果并处理可能的 Markdown 标记
      const cleanJson = response.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedPlan = JSON.parse(cleanJson);

      return {
        planId: `plan_${Date.now()}_${input.sessionId}`,
        phases: parsedPlan.phases
      };
    } catch (error) {
      console.error("LLM 规划生成失败，使用降级方案", error);
      // 如果 LLM 失败，返回一个最基础的保底计划，确保系统不崩溃
      return this.getFallbackPlan(input);
    }
  }

  async revisePlan(plan: ExecutionPlan, feedback: string): Promise<ExecutionPlan> {
    const systemPrompt = `你是一个计划修订专家。根据用户或工具反馈的错误信息，对现有的执行计划进行修订。`;
    const userPrompt = `
当前计划: ${JSON.stringify(plan)}
反馈信息: ${feedback}
请输出修订后的完整 JSON 计划。
    `;

    try {
      const response = await this.llmClient.complete([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);
      const cleanJson = response.replace(/```json/g, "").replace(/```/g, "").trim();
      const revised = JSON.parse(cleanJson) as Partial<ExecutionPlan>;
      return {
        planId: revised.planId ?? plan.planId,
        phases: Array.isArray(revised.phases) ? revised.phases : plan.phases,
      };
    } catch (e) {
      return plan; // 修订失败则返回原计划
    }
  }

  // 降级保底方案
  private getFallbackPlan(input: AgentRunInput): ExecutionPlan {
    return {
      planId: `fallback_${input.sessionId}`,
      phases: [{
        id: "p_fallback",
        title: "基础行程检查",
        steps: [{
          id: "s_fallback",
          description: "检查目的地基础信息",
          suggestedTools: ["weather_forecast"]
        }]
      }]
    };
  }
}