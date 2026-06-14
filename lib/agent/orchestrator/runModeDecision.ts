import type { AgentRunMode } from "../contracts";

export type RunModeRouterSource = "llm" | "heuristic" | "override";

export interface RunModeMeta {
  source: RunModeRouterSource;
  reason?: string;
  confidence?: number;
}

export interface RunModeDecision {
  mode: AgentRunMode;
  source: RunModeRouterSource;
  reason?: string;
  confidence?: number;
}

const VALID_MODES: AgentRunMode[] = ["full_plan_execute", "incremental_revise", "quick_reply"];

export function buildRunModeEventPayload(mode: AgentRunMode, meta?: RunModeMeta) {
  if (!meta) return { mode };
  return {
    mode,
    source: meta.source,
    ...(meta.reason ? { reason: meta.reason } : {}),
    ...(meta.confidence !== undefined ? { confidence: meta.confidence } : {}),
  };
}

export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export function parseRunModeDecisionJson(raw: string): RunModeDecision | null {
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as {
      mode?: string;
      reason?: string;
      confidence?: number;
    };
    if (!parsed.mode || !VALID_MODES.includes(parsed.mode as AgentRunMode)) return null;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : undefined;
    return {
      mode: parsed.mode as AgentRunMode,
      source: "llm",
      reason: parsed.reason?.trim() || undefined,
      confidence,
    };
  } catch {
    return null;
  }
}

export function llmRunModeRouterEnabled(): boolean {
  const v = process.env.USE_LLM_RUN_MODE_ROUTER?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}
