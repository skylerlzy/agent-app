import type {
  AgentRunInput,
  ExecutionPlan,
  IMultiAgentCoordinator,
  IPlanGenerator,
  IReactExecutor,
  ITraceSink,
  ReasoningEvent,
  ILLMClient,
} from "../contracts";
import { buildRunDoneTravelOutput, type ToolLogEntry } from "./finalTravelSummary";
import { buildRunModeEventPayload } from "./runModeDecision";
import { SessionEmitter } from "../runtime/SessionEmitter";

function flattenSteps(plan: ExecutionPlan) {
  return plan.phases.flatMap((phase) => phase.steps ?? []);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Multi-Agent 协调器（可选亮点）：
 * 将完整 Plan-Execute 拆为 planner → tool_runner → summarizer 三角色，
 * 通过 agent_handoff 事件可视化角色切换。
 */
export class MultiAgentCoordinator implements IMultiAgentCoordinator {
  constructor(
    private readonly planGenerator: IPlanGenerator,
    private readonly reactExecutor: IReactExecutor,
    private readonly traceSink?: ITraceSink,
    private readonly summaryLlm?: ILLMClient
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<ReasoningEvent> {
    const emitter = new SessionEmitter(input.sessionId);
    const push = async (event: ReasoningEvent) => {
      if (this.traceSink) await this.traceSink.emit(event);
    };

    const start = emitter.emit({
      type: "session_start",
      payload: { goal: input.goal.rawText },
    });
    yield start;
    await push(start);

    const modeEvent = emitter.emit({
      type: "run_mode",
      payload: buildRunModeEventPayload(input.runMode ?? "full_plan_execute", input.runModeMeta),
    });
    yield modeEvent;
    await push(modeEvent);

    let plan: ExecutionPlan;
    try {
      plan = await this.planGenerator.draftPlan(input);
    } catch (error) {
      const msg = `Planner failed: ${errorMessage(error)}`;
      const err = emitter.emit({ type: "run_error", payload: { message: msg } });
      yield err;
      await push(err);
      throw new Error(msg);
    }

    const draft = emitter.emit({ type: "plan_draft", payload: { plan } });
    yield draft;
    await push(draft);

    try {
      plan = await this.planGenerator.revisePlan(plan, "Multi-agent planner revision.");
    } catch {
      /* 修订失败沿用初稿 */
    }

    const finalPlan = emitter.emit({ type: "plan_final", payload: { plan } });
    yield finalPlan;
    await push(finalPlan);

    const handoff1 = emitter.emit({
      type: "agent_handoff",
      payload: { from: "planner", to: "tool_runner" },
    });
    yield handoff1;
    await push(handoff1);

    const toolLogs: ToolLogEntry[] = [];
    for (const step of flattenSteps(plan)) {
      try {
        for await (const event of this.reactExecutor.executeStep({
          sessionId: input.sessionId,
          emitter,
          plan,
          step,
          context: input.context,
          goal: input.goal,
        })) {
          yield event;
          await push(event);
          if (event.type === "tool_result") {
            toolLogs.push({
              stepId: event.payload.stepId,
              toolName: event.payload.toolName,
              summary: event.payload.summary,
            });
          }
        }
      } catch (error) {
        const msg = `Tool runner failed at ${step.id}: ${errorMessage(error)}`;
        const err = emitter.emit({ type: "run_error", payload: { message: msg } });
        yield err;
        await push(err);
        throw new Error(msg);
      }
    }

    const handoff2 = emitter.emit({
      type: "agent_handoff",
      payload: { from: "tool_runner", to: "summarizer" },
    });
    yield handoff2;
    await push(handoff2);

    const travelOutput = await buildRunDoneTravelOutput(this.summaryLlm, input, plan, toolLogs);
    const done = emitter.emit({
      type: "run_done",
      payload: {
        summary: travelOutput.chatReply,
        tripPlanStructured: travelOutput.tripPlan,
        updatesMasterPlan: true,
      },
    });
    yield done;
    await push(done);
  }
}
