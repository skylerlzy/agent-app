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

/** Agent 运行时的用户侧上下文（不含密钥） */
export interface UserContext {
  userId: string;
  /** 偏好与约束，供规划阶段使用 */
  preferences: TripPreferences;
}

export interface TripPreferences {
  /** 旅行开始日期 YYYY-MM-DD（与示例项目「旅行日期」一致，注入规划与天气 dateIso） */
  tripStartDateIso?: string;
  /** 旅行结束日期 YYYY-MM-DD（含返程日；须不早于 tripStartDateIso） */
  tripEndDateIso?: string;
  /** 自由补充的饮食说明（忌口的具体描述等） */
  dietaryNotes?: string;
  /** 与示例项目 Step2 一致的饮食预设 */
  dietaryPreset?: "none" | "vegetarian" | "halal" | "local";
  /** 旅行节奏，影响规划文案中「每日景点数量」建议 */
  pace?: "slow" | "balanced" | "fast";
  /** ACCOMMODATION_OPTIONS 的 id */
  accommodationType?: "hotel" | "airbnb" | "hostel" | "camping";
  /** TRAVEL_THEME_OPTIONS 的 id，可多选 */
  travelThemes?: string[];
  /** TRANSPORT_OPTIONS 的 id，可多选 */
  transportPreferences?: string[];
  /** 人均预算（人民币），供餐饮与活动档次建议参考 */
  budgetCny?: number;
  /** 备注与特别要求（对应示例 Step3） */
  additionalNotes?: string;
  /** 同行规模，影响路线与强度描述 */
  travelParty?: "solo" | "couple" | "family" | "group";
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
  /**
   * 规划阶段由 LLM 给出的论证与取舍说明（满足「展现规划与思考」、区别于固定 workflow）。
   * 若模型未输出则可为空。
   */
  plannerRationale?: string;
  /** 高层阶段，便于演示「先规划再执行」 */
  phases: PlanPhase[];
}

export interface PlanPhase {
  id: string;
  title: string;
  steps: PlanStep[];
}

// ---------------------------------------------------------------------------
// 工具层（至少 2 个主题相关外部工具；此处固定两个接口名）
// ---------------------------------------------------------------------------

export const TOOL_NAMES = ["weather_forecast", "maps_route_estimate"] as const;

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
      /** 可能为 LLM 擅自输出的未注册工具名，故用 string */
      payload: { stepId: string; toolName: string; error: ToolError };
    })
  | (ReasoningEventBase & {
      type: "reflexion";
      payload: { stepId: string; diagnosis: string; nextAction: "retry" | "skip" | "abort" };
    })
  | (ReasoningEventBase & { type: "step_done"; payload: { stepId: string } })
  | (ReasoningEventBase & { type: "run_done"; payload: { summary: string } })
  | (ReasoningEventBase & { type: "run_error"; payload: { message: string } });

// ---------------------------------------------------------------------------
// Skill 体系（迭代三 · 成员1）
// ---------------------------------------------------------------------------

/** 用户上传或内置的 Skill 元数据 */
export interface AgentSkill {
  id: string;
  userId: string;
  /** 目录名，如 high-speed-rail-transfer */
  name: string;
  description: string;
  markdownBody: string;
  tags: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** 内置 skill 标记，UI 只读不可删 */
  isBuiltin?: boolean;
}

/** 运行时注入 Prompt 的 Skill 片段 */
export interface ResolvedSkill {
  skillId: string;
  name: string;
  /** 注入 system prompt 的正文（可截断） */
  promptSection: string;
}

export interface ISkillRegistry {
  listForUser(userId: string): Promise<AgentSkill[]>;
  resolve(skillIds: string[]): Promise<ResolvedSkill[]>;
  matchSkills?(input: {
    userId: string;
    goalText: string;
    tags?: string[];
    limit?: number;
  }): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Agent 运行入口
// ---------------------------------------------------------------------------

export interface AgentRunInput {
  sessionId: string;
  goal: UserGoal;
  context: UserContext;
  /** 迭代三：本轮激活的 skill id 列表（评测不传时默认 []） */
  activeSkillIds?: string[];
  /** 迭代三：由 action 解析后注入 LLM 的 Skill system 段 */
  skillSystemSection?: string;
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

/** LLM 调用可选参数（Convex 日志排障用 requestLabel） */
export interface LLMCompletionOptions {
  temperature?: number;
  /** 标识场景，如 plan_draft / plan_revise / react:s1:turn0 */
  requestLabel?: string;
}

export interface ILLMClient {
  complete(messages: ChatMessage[], options?: LLMCompletionOptions): Promise<string>;
  /** 带工具定义的补全（用于 ReAct） */
  completeWithTools?(
    messages: ChatMessage[],
    tools: { name: string; description: string; parameters: object }[],
    callOptions?: Pick<LLMCompletionOptions, "requestLabel">
  ): Promise<{
    content: string | null;
    toolCalls?: { name: string; arguments: string }[];
  }>;
}

export { buildSkillSystemSection } from "./skills/buildSkillSystemSection";
