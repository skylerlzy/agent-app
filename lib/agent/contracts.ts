/**
 * 迭代二任务一 — 全项目接口契约（单一事实来源）
 * 实现类须保持与本文档一致的类型与语义；变更需经 Code Review 并同步 docs。
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// 领域：用户意图与出行上下文
// ---------------------------------------------------------------------------

/** 用户在一次对话/任务中的自然语言目标 */
export interface UserGoal {
  /** 原始输入 */
  rawText: string;
  /** 可选：结构化槽位（由 NLU 或 LLM 预填） */
  slots?: Partial<{
    originCity: string;
    destination: string;
    startDateIso: string;
    endDateIso: string;
    budgetCny: number;
    pace: "slow" | "balanced" | "fast";
  }>;
}

/** 与「日程协调」相关的用户日历占用（忙碌区间） */
export interface BusyWindow {
  start: number;
  end: number;
  label?: string;
}

/** Agent 运行时的用户侧上下文（不含密钥） */
export interface UserContext {
  userId: string;
  /** 偏好与约束，供规划阶段使用 */
  preferences: TripPreferences;
  /** 已知忙碌时间，用于日程冲突检测工具 */
  calendarBusyWindows?: BusyWindow[];
}

export interface TripPreferences {
  dietaryNotes?: string;
  mobilityNeeds?: string;
  maxDailyTransitMinutes?: number;
}

// ---------------------------------------------------------------------------
// 规划阶段（Plan-and-Execute 外层）
// ---------------------------------------------------------------------------

export interface PlanStep {
  id: string;
  /** 自然语言描述，供执行器与可视化使用 */
  description: string;
  /** 建议本步可调用的工具名（可选，执行器可覆盖） */
  suggestedTools?: ToolName[];
}

export interface ExecutionPlan {
  planId: string;
  /** 高层阶段，便于演示「先规划再执行」 */
  phases: PlanPhase[];
}

export interface PlanPhase {
  id: string;
  title: string;
  steps: PlanStep[];
}

// ---------------------------------------------------------------------------
// 工具层（至少 2 个主题相关外部工具；此处固定三个接口名）
// ---------------------------------------------------------------------------

export const TOOL_NAMES = [
  "weather_forecast",
  "maps_route_estimate",
  "calendar_conflict_check",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolContext {
  userId: string;
  /** 当前计划步骤 id */
  stepId: string;
  /** 只读的用户上下文快照 */
  userContext: UserContext;
}

/** 单次工具入参（由各工具的 Zod schema 校验） */
export type ToolArguments = Record<string, unknown>;

export interface ToolSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ToolFailure {
  ok: false;
  error: ToolError;
}

export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

export interface ToolError {
  code: string;
  message: string;
  /** 是否允许由 Reflexion 策略自动重试或改参 */
  retryable: boolean;
  /** 原始异常或上游 HTTP 状态，便于日志 */
  cause?: unknown;
}

/** 工具定义：名称、描述、参数 schema、执行函数 */
export interface ToolDefinition<TArgs = ToolArguments, TData = unknown> {
  name: ToolName;
  description: string;
  /** Zod schema，用于 LLM 生成参数前校验 */
  argsSchema: z.ZodType<TArgs>;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult<TData>>;
}

// ---------------------------------------------------------------------------
// ReAct 内环：单步推理记录
// ---------------------------------------------------------------------------

export interface ReactTurn {
  turnIndex: number;
  thought: string;
  toolName: ToolName | null;
  toolArguments: ToolArguments | null;
  toolResultSummary: string;
}

// ---------------------------------------------------------------------------
// 可视化事件流（满足「内部状态流转」）
// ---------------------------------------------------------------------------

export type ReasoningEventType =
  | "session_start"
  | "plan_draft"
  | "plan_final"
  | "react_thought"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "reflexion"
  | "step_done"
  | "run_done"
  | "run_error";

export interface ReasoningEventBase {
  seq: number;
  ts: number;
  sessionId: string;
  type: ReasoningEventType;
}

export type ReasoningEvent =
  | (ReasoningEventBase & { type: "session_start"; payload: { goal: string } })
  | (ReasoningEventBase & { type: "plan_draft"; payload: { plan: ExecutionPlan } })
  | (ReasoningEventBase & { type: "plan_final"; payload: { plan: ExecutionPlan } })
  | (ReasoningEventBase & { type: "react_thought"; payload: ReactTurn })
  | (ReasoningEventBase & {
      type: "tool_call";
      payload: { stepId: string; toolName: ToolName; args: ToolArguments };
    })
  | (ReasoningEventBase & {
      type: "tool_result";
      payload: { stepId: string; toolName: ToolName; summary: string };
    })
  | (ReasoningEventBase & {
      type: "tool_error";
      payload: { stepId: string; toolName: ToolName; error: ToolError };
    })
  | (ReasoningEventBase & {
      type: "reflexion";
      payload: { stepId: string; diagnosis: string; nextAction: "retry" | "skip" | "abort" };
    })
  | (ReasoningEventBase & { type: "step_done"; payload: { stepId: string } })
  | (ReasoningEventBase & { type: "run_done"; payload: { summary: string } })
  | (ReasoningEventBase & { type: "run_error"; payload: { message: string } });

// ---------------------------------------------------------------------------
// Agent 运行入口
// ---------------------------------------------------------------------------

export interface AgentRunInput {
  sessionId: string;
  goal: UserGoal;
  context: UserContext;
}

export interface IAgentOrchestrator {
  /**
   * 执行完整「Plan-and-Execute + ReAct 工具环 + Reflexion」流程，
   * 以异步迭代器形式产出可视化事件（顺序即状态流转顺序）。
   */
  run(input: AgentRunInput): AsyncIterable<ReasoningEvent>;
}

/**
 * 自治 Agent：以用户目标为驱动，在运行时决定计划结构、工具选择与参数，
 * 而非由业务代码写死的固定流水线。正式环境中由 LLM 通过 IPlanGenerator / IReactExecutor 注入推理。
 */
export interface IAutonomousAgent extends IAgentOrchestrator {}

export interface IPlanGenerator {
  /** 根据目标与上下文生成初版计划（可调用 LLM） */
  draftPlan(input: AgentRunInput): Promise<ExecutionPlan>;
  /** 在执行若干步后可选：压缩/修订后续计划 */
  revisePlan(plan: ExecutionPlan, feedback: string): Promise<ExecutionPlan>;
}

/** 由 SessionEmitter 实现，用于跨模块统一分配 seq（避免 Orchestrator 与 ReAct 序号冲突） */
export interface IEventEmitter {
  emit<E extends ReasoningEvent>(partial: Omit<E, "seq" | "ts" | "sessionId">): E;
}

export interface IReactExecutor {
  /** 对单个 PlanStep 执行 ReAct 循环直至完成或达到最大轮次 */
  executeStep(input: {
    sessionId: string;
    emitter: IEventEmitter;
    plan: ExecutionPlan;
    step: PlanStep;
    context: UserContext;
    goal: UserGoal;
  }): AsyncIterable<ReasoningEvent>;
}

export interface IReflexionPolicy {
  /** 工具失败后的诊断与决策 */
  decide(input: {
    step: PlanStep;
    error: ToolError;
    lastArgs: ToolArguments;
    history: ReactTurn[];
  }): Promise<{
    diagnosis: string;
    nextAction: "retry" | "skip" | "abort";
    /** retry 时的新参数（可选） */
    patchedArgs?: ToolArguments;
  }>;
}

export interface IToolRegistry {
  list(): ToolDefinition[];
  get(name: ToolName): ToolDefinition | undefined;
}

export interface ITraceSink {
  /** 将事件持久化或推送到前端（Convex / SSE） */
  emit(event: ReasoningEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// LLM 适配（禁止在业务代码中硬编码 API Key）
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ILLMClient {
  complete(messages: ChatMessage[], options?: { temperature?: number }): Promise<string>;
  /** 带工具定义的补全（用于 ReAct） */
  completeWithTools?(
    messages: ChatMessage[],
    tools: { name: string; description: string; parameters: object }[]
  ): Promise<{
    content: string | null;
    toolCalls?: { name: string; arguments: string }[];
  }>;
}
