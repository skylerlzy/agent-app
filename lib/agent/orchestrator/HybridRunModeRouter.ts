import type { ILLMClient, IRunModeRouter } from "../contracts";
import { LLMRunModeRouter } from "./LLMRunModeRouter";
import { RunModeRouter, decideRunMode, type RunModeRouterInput } from "./RunModeRouter";
import {
  llmRunModeRouterEnabled,
  type RunModeDecision,
} from "./runModeDecision";

const LLM_CONFIDENCE_THRESHOLD = 0.55;

/**
 * 优先 LLM 语义路由；失败或低置信且与规则冲突时回退启发式。
 */
export class HybridRunModeRouter implements IRunModeRouter {
  private readonly llmRouter: LLMRunModeRouter;
  private readonly fallback: RunModeRouter;

  constructor(llm: ILLMClient, fallback: IRunModeRouter = new RunModeRouter()) {
    this.llmRouter = new LLMRunModeRouter(llm);
    this.fallback = fallback instanceof RunModeRouter ? fallback : new RunModeRouter();
  }

  async decide(input: RunModeRouterInput): Promise<RunModeDecision> {
    if (!llmRunModeRouterEnabled()) {
      return this.fallback.decide(input);
    }

    try {
      const llmDecision = await this.llmRouter.classify(input);
      const heuristicMode = decideRunMode(input);

      if (llmDecision.mode === heuristicMode) {
        return llmDecision;
      }

      const confidence = llmDecision.confidence ?? 0;
      if (confidence >= LLM_CONFIDENCE_THRESHOLD) {
        return llmDecision;
      }

      return {
        mode: heuristicMode,
        source: "heuristic",
        reason: `LLM 置信度 ${confidence.toFixed(2)} 且与规则不一致，采用规则：${llmDecision.reason ?? llmDecision.mode}`,
        confidence,
      };
    } catch {
      return this.fallback.decide(input);
    }
  }
}
