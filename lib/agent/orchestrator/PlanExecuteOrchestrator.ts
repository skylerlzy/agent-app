import type {
  AgentRunInput,
  ExecutionPlan,
  IAutonomousAgent,
  IPlanGenerator,
  IReactExecutor,
  ITraceSink,
  ReasoningEvent,
} from "../contracts";
import { SessionEmitter } from "../runtime/SessionEmitter";

function flattenSteps(plan: ExecutionPlan) {
  return plan.phases.flatMap((phase) => phase.steps);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Default autonomous Agent orchestrator.
 * It owns the runtime order: session start, planning, step execution, and final
 * completion/error events. Concrete LLM, tool, and reflexion modules stay
 * injectable through contracts.
 */
export class PlanExecuteOrchestrator implements IAutonomousAgent {
  constructor(
    private readonly planGenerator: IPlanGenerator,
    private readonly reactExecutor: IReactExecutor,
    private readonly traceSink?: ITraceSink
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<ReasoningEvent> {
    const emitter = new SessionEmitter(input.sessionId);

    const push = async (event: ReasoningEvent) => {
      if (!this.traceSink) return;
      try {
        await this.traceSink.emit(event);
      } catch (error) {
        console.warn("Trace sink emit failed", error);
      }
    };

    const startEvent = emitter.emit({
      type: "session_start",
      payload: { goal: input.goal.rawText },
    });
    yield startEvent;
    await push(startEvent);

    let plan: ExecutionPlan;
    try {
      plan = await this.planGenerator.draftPlan(input);
    } catch (error) {
      const errorEvent = emitter.emit({
        type: "run_error",
        payload: { message: `Failed to draft plan: ${errorMessage(error)}` },
      });
      yield errorEvent;
      await push(errorEvent);
      return;
    }

    const draftEvent = emitter.emit({ type: "plan_draft", payload: { plan } });
    yield draftEvent;
    await push(draftEvent);

    try {
      plan = await this.planGenerator.revisePlan(
        plan,
        "Initial runtime revision before step execution."
      );
    } catch (error) {
      const errorEvent = emitter.emit({
        type: "run_error",
        payload: { message: `Failed to revise plan: ${errorMessage(error)}` },
      });
      yield errorEvent;
      await push(errorEvent);
      return;
    }

    const finalPlanEvent = emitter.emit({ type: "plan_final", payload: { plan } });
    yield finalPlanEvent;
    await push(finalPlanEvent);

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
          if (event.type === "run_error") return;
        }
      } catch (error) {
        const errorEvent = emitter.emit({
          type: "run_error",
          payload: { message: `Step ${step.id} failed: ${errorMessage(error)}` },
        });
        yield errorEvent;
        await push(errorEvent);
        return;
      }
    }

    const doneEvent = emitter.emit({
      type: "run_done",
      payload: { summary: `Agent run completed ${flattenSteps(plan).length} planned step(s).` },
    });
    yield doneEvent;
    await push(doneEvent);
  }
}
