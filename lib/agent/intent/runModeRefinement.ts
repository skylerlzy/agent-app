import type { ChatMessage, ILLMClient } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import type { RunModeRouterInput } from "../orchestrator/RunModeRouter";
import { extractJsonObject } from "../orchestrator/runModeDecision";
import type { AgentRunMode } from "../contracts";
import { parseConfidence } from "./parseIntentJson";

const REFINE_SYSTEM = `你是运行模式复核器。上一轮已判为 incremental_revise，请复核用户是否**明确要求修改/更新右侧已保存的行程方案正文**。

判为 quick_reply（不修改行程，仅在对话中回答）：
- 探索/咨询：还有什么好玩的、有什么推荐、值得去吗、介绍一下、附近还有什么
- 对比/了解：和XX比哪个好、需要预约吗、游玩要多久
- 复述/确认：再说一下第一天、当前行程包含哪些景点

仍判 incremental_revise（必须更新右侧行程）：
- 明确要求写入行程：加入/删除/替换某天景点、改节奏、调预算并反映到日程、把XX安排进第N天

输出 JSON：{"mode":"quick_reply"|"incremental_revise","reason":"一句中文","confidence":0~1}`;

export interface RunModeRefinement {
  mode: AgentRunMode;
  reason: string;
  confidence?: number;
}

function parseRefinementJson(raw: string): RunModeRefinement | null {
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as {
      mode?: string;
      reason?: string;
      confidence?: unknown;
    };
    if (parsed.mode !== "quick_reply" && parsed.mode !== "incremental_revise") return null;
    return {
      mode: parsed.mode,
      reason: parsed.reason?.trim() || "",
      confidence: parseConfidence(parsed.confidence),
    };
  } catch {
    return null;
  }
}

/**
 * 当首轮判为 incremental_revise 时，二次确认用户是否真的在要求改行程（避免「还有什么好玩的」误判）。
 */
export async function refineRunModeIfNeeded(
  llm: ILLMClient,
  input: RunModeRouterInput,
  initialMode: AgentRunMode,
  initialReason?: string
): Promise<{ mode: AgentRunMode; reason?: string; refined: boolean }> {
  if (initialMode !== "incremental_revise" || !input.hasExistingPlan) {
    return { mode: initialMode, reason: initialReason, refined: false };
  }

  const hist = input.history?.filter((m) => m.content.trim()).slice(-4) ?? [];
  const historyBlock = hist.length ? formatHistoryForPrompt(hist) : "";

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: REFINE_SYSTEM },
        {
          role: "user",
          content: `${historyBlock ? `${historyBlock}\n\n` : ""}【用户本轮消息】
${input.goalText.trim()}

【首轮判定理由】${initialReason ?? "incremental_revise"}`,
        },
      ],
      { temperature: 0.05, requestLabel: "run_mode_refine" }
    );

    const refined = parseRefinementJson(raw);
    if (!refined) return { mode: initialMode, reason: initialReason, refined: false };

    if (refined.mode !== initialMode) {
      return {
        mode: refined.mode,
        reason: `复核修正：${refined.reason}`,
        refined: true,
      };
    }
    return { mode: initialMode, reason: initialReason, refined: false };
  } catch {
    return { mode: initialMode, reason: initialReason, refined: false };
  }
}
