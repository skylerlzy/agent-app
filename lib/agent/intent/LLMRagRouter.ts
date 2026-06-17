import type { AgentRunMode, ChatMessage, ILLMClient } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { extractJsonObject, parseBooleanField, parseConfidence } from "./parseIntentJson";

export interface RagRetrievalDecision {
  shouldRetrieve: boolean;
  source: "llm" | "fallback";
  reason: string;
  confidence?: number;
}

const RAG_ROUTER_SYSTEM = `你是旅游出行助手的「知识库检索」分类器。判断本轮用户消息是否需要从外部攻略知识库（RAG）检索事实性内容。

应检索（shouldRetrieve=true）的典型情况：
- 询问某地景点、美食、夜游、开放时间、预约、当地习俗等需要攻略事实的问题
- 完整出行规划（需要目的地背景知识）
- 城市+时段/地点类问题（如「南京晚上适合去哪」）

不应检索（shouldRetrieve=false）的典型情况：
- 纯闲聊、感谢、复述已有行程、不涉及事实库的简单确认
- 仅修改已有方案中的日程顺序/节奏/预算数字（增量修订，不查新攻略）
- 仅问实时天气且不需要攻略片段（天气由工具处理）

结合 runMode 参考：full_plan_execute 通常应检索；incremental_revise 通常不检索除非用户明确问攻略事实；quick_reply 按语义判断。

只输出 JSON：{"shouldRetrieve":boolean,"confidence":0~1,"reason":"一句中文"}`;

function recentHistoryBlock(history: ChatMessage[] | undefined): string {
  const hist = history?.filter((m) => m.content.trim()) ?? [];
  if (!hist.length) return "";
  return `${formatHistoryForPrompt(hist.slice(-4))}\n\n`;
}

export async function decideRagRetrieval(
  llm: ILLMClient,
  input: {
    goalText: string;
    runMode?: AgentRunMode;
    hasExistingPlan?: boolean;
    history?: ChatMessage[];
  }
): Promise<RagRetrievalDecision> {
  const text = input.goalText.trim();
  if (!text) {
    return { shouldRetrieve: false, source: "fallback", reason: "空消息" };
  }

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: RAG_ROUTER_SYSTEM },
        {
          role: "user",
          content: `${recentHistoryBlock(input.history)}【是否已有行程方案】${input.hasExistingPlan ? "是" : "否"}
【runMode】${input.runMode ?? "unknown"}
【用户本轮消息】
${text}`,
        },
      ],
      { temperature: 0.1, requestLabel: "rag_retrieval_router" }
    );

    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) throw new Error("invalid JSON");
    const parsed = JSON.parse(jsonStr) as {
      shouldRetrieve?: unknown;
      reason?: string;
      confidence?: unknown;
    };
    const shouldRetrieve = parseBooleanField(parsed.shouldRetrieve);
    if (shouldRetrieve === undefined) throw new Error("missing shouldRetrieve");

    return {
      shouldRetrieve,
      source: "llm",
      reason: parsed.reason?.trim() || (shouldRetrieve ? "需要攻略知识支撑" : "无需外部知识库"),
      confidence: parseConfidence(parsed.confidence),
    };
  } catch {
    const fallbackRetrieve =
      input.runMode === "full_plan_execute" ||
      (input.runMode === "quick_reply" && Boolean(input.hasExistingPlan) === false);
    return {
      shouldRetrieve: fallbackRetrieve,
      source: "fallback",
      reason: "LLM 分类失败，按 runMode 保守回退",
    };
  }
}
