import type { AgentRunInput, IAutonomousAgent, ILLMClient, ITraceSink, ReasoningEvent } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import {
  parseTripPlanFromWorkingMemory,
} from "../context/tripPlanMemory";
import { isValidTripPlan } from "../tripPlan/schema";
import { buildRunModeEventPayload } from "./runModeDecision";
import { reviseTripPlanWithLlm } from "./incrementalReviseEngine";
import { formatAgentKnowledgeContext, ensureKnowledgeCitations } from "../knowledge";
import { SessionEmitter } from "../runtime/SessionEmitter";

/**
 * incremental_revise：在已有结构化全程方案上局部修订，不重新调用天气/地图工具。
 * 由 LLM 理解意图；失败时走 operations 解析与校验，**不抛出 ConvexError**（避免面板已正确仍报错）。
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
    if (!baselinePlan || !isValidTripPlan(baselinePlan)) {
      const err = emitter.emit({
        type: "run_error",
        payload: {
          message: "增量修订需要已有完整结构化行程；请先生成全程方案后再提出修改。",
        },
      });
      yield err;
      await push(err);
      throw new Error("incremental revise without baseline");
    }

    const historyBlock = formatHistoryForPrompt(
      input.history,
      input.contextBundle?.conversationSummary
    );
    const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

    let tripPlan = baselinePlan;
    let chatReply: string;
    try {
      const result = await reviseTripPlanWithLlm(this.llm, {
        baseline: baselinePlan,
        userRequest: input.goal.rawText,
        historyBlock,
        knowledgeBlock,
        preferences: input.context.preferences,
        skillSystemSection: input.skillSystemSection,
      });
      tripPlan = result.tripPlan;
      chatReply = result.chatReply;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      chatReply = `行程修订未完成（${msg}）。请查看右侧当前方案；如需修改请说明 Day 序号/日期 + 上午|下午|晚上 + 具体操作。`;
    }

    const done = emitter.emit({
      type: "run_done",
      payload: {
        summary: ensureKnowledgeCitations(chatReply, input.contextBundle?.ragChunks),
        tripPlanStructured: tripPlan,
        updatesMasterPlan: true,
      },
    });
    yield done;
    await push(done);
  }
}
