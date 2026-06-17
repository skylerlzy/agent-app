import type { AgentRunMode } from "../contracts";

export function buildRagQuery(parts: {
  userMessage: string;
  destination?: string;
  additionalNotes?: string;
}): string {
  return [parts.userMessage, parts.destination, parts.additionalNotes]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

/** @deprecated 同步判断已移除，请在 action 中调用 decideRagRetrieval */
export function shouldRetrieveKnowledge(_input: {
  goalText: string;
  runMode?: AgentRunMode;
}): boolean {
  return false;
}

export function skipRagReason(_goalText: string, _runMode?: AgentRunMode): string {
  return "由 LLM 检索分类器判定跳过";
}
