import type {
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
  ILLMClient,
  ChatMessage,
} from "../contracts";
import { FAILED_TURN_PREFIX } from "../reflexion/ReflexionPolicy";

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
        你的目标是完成这个步骤。你可以调用工具来获取信息。
        当信息足够完成本步骤时，请给出简短总结并结束。
        注意：请确保工具参数符合要求的格式。`,
      },
      {
        role: "user",
        content: `用户整体目标: ${goal.rawText}。
        当前槽位信息: ${JSON.stringify(goal.slots || {})}。
        用户偏好: ${JSON.stringify(context.preferences)}。`,
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

      // 3. 核心决策：询问 LLM 下一步该做什么
      const llmResponse = this.llmClient.completeWithTools
        ? await this.llmClient.completeWithTools(messages, availableTools)
        : { content: await this.llmClient.complete(messages), toolCalls: [] };

      const thoughtText = llmResponse.content || "正在分析当前状况...";
      const toolCall = llmResponse.toolCalls?.[0];

      // 构造当前轮次的推理记录
      const currentTurn: ReactTurn = {
        turnIndex: turn,
        thought: thoughtText,
        toolName: (toolCall?.name as ToolName) || null,
        toolArguments: toolCall ? JSON.parse(toolCall.arguments) : null,
        toolResultSummary: "",
      };

      // 发射 react_thought 事件，让前端看到 Agent 在想什么
      yield emitter.emit({ type: "react_thought", payload: currentTurn });

      // 如果 LLM 没有给出工具调用，说明它认为步骤已完成
      if (!toolCall) {
        done = true;
        break;
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

        const result = await def.execute(parsed.data, {
          userId: context.userId,
          stepId: step.id,
          userContext: context,
        });

        if (result.ok) {
          // 工具调用成功
          const summary = JSON.stringify(result.data);
          currentTurn.toolResultSummary = summary;
          history.push({ ...currentTurn });

          yield emitter.emit({
            type: "tool_result",
            payload: { stepId: step.id, toolName, summary: summary.slice(0, 500) },
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