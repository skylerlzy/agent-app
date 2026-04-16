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
  return plan.phases.flatMap((p) => p.steps);
}

/**
 * 自治 Agent 编排器：Plan-and-Execute 调度 + 逐步 ReAct + 可选 Reflexion。
 * 计划内容与工具策略须由 LLM 在运行时注入（见 StubPlanGenerator / ReactExecutor 说明）。
 */
export class PlanExecuteOrchestrator implements IAutonomousAgent {
  constructor(
    private readonly planGenerator: IPlanGenerator,
    private readonly reactExecutor: IReactExecutor,
    private readonly traceSink?: ITraceSink
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<ReasoningEvent> {
    const emitter = new SessionEmitter(input.sessionId);

    const push = async (e: ReasoningEvent) => {
      if (this.traceSink) await this.traceSink.emit(e);
    };

    let plan = await this.planGenerator.draftPlan(input);
    const ev0 = emitter.emit({ type: "session_start", payload: { goal: input.goal.rawText } });
    yield ev0;
    await push(ev0);

    const ev1 = emitter.emit({ type: "plan_draft", payload: { plan } });
    yield ev1;
    await push(ev1);

    plan = await this.planGenerator.revisePlan(plan, "autonomous_revision_placeholder");
    const ev2 = emitter.emit({ type: "plan_final", payload: { plan } });
    yield ev2;
    await push(ev2);

    for (const step of flattenSteps(plan)) {
      let stopped = false;
      for await (const ev of this.reactExecutor.executeStep({
        sessionId: input.sessionId,
        emitter,
        plan,
        step,
        context: input.context,
        goal: input.goal,
      })) {
        yield ev;
        await push(ev);
        if (ev.type === "run_error") {
          stopped = true;
          break;
        }
      }
      if (stopped) return;
    }

    const summary = `自治运行结束：共执行 ${flattenSteps(plan).length} 步（框架占位文案）。`;
    const evDone = emitter.emit({ type: "run_done", payload: { summary } });
    yield evDone;
    await push(evDone);
  }
}
