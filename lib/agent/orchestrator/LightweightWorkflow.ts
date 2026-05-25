import type { AgentRunInput, IAutonomousAgent, ILLMClient, ITraceSink, ReasoningEvent } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { parseTripPlanFromWorkingMemory } from "../context/tripPlanMemory";
import { SessionEmitter } from "../runtime/SessionEmitter";
import { appendSkillSection } from "../skills/appendSkillSection";

/**
 * quick_reply：基于已有行程方案与对话历史直接回答，不调用规划器与外部工具。
 */
export class LightweightWorkflow implements IAutonomousAgent {
  constructor(
    private readonly llm: ILLMClient,
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
      payload: { mode: "quick_reply" },
    });
    yield modeEvent;
    await push(modeEvent);

    const tripPlan =
      parseTripPlanFromWorkingMemory(input.contextBundle?.workingMemory) ?? "";
    const historyBlock = formatHistoryForPrompt(
      input.history,
      input.contextBundle?.conversationSummary
    );

    const system = appendSkillSection(
      `你是智能出行助手。本轮为「快速回复」模式：
- **禁止**重新制定完整行程，**禁止**假装调用了天气/地图等外部 API。
- 优先从【当前完整行程方案】与【近期对话】中提取信息作答。
- 若用户要求复述某一天（如 Day1 / 第一天），只清晰呈现该日内容，不要重复其他天。
- 若方案中缺少用户问的信息，明确说明「当前方案未包含」，不要编造。
- 回答使用 Markdown，可分段但不必包含完整七段行程模板。`,
      input.skillSystemSection
    );

    const user = `${historyBlock}【当前完整行程方案】
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

    const done = emitter.emit({
      type: "run_done",
      payload: { summary: reply, updatesMasterPlan: false },
    });
    yield done;
    await push(done);
  }
}
