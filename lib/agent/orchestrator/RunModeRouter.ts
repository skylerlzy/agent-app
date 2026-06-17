import type { AgentRunMode, ChatMessage, IRunModeRouter } from "../contracts";
import type { RunModeDecision } from "./runModeDecision";

export interface RunModeRouterInput {
  goalText: string;
  history: ChatMessage[];
  hasExistingPlan: boolean;
  planSummaryHint?: string;
}

/** @deprecated 仅作类型导出；运行模式由 LLMRunModeRouter 决定，不再使用规则匹配 */
export function decideRunMode(_input: RunModeRouterInput): AgentRunMode {
  return "full_plan_execute";
}

/** 已废弃：请使用 LLMRunModeRouter */
export class RunModeRouter implements IRunModeRouter {
  async decide(input: RunModeRouterInput): Promise<RunModeDecision> {
    return {
      mode: input.hasExistingPlan ? "incremental_revise" : "full_plan_execute",
      source: "fallback",
      reason: "启发式路由已移除，此为占位回退",
    };
  }
}
