import type { AgentRunInput, ExecutionPlan, IPlanGenerator, PlanPhase, PlanStep } from "../contracts";

/**
 * 占位计划生成器：仅保证框架可运行。
 * 自治 Agent 要求：**正式实现须由 LLM 根据 goal/context 动态产出** `ExecutionPlan`（成员2）。
 */
export class StubPlanGenerator implements IPlanGenerator {
  async draftPlan(input: AgentRunInput): Promise<ExecutionPlan> {
    const dest = input.goal.slots?.destination ?? "目的地";
    const steps: PlanStep[] = [
      {
        id: "autonomous_step_weather",
        description: `（占位）分析「${dest}」出行条件，调用天气工具。`,
        suggestedTools: ["weather_forecast"],
      },
      {
        id: "autonomous_step_route",
        description: "（占位）估计转场时间，调用地图路程工具。",
        suggestedTools: ["maps_route_estimate"],
      },
      {
        id: "autonomous_step_calendar",
        description: "（占位）协调用户日程，调用冲突检测工具。",
        suggestedTools: ["calendar_conflict_check"],
      },
    ];
    const phase: PlanPhase = {
      id: "phase_autonomous",
      title: "自治规划阶段（占位步骤，正式版由 LLM 生成）",
      steps,
    };
    return { planId: `plan_${input.sessionId}`, phases: [phase] };
  }

  async revisePlan(plan: ExecutionPlan, _feedback: string): Promise<ExecutionPlan> {
    return plan;
  }
}
