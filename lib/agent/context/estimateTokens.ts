import type { ChatMessage } from "../contracts";

/**
 * Lightweight token estimate used for context budgeting.
 * Chinese-heavy travel prompts are usually denser than English by char count,
 * so this intentionally errs on the high side without pulling in a tokenizer.
 */
export function estimateTextTokens(text: string | undefined): number {
  if (!text) return 0;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;

  const cjk = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const ascii = normalized.length - cjk;
  return Math.ceil(cjk * 0.75 + ascii / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTextTokens(message.content) + 4, 0);
}

export function readContextTokenBudget(defaultBudget = 6000): number {
  const raw = process.env.AGENT_CONTEXT_TOKEN_BUDGET;
  if (raw === undefined || raw === "") return defaultBudget;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1200 ? Math.floor(n) : defaultBudget;
}

