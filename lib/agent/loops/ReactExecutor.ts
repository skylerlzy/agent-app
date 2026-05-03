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
        你的目标是完成本步所需的事实收集，尽量**充分**使用本步可用工具（可多次调用），再收束为简短结论。
        【硬性约束】你只能使用本回合 API 传入的 tools 列表中的函数（仅 weather_forecast、maps_route_estimate）。禁止输出任何其它函数名（例如 air_forecast、flight_api、booking_service）；禁止在正文中要求系统「再注册」或「开放」新工具。需要空气质量时，只调用 weather_forecast（其实现已包含 v7/air/now）。
        【工具使用策略】
        - weather_forecast：对**目的地**与（若步骤涉及出发/中转）**出发地**可分别查询；若用户行程跨多日，对**关键日期**各查一次 dateIso（须与系统提供的「未来14日」公历一致）。同市也可查「实时 + 7 日 outlook」辅助穿衣与是否适合户外活动。
        - maps_route_estimate：对**不同 OD 对**分段调用（如「高铁站→核心景区」「酒店→机场」）；同城优先 transit，步行可达短距离可 walking，跨城或枢纽间 transit 无方案时用 driving 并接受工具返回的说明。可比较不同 mode 用于「地铁 vs 驾车」参考。
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
          `若本步建议了 weather_forecast，请实际调用并传入 city（必填）；dateIso 用 YYYY-MM-DD 且必须取自上文【未来14日】列表（与「下周三」等对照一致）；工具会返回当日/多日气温、降水、空气质量及 7 日 outlook 摘要，请充分利用。`,
          `maps_route_estimate：请按步骤描述拆成多段 OD 调用以覆盖用户动线；若返回含驾车回退说明，须在最终思考中复述给用户。若距离/时间为空，可改 mode 或换更具体 POI/区县名重试。`,
        ].join("\n"),
      },
    ];

    const history: ReactTurn[] = [];
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
        // 参数校验通过，正式调用工具
        yield emitter.emit({ type: "tool_call", payload: { stepId: step.id, toolName, args: parsed.data as ToolArguments } });

        const toolCtx = {
          userId: context.userId,
          stepId: step.id,
          userContext: context,
        };
        let result: ToolResult;
        try {
          result = await def.execute(parsed.data, toolCtx);
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

          yield emitter.emit({
            type: "tool_result",
            payload: { stepId: step.id, toolName, summary: summary.slice(0, 12_000) },
          });

          // 将观察到的结果喂回给 LLM
          messages.push({ role: "assistant", content: thoughtText });
          messages.push({ role: "user", content: `工具执行结果: ${summary}。请基于此结果继续或结束本步骤。` });
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