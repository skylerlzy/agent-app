import type { IReflexionPolicy, ToolArguments, ToolError, PlanStep, ReactTurn } from "../contracts";

/** 失败回合在 history 中的前缀，供策略统计本步内失败次数（与 ReactExecutor 约定一致） */
export const FAILED_TURN_PREFIX = "FAILED:";

function countStepFailures(history: ReactTurn[]): number {
  return history.filter((h) => h.toolResultSummary.startsWith(FAILED_TURN_PREFIX)).length;
}

export interface ReflexionPolicyOptions {
  /** 对 retryable 错误自动重试的最大次数（不含首次调用） */
  maxRetries?: number;
}

/**
 * 规则型 Reflexion：结合 error.retryable、错误码与失败次数决定 retry / skip / abort。
 * 可与 LLMReflexionPolicy 组合作为兜底。
 */
export class ReflexionPolicy implements IReflexionPolicy {
  private readonly maxRetries: number;

  constructor(options?: ReflexionPolicyOptions) {
    this.maxRetries = options?.maxRetries ?? 2;
  }

  async decide(input: {
    step: PlanStep;
    error: ToolError;
    lastArgs: ToolArguments;
    history: ReactTurn[];
  }) {
    const { step, error, lastArgs, history } = input;
    const failures = countStepFailures(history);

    if (error.code === "MISSING_CONFIG") {
      return {
        diagnosis: `环境配置不足，无法调用外部接口（Reflexion 判定为不可自动修复）：${error.message}`,
        nextAction: "skip" as const,
      };
    }

    if (error.code === "AGENT_ABORT" || error.code === "AUTH" || error.code === "FATAL") {
      return {
        diagnosis: `关键错误（${error.code}），无法继续：${error.message}`,
        nextAction: "abort" as const,
      };
    }

    if (error.retryable && failures < this.maxRetries) {
      const patched = this.maybePatchArgs(lastArgs, error);
      return {
        diagnosis: `工具失败（可重试，第 ${failures + 1}/${this.maxRetries} 次）：${error.message}`,
        nextAction: "retry" as const,
        patchedArgs: patched,
      };
    }

    if (error.retryable && failures >= this.maxRetries) {
      return {
        diagnosis: `已达最大重试次数（${this.maxRetries}），放弃本步：${error.message}`,
        nextAction: "skip" as const,
      };
    }

    return {
      diagnosis: `工具失败且不可自动恢复（${error.code}）：${error.message}。跳过步骤「${step.description.slice(0, 80)}」并继续后续计划。`,
      nextAction: "skip" as const,
    };
  }

  /** 对常见参数问题做轻量修正，便于「重试成功」演示 */
  private maybePatchArgs(args: ToolArguments, error: ToolError): ToolArguments {
    const next = { ...args };
    const msg = error.message.toLowerCase();

    if (typeof next.city === "string" && (msg.includes("city") || msg.includes("城市"))) {
      next.city = String(next.city).trim();
    }
    if (typeof next.origin === "string") next.origin = String(next.origin).trim();
    if (typeof next.destination === "string") next.destination = String(next.destination).trim();

    return next;
  }
}
