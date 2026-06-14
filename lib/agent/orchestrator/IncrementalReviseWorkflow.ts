import type { AgentRunInput, IAutonomousAgent, ILLMClient, ITraceSink, ReasoningEvent } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { parseTripPlanFromWorkingMemory } from "../context/tripPlanMemory";
import { buildRunModeEventPayload } from "./runModeDecision";
import {
  fallbackIncrementalReviseOutput,
  parseIncrementalReviseOutput,
} from "./incrementalReviseOutput";
import { formatAgentKnowledgeContext, ensureKnowledgeCitations } from "../knowledge";
import { SessionEmitter } from "../runtime/SessionEmitter";
import { appendSkillSection } from "../skills/appendSkillSection";

/**
 * incremental_revise：在已有全程 Markdown 方案上局部修订，不重新调用天气/地图工具。
 * 对话框仅展示本轮修订说明；完整行程写入 tripPlanMarkdown 供右侧面板。
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
      payload: buildRunModeEventPayload("incremental_revise", input.runModeMeta),
    });
    yield modeEvent;
    await push(modeEvent);

    const tripPlan =
      parseTripPlanFromWorkingMemory(input.contextBundle?.workingMemory) ?? "";
    const historyBlock = formatHistoryForPrompt(
      input.history,
      input.contextBundle?.conversationSummary
    );
    const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

    const system = appendSkillSection(
      `你是智能出行顾问。用户要在**已有全程方案**基础上做局部修订（如改某一天节奏、把景点加入某日、调整预算档次）。
要求：
- **必须落实用户修订**：用户明确要求改日程/加景点/改节奏时，在 tripPlanMarkdown 中写入更新后的按天安排；不要只解释「为何不宜改」或只给可选建议而不改正文。
- 若用户要求与 Skill 中的 pace/浪漫原则冲突，以**本轮用户明确要求**为准，并在 tripPlanMarkdown 的 ## 行程总览 用 1 句说明取舍。
- tripPlanMarkdown 须为**更新后的完整 Markdown 行程**（含 ## 行程总览、## 日程建议（按天） 及原文已有的其他 ## 章节，结构与原文一致）；仅修改用户提到的部分。
- chatReply 须为**面向用户的简短回复**（约 2～6 句）：说明本次改了什么、涉及哪一天/哪些活动；**不要**在 chatReply 中粘贴完整多日行程或大量 ## 章节。
- 若【RAG 知识片段】非空且 chatReply 引用了其中事实，句末须保留 [来源: 文档标题 · 引用位置]。
- 必须遵守【长期记忆】中的用户偏好和约束；若引用【RAG 知识片段】，句末保留 [来源: …] 标记。
- **不要**编造新的实时天气/路线 API 数据；可沿用原方案中的工具结论或标注「沿用上一版查询结果」。

只输出一个 JSON 对象，不要 Markdown 代码块外的文字。键：
- chatReply（string）：对话框本轮回复
- tripPlanMarkdown（string）：完整修订后行程 Markdown`,
      input.skillSystemSection
    );

    const user = `${historyBlock}${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}【当前完整行程方案（待修订）】
${tripPlan || "（无基线方案，请根据对话历史重建并应用用户修改。）"}

【用户偏好】
${JSON.stringify(input.context.preferences, null, 2)}

【用户修订要求】
${input.goal.rawText}`;

    let raw: string;
    try {
      raw = (
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

    const parsed =
      parseIncrementalReviseOutput(raw) ??
      fallbackIncrementalReviseOutput(raw, input.goal.rawText);

    if (!parsed) {
      const err = emitter.emit({
        type: "run_error",
        payload: { message: "增量修订未产生有效的 JSON（chatReply + tripPlanMarkdown）。" },
      });
      yield err;
      await push(err);
      throw new Error("empty incremental revise");
    }

    const done = emitter.emit({
      type: "run_done",
      payload: {
        summary: ensureKnowledgeCitations(parsed.chatReply, input.contextBundle?.ragChunks),
        tripPlanMarkdown: parsed.tripPlanMarkdown,
        updatesMasterPlan: true,
      },
    });
    yield done;
    await push(done);
  }
}
