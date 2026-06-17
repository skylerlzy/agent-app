import type { ILLMClient } from "../contracts";
import { extractJsonObject } from "../orchestrator/runModeDecision";

/** 当增量修订 LLM 未返回 JSON 时，根据修订前后方案生成对话内变更摘要 */
export async function summarizeRevisionChanges(
  llm: ILLMClient,
  input: {
    userRequest: string;
    previousPlan: string;
    revisedPlan: string;
  }
): Promise<string> {
  const system = `你是出行助手。用户要求局部修订行程，右侧已更新完整方案。请用 2～5 句中文在**对话框**里说明本次具体改了什么（涉及哪一天、增删/调整了哪些景点或活动、节奏/预算变化等）。不要粘贴完整行程，不要只说「已更新」。

只输出 JSON：{"chatReply":"..."}`;

  const user = `【用户修订要求】
${input.userRequest.trim()}

【修订前方案摘要（前 1200 字）】
${input.previousPlan.trim().slice(0, 1200)}

【修订后方案摘要（前 1200 字）】
${input.revisedPlan.trim().slice(0, 1200)}`;

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.2, requestLabel: "incremental_revise_summary" }
    );
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) throw new Error("no json");
    const parsed = JSON.parse(jsonStr) as { chatReply?: string };
    const chatReply = parsed.chatReply?.trim();
    if (chatReply && chatReply.length >= 12) return chatReply;
  } catch {
    /* fall through */
  }

  return `已按您的要求「${input.userRequest.trim().slice(0, 48)}」更新右侧全程方案。主要变动请见「全程出行方案」面板中的按天安排；如需我把某一天的改动再展开说明，请直接说。`;
}
