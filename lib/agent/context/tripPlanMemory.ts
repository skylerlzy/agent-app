import type { AgentRunMode, ChatMessage } from "../contracts";

/** 判断 Markdown 是否像完整出行方案（含多段二级标题） */
export function looksLikeFullItinerary(content: string): boolean {
  const t = content.trim();
  if (!t.includes("##")) return false;
  const sectionCount = (t.match(/^##\s+/gm) ?? []).length;
  return (
    sectionCount >= 2 ||
    /##\s*日程建议/.test(t) ||
    /##\s*行程总览/.test(t)
  );
}

/** 从多轮 history 中取最近一份完整行程 Markdown */
export function extractTripPlanFromHistory(history: ChatMessage[] | undefined): string | undefined {
  if (!history?.length) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && looksLikeFullItinerary(m.content)) {
      return m.content.trim();
    }
  }
  return undefined;
}

export function parseTripPlanFromWorkingMemory(workingMemory?: string): string | undefined {
  if (!workingMemory?.trim()) return undefined;
  try {
    const parsed = JSON.parse(workingMemory) as { tripPlanMarkdown?: string };
    if (parsed.tripPlanMarkdown?.trim()) return parsed.tripPlanMarkdown.trim();
  } catch {
    /* 兼容纯 Markdown 字符串 */
    if (workingMemory.includes("##")) return workingMemory.trim();
  }
  return undefined;
}

export function buildWorkingMemoryWithTripPlan(tripPlanMarkdown: string): string {
  return JSON.stringify({ tripPlanMarkdown });
}

/** incremental_revise / full 是否应写回 conversations.tripPlanMarkdown */
export function shouldPatchTripPlanMarkdown(
  mode: AgentRunMode | undefined,
  tripPlanMarkdown: string | undefined,
  updatesMasterPlan?: boolean
): boolean {
  if (mode === "quick_reply" || updatesMasterPlan === false) return false;
  const t = tripPlanMarkdown?.trim() ?? "";
  if (!t) return false;
  if (looksLikeFullItinerary(t)) return true;
  if (mode === "incremental_revise") {
    return (
      /##\s*日程/.test(t) ||
      (/Day\s*\d|第\s*[一二三四五六七八九十\d]+\s*天/i.test(t) && t.length >= 400)
    );
  }
  return false;
}

/** 从 run_done 事件取右侧行程 Markdown（优先 tripPlanMarkdown，兼容 full 模式旧 payload） */
export function tripPlanFromRunDone(
  payload: { summary: string; tripPlanMarkdown?: string },
  mode?: AgentRunMode
): string | undefined {
  const explicit = payload.tripPlanMarkdown?.trim();
  if (explicit) return explicit;
  if (mode === "full_plan_execute" && looksLikeFullItinerary(payload.summary)) {
    return payload.summary.trim();
  }
  return undefined;
}
