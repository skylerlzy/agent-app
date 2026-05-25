import type { AgentRunInput, IAutonomousAgent, ILLMClient, ITraceSink, ReasoningEvent } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { parseTripPlanFromWorkingMemory } from "../context/tripPlanMemory";
import { SessionEmitter } from "../runtime/SessionEmitter";
import { appendSkillSection } from "../skills/appendSkillSection";

/**
 * incremental_revise：在已有全程 Markdown 方案上局部修订，不重新调用天气/地图工具。
 */
export class IncrementalReviseWorkflow implements IAutonomousAgent {
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
      payload: { mode: "incremental_revise" },
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
      `你是智能出行顾问。用户要在**已有全程方案**基础上做局部修订（如改某一天节奏、调整预算档次）。
要求：
- 输出**更新后的完整 Markdown 行程**（须含 ## 行程总览、## 日程建议（按天） 等二级标题，结构与原文一致）。
- 仅修改用户提到的部分；未提及的天数/约束须保留。
- **不要**编造新的实时天气/路线 API 数据；可沿用原方案中的工具结论或标注「沿用上一版查询结果」。
- 在 ## 行程总览 开头用 1～2 句说明本次修订了什么。`,
      input.skillSystemSection
    );

    const user = `${historyBlock}【当前完整行程方案（待修订）】
${tripPlan || "（无基线方案，请根据对话历史重建并应用用户修改。）"}

【用户偏好】
${JSON.stringify(input.context.preferences, null, 2)}

【用户修订要求】
${input.goal.rawText}`;

    let revised: string;
    try {
      revised = (
        await this.llm.complete(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          { temperature: 0.3, requestLabel: "incremental_revise" }
        )
      ).trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = emitter.emit({ type: "run_error", payload: { message: msg } });
      yield err;
      await push(err);
      throw e;
    }

    if (!revised) {
      const err = emitter.emit({
        type: "run_error",
        payload: { message: "增量修订未产生有效输出。" },
      });
      yield err;
      await push(err);
      throw new Error("empty incremental revise");
    }

    const done = emitter.emit({
      type: "run_done",
      payload: { summary: revised, updatesMasterPlan: true },
    });
    yield done;
    await push(done);
  }
}
