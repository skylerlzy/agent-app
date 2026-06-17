import { looksLikeFullItinerary } from "../context/tripPlanMemory";
import { extractJsonObject } from "./runModeDecision";

export interface IncrementalReviseOutput {
  chatReply: string;
  tripPlanMarkdown: string;
}

export function parseIncrementalReviseOutput(raw: string): IncrementalReviseOutput | null {
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as {
      chatReply?: string;
      tripPlanMarkdown?: string;
    };
    const chatReply = parsed.chatReply?.trim();
    const tripPlanMarkdown = parsed.tripPlanMarkdown?.trim();
    if (!chatReply || !tripPlanMarkdown || !looksLikeFullItinerary(tripPlanMarkdown)) {
      return null;
    }
    return { chatReply, tripPlanMarkdown };
  } catch {
    return null;
  }
}

export function isGenericIncrementalChatReply(chatReply: string): boolean {
  const t = chatReply.trim();
  if (!t) return true;
  if (/已根据您的要求更新|已按您的要求|完整修订版行程已同步至右侧|已同步至右侧「全程出行方案」|请打开「全程出行方案」查看/.test(t)) {
    return true;
  }
  if (t.length < 20 && /已更新|已同步/.test(t)) return true;
  return false;
}

/** LLM 未按 JSON 输出时的降级：整段视为行程，对话框给简短提示 */
export function fallbackIncrementalReviseOutput(
  raw: string,
  userRequest: string
): IncrementalReviseOutput | null {
  const t = raw.trim();
  if (!looksLikeFullItinerary(t)) return null;
  return {
    chatReply: `已按您的要求「${userRequest.trim().slice(0, 48)}」更新右侧全程方案。请打开「全程出行方案」查看按天变动；如需我把某一天的改动展开说明，请直接说。`,
    tripPlanMarkdown: t,
  };
}
