import type {
  ChatMessage,
  ExecutionPlan,
  IEventEmitter,
  ILLMClient,
  IReactExecutor,
  IReflexionPolicy,
  IToolRegistry,
  PlanStep,
  ReactTurn,
  ReasoningEvent,
  ToolArguments,
  ToolName,
  ToolResult,
  UserContext,
  UserGoal,
} from "../contracts";
import { TOOL_NAMES } from "../contracts";
import { FAILED_TURN_PREFIX } from "../reflexion/ReflexionPolicy";
import { buildAgentTimeContextLines } from "../runtime/agentTimeContext";
import { validateToolArguments } from "../tools/ToolArgumentValidator";
import {
  hashToolResultSummary,
  normalizeToolCallKey,
  parseDoNotRetrySameArgs,
} from "../tools/toolCallGuard";

const REGISTERED_TOOL_NAMES = new Set<string>(TOOL_NAMES);

function zodLikeToJsonSchema(schema: unknown): object {
  const fallback = { type: "object", additionalProperties: true };
  if (!schema || typeof schema !== "object" || !("_def" in schema)) return fallback;

  const def = (schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown>; values?: string[]; innerType?: unknown } })._def;
  if (!def?.typeName) return fallback;

  if (def.typeName === "ZodObject" && typeof def.shape === "function") {
    const shape = def.shape();
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const valueDef = (value as { _def?: { typeName?: string; values?: string[]; innerType?: unknown } })._def;
      const isOptional = valueDef?.typeName === "ZodOptional";
      const innerDef = isOptional
        ? ((valueDef?.innerType as { _def?: { typeName?: string; values?: string[] } } | undefined)?._def)
        : valueDef;

      switch (innerDef?.typeName) {
        case "ZodString":
          properties[key] = { type: "string" };
          break;
        case "ZodNumber":
          properties[key] = { type: "number" };
          break;
        case "ZodEnum":
          properties[key] = { type: "string", enum: innerDef.values ?? [] };
          break;
        default:
          properties[key] = { type: "string" };
      }
      if (!isOptional) required.push(key);
    }

    return { type: "object", properties, required, additionalProperties: false };
  }

  return fallback;
}

/**
 * 成员2实现：自治 ReAct 执行器
 * 负责在单个计划步骤内，通过 LLM 进行「思考-行动-观察」的循环
 */
export class ReactExecutor implements IReactExecutor {
  constructor(
    private readonly llmClient: ILLMClient,
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

    // 1. 初始化对话历史，为 LLM 提供当前步骤的上下文
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `你是一个执行专家。当前任务步骤是: "${step.description}"。
        你的目标是完成本步所需的事实收集，在**必要且参数不同**时调用工具，然后收束为简短结论。
        【硬性约束】你只能使用本回合 API 传入的 tools 列表中的函数（仅 weather_forecast、maps_route_estimate）。禁止输出任何其它函数名。
        【禁止重复调用】同一 (tool, args) 在本步内已成功调用过则**禁止再调**；工具返回 doNotRetrySameArgs=true 或 note 含「不在 N 日预报内」「已改读实时」时，须**立即**用文字收束，勿同参重试。
        【读 note 即能力上限】工具 note 说明的数据边界即为最终答案，不要试图「再调一次拿更多字段」。
        【工具契约】
        - weather_forecast：**能** 7/15/30 日逐日 precip、实时、weekOutlook、airQualityAvailable；**不能** 逐小时降水概率、超 30 日指定日。AQI 不可用时不重试。
        - maps_route_estimate：**仅** 同城 POI 间 walking/transit/driving 粗估；**禁止** 跨城高铁/枢纽 transit、站内换乘 <500m、12306 时刻。origin/destination 须「城市+具体 POI」，禁止「XX区域」「XX青旅」等模糊名。跨城铁路用文字+12306。
        当信息已足够完成本步骤时，请给出简短总结并结束；不要捏造工具名。
        工具参数必须符合 JSON Schema。`,
      },
      {
        role: "user",
        content: [
          `用户整体目标: ${goal.rawText}。`,
          `当前槽位信息: ${JSON.stringify(goal.slots || {})}。`,
          `用户偏好: ${JSON.stringify(context.preferences)}。（若含 tripStartDateIso/tripEndDateIso，天气 dateIso 须落在该区间内并与【未来14日】对照一致。）`,
          ...buildAgentTimeContextLines(),
          `若本步建议了 weather_forecast：city 必填；dateIso 须取自【未来14日】；**不同 city/dateIso 各调一次即可**，同参禁止重试；读 note 与 airQualityAvailable。`,
          `maps_route_estimate：仅同城分段 OD（如「深圳市深圳北站→深圳市南山区某景区」）；跨城高铁/枢纽勿调 maps；地名须含城市+具体 POI。`,
        ].join("\n"),
      },
    ];

    const history: ReactTurn[] = [];
    const successfulCallKeys = new Map<string, string>();
    let lastSuccessSummaryHash: string | undefined;
    let turn = 0;
    let done = false;

    while (!done && turn < this.maxTurns) {
      // 2. 获取当前步骤建议的工具定义
      const availableTools = (step.suggestedTools || [])
        .map((name) => this.registry.get(name))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({
          name: t.name,
          description: t.description,
          parameters: zodLikeToJsonSchema(t.argsSchema),
        }));

      // 3. 核心决策：无可用工具时必须走纯文本 complete，避免部分兼容接口在 tools=[] 时长时间挂起
      const reactLabel = `react_${step.id}_turn${turn}`;
      const llmResponse =
        availableTools.length > 0 && this.llmClient.completeWithTools
          ? await this.llmClient.completeWithTools(messages, availableTools, { requestLabel: reactLabel })
          : {
              content: await this.llmClient.complete(messages, { requestLabel: `${reactLabel}_text_only` }),
              toolCalls: undefined,
            };

      const thoughtText = llmResponse.content || "正在分析当前状况...";
      const toolCall = llmResponse.toolCalls?.[0];

      let parsedToolArgs: ToolArguments | null = null;
      if (toolCall) {
        try {
          const raw = toolCall.arguments?.trim() ?? "";
          parsedToolArgs = (raw ? JSON.parse(raw) : {}) as ToolArguments;
        } catch {
          parsedToolArgs = {} as ToolArguments;
        }
      }

      // 构造当前轮次的推理记录
      const currentTurn: ReactTurn = {
        turnIndex: turn,
        thought: thoughtText,
        toolName:
          toolCall && REGISTERED_TOOL_NAMES.has(toolCall.name) ? (toolCall.name as ToolName) : null,
        toolArguments: parsedToolArgs,
        toolResultSummary: "",
      };

      // 发射 react_thought 事件，让前端看到 Agent 在想什么
      yield emitter.emit({ type: "react_thought", payload: currentTurn });

      // 如果 LLM 没有给出工具调用，说明它认为步骤已完成
      if (!toolCall) {
        done = true;
        break;
      }

      // 3b. 硬校验：仅允许白名单工具（防止虚构 air_forecast 等；OpenAI 层已过滤一轮，此处再兜底）
      if (!REGISTERED_TOOL_NAMES.has(toolCall.name)) {
        const err = {
          code: "TOOL_NOT_ALLOWED",
          message: `禁止调用未开放工具「${toolCall.name}」。仅允许：${[...REGISTERED_TOOL_NAMES].join("、")}。请勿虚构其它工具名；空气质量请只通过 weather_forecast 获取。`,
          retryable: true,
        };
        yield emitter.emit({
          type: "tool_error",
          payload: { stepId: step.id, toolName: toolCall.name, error: err },
        });
        const decision = await this.reflexion.decide({
          step,
          error: err,
          lastArgs: {},
          history,
        });
        yield emitter.emit({
          type: "reflexion",
          payload: { stepId: step.id, diagnosis: decision.diagnosis, nextAction: decision.nextAction },
        });
        history.push({
          ...currentTurn,
          toolResultSummary: `${FAILED_TURN_PREFIX}${err.code}:${err.message}`,
        });
        messages.push({
          role: "user",
          content: `${err.message} 请只使用已注册的两种工具之一重新选择调用，或在不调用工具的情况下用文字完成本步。`,
        });
        turn++;
        continue;
      }

      // 4. 工具执行逻辑
      const toolName = toolCall.name as ToolName;
      const def = this.registry.get(toolName);

      if (!def) {
        yield emitter.emit({ type: "run_error", payload: { message: `LLM 尝试调用未注册工具: ${toolName}` } });
        return;
      }

      let args: ToolArguments;
      try {
        args = JSON.parse(toolCall.arguments);
      } catch (e) {
        args = {};
      }

      // 使用 Zod 进行运行时参数校验
      const parsed = def.argsSchema.safeParse(args);

      if (!parsed.success) {
        // 参数校验失败，进入反思流程
        const schemaError = { code: "SCHEMA_ERROR", message: parsed.error.message, retryable: true };
        yield emitter.emit({ type: "tool_error", payload: { stepId: step.id, toolName, error: schemaError } });

        const decision = await this.reflexion.decide({ step, error: schemaError, lastArgs: args, history });
        yield emitter.emit({ type: "reflexion", payload: { stepId: step.id, diagnosis: decision.diagnosis, nextAction: decision.nextAction } });

        if (decision.nextAction === "retry") {
          history.push({
            ...currentTurn,
            toolResultSummary: `${FAILED_TURN_PREFIX}${schemaError.code}:${schemaError.message}`,
          });
          // 将错误反馈给模型，让其在下一轮修正参数
          messages.push({ role: "assistant", content: thoughtText });
          const patchedArgsText = decision.patchedArgs ? JSON.stringify(decision.patchedArgs) : "{}";
          messages.push({
            role: "user",
            content: `参数格式错误: ${schemaError.message}。请根据诊断修订参数后重试: ${decision.diagnosis}。建议参数: ${patchedArgsText}`,
          });
          turn++;
          continue;
        }
        done = true;
      } else {
        const validated = validateToolArguments(toolName, parsed.data as ToolArguments);
        if (!validated.ok) {
          yield emitter.emit({
            type: "tool_error",
            payload: { stepId: step.id, toolName, error: validated.error },
          });
          history.push({
            ...currentTurn,
            toolResultSummary: `${FAILED_TURN_PREFIX}${validated.error.code}:${validated.error.message}`,
          });
          messages.push({ role: "assistant", content: thoughtText });
          messages.push({
            role: "user",
            content: validated.error.retryable
              ? `${validated.error.message} 请修正参数或改用文字完成本步。`
              : `${validated.error.message} 本步请**不要**再调用 maps/weather，直接文字收束。`,
          });
          if (!validated.error.retryable) {
            done = true;
          }
          turn++;
          continue;
        }

        const execArgs = validated.normalized;
        const callKey = normalizeToolCallKey(toolName, execArgs);
        if (successfulCallKeys.has(callKey)) {
          const prev = successfulCallKeys.get(callKey)!;
          yield emitter.emit({
            type: "tool_error",
            payload: {
              stepId: step.id,
              toolName,
              error: {
                code: "DUPLICATE_TOOL_CALL",
                message: "同一步内禁止相同 (tool, args) 重复调用。",
                retryable: false,
              },
            },
          });
          history.push({
            ...currentTurn,
            toolResultSummary: `${FAILED_TURN_PREFIX}DUPLICATE_TOOL_CALL:已有结果 ${prev.slice(0, 500)}`,
          });
          messages.push({ role: "assistant", content: thoughtText });
          messages.push({
            role: "user",
            content: `【护栏】同参数已成功调用过，结果: ${prev.slice(0, 2000)}。请立即文字收束本步，禁止再调工具。`,
          });
          turn++;
          continue;
        }

        // 参数校验通过，正式调用工具
        yield emitter.emit({ type: "tool_call", payload: { stepId: step.id, toolName, args: execArgs } });

        const toolCtx = {
          userId: context.userId,
          stepId: step.id,
          userContext: context,
        };
        let result: ToolResult;
        try {
          result = await def.execute(execArgs, toolCtx);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          const retryable = /timeout|abort|429|network|econnreset|etimedout|fetch failed|限流/i.test(message);
          result = {
            ok: false,
            error: {
              code: "TOOL_UNHANDLED_EXCEPTION",
              message: `工具执行抛出未捕获异常: ${message}`,
              retryable,
              cause: error,
            },
          };
        }

        if (result.ok) {
          // 工具调用成功
          const summary = JSON.stringify(result.data);
          currentTurn.toolResultSummary = summary;
          history.push({ ...currentTurn });

          successfulCallKeys.set(callKey, summary);

          const summaryHash = hashToolResultSummary(summary);
          if (lastSuccessSummaryHash !== undefined && lastSuccessSummaryHash === summaryHash) {
            yield emitter.emit({
              type: "tool_result",
              payload: { stepId: step.id, toolName, summary: summary.slice(0, 12_000) },
            });
            done = true;
            turn++;
            break;
          }
          lastSuccessSummaryHash = summaryHash;

          yield emitter.emit({
            type: "tool_result",
            payload: { stepId: step.id, toolName, summary: summary.slice(0, 12_000) },
          });

          const doNotRetry = parseDoNotRetrySameArgs(result.data);
          messages.push({ role: "assistant", content: thoughtText });
          messages.push({
            role: "user",
            content: doNotRetry
              ? `工具执行结果: ${summary}。【重要】note/doNotRetrySameArgs 表明已达能力上限，禁止相同参数再调。请立即文字收束本步。`
              : `工具执行结果: ${summary}。请基于此结果继续（勿同参重试）或结束本步骤。`,
          });
          if (doNotRetry) {
            turn++;
            continue;
          }
        } else {
          // 工具执行时发生业务错误（如 API 超时等），进入反思流程
          yield emitter.emit({ type: "tool_error", payload: { stepId: step.id, toolName, error: result.error } });

          const decision = await this.reflexion.decide({ step, error: result.error, lastArgs: args, history });
          yield emitter.emit({ type: "reflexion", payload: { stepId: step.id, diagnosis: decision.diagnosis, nextAction: decision.nextAction } });

          if (decision.nextAction === "retry") {
            history.push({
              ...currentTurn,
              toolResultSummary: `${FAILED_TURN_PREFIX}${result.error.code}:${result.error.message}`,
            });
            const patchedArgsText = decision.patchedArgs ? JSON.stringify(decision.patchedArgs) : "{}";
            messages.push({
              role: "user",
              content: `工具执行报错: ${result.error.message}。诊断建议: ${decision.diagnosis}。请重试并参考参数: ${patchedArgsText}`,
            });
            turn++;
            continue;
          }
          if (decision.nextAction === "abort") {
            yield emitter.emit({ type: "run_error", payload: { message: `关键步骤执行失败，任务中止: ${result.error.message}` } });
            return;
          }
          done = true; // skip
        }
      }
      turn++;
    }

    // 完成本步骤
    yield emitter.emit({ type: "step_done", payload: { stepId: step.id } });
  }
}