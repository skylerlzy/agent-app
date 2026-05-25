import type { AgentRunInput, IAutonomousAgent, ReasoningEvent } from "../contracts";

/**
 * 按 runMode 分发到完整 Plan-Execute、快速回复或增量修订工作流。
 * run_mode 事件由各子工作流在同一 SessionEmitter 内发出，避免 seq 重复。
 */
export class RunModeRoutingAgent implements IAutonomousAgent {
  constructor(
    private readonly fullPlanExecute: IAutonomousAgent,
    private readonly quickReply: IAutonomousAgent,
    private readonly incrementalRevise: IAutonomousAgent
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<ReasoningEvent> {
    const mode = input.runMode ?? "full_plan_execute";

    const delegate =
      mode === "quick_reply"
        ? this.quickReply
        : mode === "incremental_revise"
          ? this.incrementalRevise
          : this.fullPlanExecute;

    for await (const event of delegate.run(input)) {
      if (event.type === "run_done" && mode === "full_plan_execute") {
        yield {
          ...event,
          payload: { ...event.payload, updatesMasterPlan: true },
        };
      } else {
        yield event;
      }
    }
  }
}
