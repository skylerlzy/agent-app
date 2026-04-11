import type { IReflexionPolicy, ToolArguments, ToolError, PlanStep, ReactTurn } from "../contracts";

/** 轻量策略：可重试错误则重试同参一次；否则跳过本步（成员4可替换为 LLM 诊断） */
export class ReflexionPolicy implements IReflexionPolicy {
  async decide(input: {
    step: PlanStep;
    error: ToolError;
    lastArgs: ToolArguments;
    history: ReactTurn[];
  }) {
    const retryCount = input.history.filter((h) => h.toolResultSummary.includes("retry")).length;
    if (input.error.retryable && retryCount < 1) {
      return {
        diagnosis: `工具失败（可重试）：${input.error.message}`,
        nextAction: "retry" as const,
        patchedArgs: input.lastArgs,
      };
    }
    return {
      diagnosis: `工具失败且不可自动恢复：${input.error.message}，跳过本步继续后续计划。`,
      nextAction: "skip" as const,
    };
  }
}
