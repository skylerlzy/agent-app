import type {
  AgentRunInput,
  ExecutionPlan,
  IAutonomousAgent,
  ILLMClient,
  IPlanGenerator,
  IReactExecutor,
  ITraceSink,
  IToolRegistry,
  ReasoningEvent,
} from "../contracts";
import { buildRunDoneTravelOutput, preferDeterministicFinalize, shouldSkipNarrativePolish, type ToolLogEntry } from "./finalTravelSummary";
import { buildRunModeEventPayload } from "./runModeDecision";
import { agentDebug } from "../debugLog";
import { SessionEmitter } from "../runtime/SessionEmitter";
import { ensurePlanMatchesDestination } from "../plan/planDestinationPreflight";
import { ensureEssentialPlanSteps } from "../plan/ensureEssentialPlanSteps";
import { planDraftIsExecutionReady } from "../plan/planReadiness";
import { supplementTripToolLogs } from "../tripPlan/supplementTripToolLogs";

function flattenSteps(plan: ExecutionPlan) {
  return plan.phases.flatMap((phase) => phase.steps ?? []);
}

/** LLM 可能产出 s0、跳号或重复 id；执行前按遍历顺序统一为 s1..sn，避免轨迹与计划错位 */
function canonicalizePlanStepIds(plan: ExecutionPlan): ExecutionPlan {
  let k = 0;
  const phases = plan.phases.map((ph) => ({
    ...ph,
    steps: (ph.steps ?? []).map((st) => {
      k += 1;
      return { ...st, id: `s${k}` };
    }),
  }));
  return { planId: plan.planId, phases };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error != null && typeof error === "object" && "name" in error) {
    const n = (error as { name?: string; message?: string }).name;
    const m = (error as { message?: string }).message;
    if (n === "AbortError") return m && m !== "AbortError" ? m : "请求已被中止（常见为 HTTP 超时）";
  }
  return String(error);
}

/** 计划修订为第二次 LLM 调用，易超时/限流；此类错误可降级为沿用初稿 */
function isRevisePlanRecoverableFailure(message: string): boolean {
  return /abort|超时|timeout|限流|429|rate|ECONNRESET|ETIMEDOUT|network|fetch failed|中止/i.test(message);
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
    private readonly traceSink?: ITraceSink,
    /** 用于跑完全部步骤后生成「旅行稿」式 Markdown 总结（与示例项目最终输出对齐） */
    private readonly summaryLlm?: ILLMClient,
    private readonly toolRegistry?: IToolRegistry
  ) {}

  async *run(input: AgentRunInput): AsyncIterable<ReasoningEvent> {
    const emitter = new SessionEmitter(input.sessionId);

    const push = async (event: ReasoningEvent) => {
      if (!this.traceSink) return;
      await this.traceSink.emit(event);
    };

    const startEvent = emitter.emit({
      type: "session_start",
      payload: { goal: input.goal.rawText },
    });
    yield startEvent;
    await push(startEvent);

    const modeEvent = emitter.emit({
      type: "run_mode",
      payload: buildRunModeEventPayload(input.runMode ?? "full_plan_execute", input.runModeMeta),
    });
    yield modeEvent;
    await push(modeEvent);

    let plan: ExecutionPlan;
    try {
      plan = canonicalizePlanStepIds(await this.planGenerator.draftPlan(input));
      plan = canonicalizePlanStepIds(await ensurePlanMatchesDestination(this.planGenerator, plan, input));
      plan = canonicalizePlanStepIds(ensureEssentialPlanSteps(plan, input));
    } catch (error) {
      const msg = `Failed to draft plan: ${errorMessage(error)}`;
      const errorEvent = emitter.emit({
        type: "run_error",
        payload: { message: msg },
      });
      yield errorEvent;
      await push(errorEvent);
      throw new Error(msg);
    }

    const draftEvent = emitter.emit({ type: "plan_draft", payload: { plan } });
    yield draftEvent;
    await push(draftEvent);

    const skipRevise =
      process.env.SKIP_PLAN_REVISION === "1" ||
      process.env.SKIP_PLAN_REVISION === "true" ||
      planDraftIsExecutionReady(plan, input);
    if (skipRevise) {
      const reason = planDraftIsExecutionReady(plan, input)
        ? "初稿结构已满足执行要求（含天气/POI/餐饮/铁路等步骤），跳过计划修订。"
        : "已按环境变量 SKIP_PLAN_REVISION 跳过计划修订，直接使用初稿。";
      agentDebug(`[agent] skip revisePlan: ${reason}`);
      const note = emitter.emit({
        type: "reflexion",
        payload: {
          stepId: "__plan_revision__",
          diagnosis: reason,
          nextAction: "skip",
        },
      });
      yield note;
      await push(note);
    } else {
      try {
        plan = canonicalizePlanStepIds(
          await this.planGenerator.revisePlan(
            plan,
            "Initial runtime revision before step execution."
          )
        );
        plan = canonicalizePlanStepIds(
          await ensurePlanMatchesDestination(this.planGenerator, plan, input)
        );
        plan = canonicalizePlanStepIds(ensureEssentialPlanSteps(plan, input));
      } catch (error) {
        const raw = errorMessage(error);
        if (isRevisePlanRecoverableFailure(raw)) {
          const note = emitter.emit({
            type: "reflexion",
            payload: {
              stepId: "__plan_revision__",
              diagnosis: `计划修订未成功（${raw}），已跳过修订并沿用初稿计划继续执行。`,
              nextAction: "skip",
            },
          });
          yield note;
          await push(note);
        } else {
          const msg = `Failed to revise plan: ${raw}`;
          const errorEvent = emitter.emit({
            type: "run_error",
            payload: { message: msg },
          });
          yield errorEvent;
          await push(errorEvent);
          throw new Error(msg);
        }
      }
    }

    const finalPlanEvent = emitter.emit({ type: "plan_final", payload: { plan } });
    yield finalPlanEvent;
    await push(finalPlanEvent);

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
          skillSystemSection: input.skillSystemSection,
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
          if (event.type === "run_error") {
            const re = event as { type: "run_error"; payload: { message: string } };
            throw new Error(re.payload.message);
          }
        }
      } catch (error) {
        const msg = `Step ${step.id} failed: ${errorMessage(error)}`;
        const errorEvent = emitter.emit({
          type: "run_error",
          payload: { message: msg },
        });
        yield errorEvent;
        await push(errorEvent);
        throw new Error(msg);
      }
    }

    let finalToolLogs = toolLogs;
    const useDeterministicFinalize = preferDeterministicFinalize(toolLogs);

    const shouldSupplementFood =
      !useDeterministicFinalize &&
      this.toolRegistry &&
      (process.env.FORCE_FOOD_SUPPLEMENT === "1" || process.env.FORCE_FOOD_SUPPLEMENT === "true");

    if (shouldSupplementFood && this.toolRegistry) {
      const supplementThought = emitter.emit({
        type: "react_thought",
        payload: {
          turnIndex: 0,
          thought: "全部步骤已完成，正在校验餐饮 POI 是否充足…",
          toolName: null,
          toolArguments: null,
          toolResultSummary: "",
        },
      });
      yield supplementThought;
      await push(supplementThought);

      const supplemented = await supplementTripToolLogs(this.toolRegistry, input, toolLogs);
      finalToolLogs = supplemented.logs;
      if (supplemented.supplemented.length > 0) {
        agentDebug(
          `[agent] supplemented ${supplemented.supplemented.length} food poi_search call(s) before summary`
        );
      }
    }

    const summaryThought = emitter.emit({
      type: "react_thought",
      payload: {
        turnIndex: 0,
        thought: useDeterministicFinalize
          ? shouldSkipNarrativePolish()
            ? "正在根据工具观测组装结构化行程…"
            : "正在组装行程骨架并由 LLM 润色文案（限时单次润色）…"
          : "正在根据工具观测生成结构化行程方案…",
        toolName: null,
        toolArguments: null,
        toolResultSummary: "",
      },
    });
    yield summaryThought;
    await push(summaryThought);

    const travelOutput = await buildRunDoneTravelOutput(this.summaryLlm, input, plan, finalToolLogs);

    const doneEvent = emitter.emit({
      type: "run_done",
      payload: {
        summary: travelOutput.chatReply,
        tripPlanStructured: travelOutput.tripPlan,
        updatesMasterPlan: true,
      },
    });
    yield doneEvent;
    await push(doneEvent);
  }
}
