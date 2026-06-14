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

/** LLM 未按 JSON 输出时的降级：整段视为行程，对话框给简短提示 */
export function fallbackIncrementalReviseOutput(
  raw: string,
  userRequest: string
): IncrementalReviseOutput | null {
  const t = raw.trim();
  if (!looksLikeFullItinerary(t)) return null;
  const dayHint =
    userRequest.match(/第\s*[一二三四五六七八九十\d]+\s*天|day\s*\d+/i)?.[0] ?? "相关日期";
  return {
    chatReply: `已根据您的要求更新 **${dayHint}** 的安排，完整修订版行程已同步至右侧「全程出行方案」。如需继续微调，直接说明即可。`,
    tripPlanMarkdown: t,
  };
}
