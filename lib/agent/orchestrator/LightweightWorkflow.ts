import type {
  AgentRunInput,
  IAutonomousAgent,
  ILLMClient,
  IToolRegistry,
  ITraceSink,
  ReasoningEvent,
  ToolName,
} from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { parseTripPlanFromWorkingMemory } from "../context/tripPlanMemory";
import { buildRunModeEventPayload } from "./runModeDecision";
import { formatAgentKnowledgeContext, ensureKnowledgeCitations } from "../knowledge";
import { SessionEmitter } from "../runtime/SessionEmitter";
import { appendSkillSection } from "../skills/appendSkillSection";
import { inferCityFromText } from "../tools/ToolArgumentValidator";

const WEATHER_QA_PATTERNS: RegExp[] = [
  /天气怎么样/,
  /天气如何/,
  /查(?:一下|查)?.*天气/,
  /会下雨/,
  /气温/,
  /多少度/,
];

function toolEnabled(name: ToolName, enabled?: ToolName[]): boolean {
  if (!enabled?.length) return true;
  return enabled.includes(name);
}

function pickWeatherCity(input: AgentRunInput): string | undefined {
  const slots = input.goal.slots;
  if (slots?.destination) return slots.destination;
  if (slots?.originCity) return slots.originCity;
  const fromText = inferCityFromText(input.goal.rawText);
  if (fromText) return fromText;
  const pref = input.context.preferences;
  return inferCityFromText(pref.additionalNotes ?? "");
}

/**
 * quick_reply：基于已有行程/对话直接回答；简单天气问句可调用至多 1 次 weather_forecast。
 */
export class LightweightWorkflow implements IAutonomousAgent {
  constructor(
    private readonly llm: ILLMClient,
    private readonly toolRegistry?: IToolRegistry,
    private readonly traceSink?: ITraceSink
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
      payload: buildRunModeEventPayload("quick_reply", input.runModeMeta),
    });
    yield modeEvent;
    await push(modeEvent);

    let toolContextBlock = "";
    const wantsWeather = WEATHER_QA_PATTERNS.some((p) => p.test(input.goal.rawText));
    const weatherTool = this.toolRegistry?.get("weather_forecast");

    if (
      wantsWeather &&
      weatherTool &&
      toolEnabled("weather_forecast", input.enabledToolNames)
    ) {
      const city = pickWeatherCity(input);
      const dateIso =
        input.goal.slots?.startDateIso ??
        input.context.preferences.tripStartDateIso ??
        new Date().toISOString().slice(0, 10);

      const args = { city: city ?? "南京", dateIso };
      const callEv = emitter.emit({
        type: "tool_call",
        payload: { stepId: "quick_weather", toolName: "weather_forecast", args },
      });
      yield callEv;
      await push(callEv);

      try {
        const result = await weatherTool.execute(args, {
          userId: input.context.userId,
          stepId: "quick_weather",
          userContext: input.context,
        });
        if (result.ok) {
          const summary = JSON.stringify(result.data).slice(0, 1500);
          toolContextBlock = `\n【实时天气查询结果】\n${summary}\n`;
          const resEv = emitter.emit({
            type: "tool_result",
            payload: { stepId: "quick_weather", toolName: "weather_forecast", summary },
          });
          yield resEv;
          await push(resEv);
        } else {
          toolContextBlock = `\n【天气查询失败】${result.error.message}\n`;
          const errEv = emitter.emit({
            type: "tool_error",
            payload: {
              stepId: "quick_weather",
              toolName: "weather_forecast",
              error: result.error,
            },
          });
          yield errEv;
          await push(errEv);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toolContextBlock = `\n【天气查询异常】${msg}\n`;
      }
    }

    const tripPlan =
      parseTripPlanFromWorkingMemory(input.contextBundle?.workingMemory) ?? "";
    const historyBlock = formatHistoryForPrompt(
      input.history,
      input.contextBundle?.conversationSummary
    );
    const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

    const system = appendSkillSection(
      `你是智能出行助手。本轮为「快速回复」模式：
- **禁止**重新制定完整行程${wantsWeather && toolContextBlock ? "（已提供一次天气查询结果，请据此回答）" : "，**禁止**假装调用了天气/地图等外部 API"}。
- 优先从【当前完整行程方案】与【近期对话】中提取信息作答。
- 必须遵守【长期记忆】中的用户偏好和约束；若引用【RAG 知识片段】，句末保留 [来源: …] 标记。
- 若用户要求复述某一天（如 Day1 / 第一天），只清晰呈现该日内容，不要重复其他天。
- 若方案中缺少用户问的信息，明确说明「当前方案未包含」，不要编造。
- 回答使用 Markdown，可分段但不必包含完整七段行程模板。`,
      input.skillSystemSection
    );

    const user = `${historyBlock}${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}${toolContextBlock}【当前完整行程方案】
${tripPlan || "（尚无已保存的完整方案，请根据对话历史尽量回答，并说明信息可能不完整。）"}

【用户偏好】
${JSON.stringify(input.context.preferences, null, 2)}

【用户问题】
${input.goal.rawText}`;

    let reply: string;
    try {
      reply = (
        await this.llm.complete(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          { temperature: 0.25, requestLabel: "quick_reply" }
        )
      ).trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = emitter.emit({ type: "run_error", payload: { message: msg } });
      yield err;
      await push(err);
      throw e;
    }

    if (!reply) reply = "抱歉，未能从已有行程中找到相关信息，请尝试更具体地描述您的问题。";

    reply = ensureKnowledgeCitations(reply, input.contextBundle?.ragChunks);

    const done = emitter.emit({
      type: "run_done",
      payload: { summary: reply, updatesMasterPlan: false },
    });
    yield done;
    await push(done);
  }
}
