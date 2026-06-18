import type { AgentRunInput, IAutonomousAgent, ILLMClient, ITraceSink, ReasoningEvent } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import {
  parseTripPlanFromWorkingMemory,
  formatWorkingMemoryPlanText,
} from "../context/tripPlanMemory";
import { formatTripPlanForPrompt } from "../tripPlan/formatForPrompt";
import { buildRunModeEventPayload } from "./runModeDecision";
import {
  fallbackIncrementalReviseOutput,
  isGenericIncrementalChatReply,
  parseIncrementalReviseOutput,
} from "./incrementalReviseOutput";
import { summarizeRevisionChanges } from "./incrementalReviseSummary";
import { formatAgentKnowledgeContext, ensureKnowledgeCitations } from "../knowledge";
import { SessionEmitter } from "../runtime/SessionEmitter";
import { appendSkillSection } from "../skills/appendSkillSection";

const TRIP_PLAN_JSON_HINT = `tripPlanStructured 对象字段同全量规划：version=1, meta, overview, weatherTips, transport, themesAndPlaces, itinerary(按天 morning/afternoon/evening), foodAndBudget, tipsAndDisclaimer, topPlacesToVisit, citations? 等。`;

/**
 * incremental_revise：在已有结构化全程方案上局部修订，不重新调用天气/地图工具。
 * 对话框仅展示本轮修订说明；完整行程写入 tripPlanStructured 供右侧面板。
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

    const baselinePlan = parseTripPlanFromWorkingMemory(input.contextBundle?.workingMemory);
    const tripPlanText =
      (baselinePlan ? formatTripPlanForPrompt(baselinePlan) : "") ||
      formatWorkingMemoryPlanText(input.contextBundle?.workingMemory) ||
      "";

    const historyBlock = formatHistoryForPrompt(
      input.history,
      input.contextBundle?.conversationSummary
    );
    const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

    const system = appendSkillSection(
      `你是智能出行顾问。用户要在**已有全程结构化方案**基础上做局部修订（如改某一天节奏、把景点加入某日、调整预算档次）。
要求：
- **必须落实用户修订**：在 tripPlanStructured 中写入更新后的按天安排；不要只解释而不改正文。
- 若用户要求与 Skill 冲突，以**本轮用户明确要求**为准，并在 overview 用 1 句说明取舍。
- tripPlanStructured 须为**更新后的完整结构化行程**；仅修改用户提到的部分，其余天保留。
- chatReply 须为**面向用户的简短回复**（约 2～6 句）：**必须列出具体修改点**；禁止只说「已更新」而不说明改了什么。
- 若引用【RAG 知识片段】，句末保留 [来源: …] 标记。
- **不要**编造新的实时天气/路线 API 数据。

只输出一个 JSON 对象。键：
- chatReply（string）
- tripPlanStructured（object）：${TRIP_PLAN_JSON_HINT}`,
      input.skillSystemSection
    );

    const user = `${historyBlock}${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}【当前完整行程方案（待修订，文本摘要）】
${tripPlanText || "（无基线方案，请根据对话历史重建并应用用户修改。）"}

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

    let parsed = parseIncrementalReviseOutput(raw);
    let usedFallback = false;
    if (!parsed) {
      try {
        const retryRaw = (
          await this.llm.complete(
            [
              {
                role: "system",
                content: `${system}\n\n上次未输出合法 JSON。请仅输出 {"chatReply":"...","tripPlanStructured":{...}}，不要其他文字。`,
              },
              { role: "user", content: user },
            ],
            { temperature: 0.15, requestLabel: "incremental_revise_retry_json" }
          )
        ).trim();
        parsed = parseIncrementalReviseOutput(retryRaw);
        if (!parsed) {
          parsed = fallbackIncrementalReviseOutput(retryRaw, input.goal.rawText, baselinePlan);
          usedFallback = Boolean(parsed);
        }
        if (!parsed) {
          parsed = fallbackIncrementalReviseOutput(raw, input.goal.rawText, baselinePlan);
          usedFallback = Boolean(parsed);
        }
      } catch {
        parsed = fallbackIncrementalReviseOutput(raw, input.goal.rawText, baselinePlan);
        usedFallback = Boolean(parsed);
      }
    }

    if (
      parsed &&
      (usedFallback || isGenericIncrementalChatReply(parsed.chatReply))
    ) {
      parsed = {
        ...parsed,
        chatReply: await summarizeRevisionChanges(this.llm, {
          userRequest: input.goal.rawText,
          previousPlan: tripPlanText,
          revisedPlan: formatTripPlanForPrompt(parsed.tripPlanStructured),
        }),
      };
    }

    if (!parsed) {
      const err = emitter.emit({
        type: "run_error",
        payload: { message: "增量修订未产生有效的 JSON（chatReply + tripPlanStructured）。" },
      });
      yield err;
      await push(err);
      throw new Error("empty incremental revise");
    }

    const done = emitter.emit({
      type: "run_done",
      payload: {
        summary: ensureKnowledgeCitations(parsed.chatReply, input.contextBundle?.ragChunks),
        tripPlanStructured: parsed.tripPlanStructured,
        updatesMasterPlan: true,
      },
    });
    yield done;
    await push(done);
  }
}
