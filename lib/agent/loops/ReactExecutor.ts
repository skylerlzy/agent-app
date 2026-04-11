import type {
  AgentRunInput,
  ExecutionPlan,
  IEventEmitter,
  IReactExecutor,
  IReflexionPolicy,
  IToolRegistry,
  PlanStep,
  ReactTurn,
  ReasoningEvent,
  ToolArguments,
  ToolName,
  UserContext,
  UserGoal,
} from "../contracts";

function stubToolArgs(tool: ToolName, input: Pick<AgentRunInput, "goal" | "context">): ToolArguments {
  const dest = (input.goal.slots?.destination ?? "杭州").split(/[,，]/)[0].trim();
  const origin = (input.goal.slots?.originCity ?? "南京").trim();
  const start = input.goal.slots?.startDateIso ? Date.parse(input.goal.slots.startDateIso) : Date.now();
  const end = input.goal.slots?.endDateIso ? Date.parse(input.goal.slots.endDateIso) : start + 86400000;
  switch (tool) {
    case "weather_forecast":
      return { city: dest };
    case "maps_route_estimate":
      return { origin, destination: dest, mode: "driving" as const };
    case "calendar_conflict_check":
      return { proposedStart: start, proposedEnd: end };
  }
}

/**
 * ReAct 风格单步执行器（框架层）。
 * 正式自治实现：由 LLM 决定 thought、工具与参数；此处用占位参数保证类型与事件流贯通。
 */
export class ReactExecutor implements IReactExecutor {
  constructor(
    private readonly registry: IToolRegistry,
    private readonly reflexion: IReflexionPolicy,
    private readonly maxTurns = 4
  ) {}

  async *executeStep(input: {
    sessionId: string;
    emitter: IEventEmitter;
    plan: ExecutionPlan;
    step: PlanStep;
    context: UserContext;
    goal: UserGoal;
  }): AsyncIterable<ReasoningEvent> {
    const { emitter, step, context, goal } = input;
    const history: ReactTurn[] = [];
    const primaryTool = (step.suggestedTools?.[0] ?? "weather_forecast") as ToolName;
    let args = stubToolArgs(primaryTool, { goal, context });
    let turn = 0;
    let done = false;

    while (!done && turn < this.maxTurns) {
      const thought: ReactTurn = {
        turnIndex: turn,
        thought: `（框架占位）自治推理将在此处由 LLM 生成；本步工具 ${primaryTool}`,
        toolName: primaryTool,
        toolArguments: args,
        toolResultSummary: "",
      };
      yield emitter.emit({ type: "react_thought", payload: thought });

      const def = this.registry.get(primaryTool);
      if (!def) {
        yield emitter.emit({ type: "run_error", payload: { message: `未注册工具: ${primaryTool}` } });
        return;
      }

      const parsed = def.argsSchema.safeParse(args);
      if (!parsed.success) {
        yield emitter.emit({
          type: "tool_error",
          payload: {
            stepId: step.id,
            toolName: primaryTool,
            error: { code: "SCHEMA", message: parsed.error.message, retryable: false },
          },
        });
        return;
      }

      yield emitter.emit({
        type: "tool_call",
        payload: { stepId: step.id, toolName: primaryTool, args: parsed.data as Record<string, unknown> },
      });

      const result = await def.execute(parsed.data, {
        userId: context.userId,
        stepId: step.id,
        userContext: context,
      });

      if (result.ok) {
        const summary = JSON.stringify(result.data).slice(0, 500);
        history.push({ ...thought, toolResultSummary: summary });
        yield emitter.emit({
          type: "tool_result",
          payload: { stepId: step.id, toolName: primaryTool, summary },
        });
        done = true;
      } else {
        yield emitter.emit({
          type: "tool_error",
          payload: { stepId: step.id, toolName: primaryTool, error: result.error },
        });
        const decision = await this.reflexion.decide({ step, error: result.error, lastArgs: args, history });
        yield emitter.emit({
          type: "reflexion",
          payload: { stepId: step.id, diagnosis: decision.diagnosis, nextAction: decision.nextAction },
        });
        if (decision.nextAction === "retry" && decision.patchedArgs) {
          args = decision.patchedArgs;
          turn++;
          continue;
        }
        if (decision.nextAction === "abort") return;
        done = true;
      }
      turn++;
    }

    yield emitter.emit({ type: "step_done", payload: { stepId: step.id } });
  }
}
