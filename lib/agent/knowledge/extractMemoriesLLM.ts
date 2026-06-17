import type { ILLMClient } from "../contracts";
import type { MemoryCandidate } from "./extractMemories";
import { extractJsonObject } from "../intent/parseIntentJson";

const MEMORY_EXTRACT_SYSTEM = `从用户消息中提取可长期记住的出行偏好/约束/事实，用于跨对话记忆。若无值得记住的内容，返回空数组。

类型 kind：
- preference：偏好（喜欢吃辣、喜欢慢节奏）
- constraint：约束（不吃辣、预算上限、忌口）
- fact：事实（带老人、常驻地）
- other：其他

只输出 JSON：{"memories":[{"kind":"preference|constraint|fact|other","content":"一句中文"}]}`;

export async function extractMemoryCandidatesWithLLM(
  llm: ILLMClient,
  input: { userMessage: string; assistantReply?: string }
): Promise<MemoryCandidate[]> {
  const userMessage = input.userMessage.trim();
  if (!userMessage) return [];

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: MEMORY_EXTRACT_SYSTEM },
        {
          role: "user",
          content: `【用户】${userMessage}${input.assistantReply ? `\n【助手（参考）】${input.assistantReply.slice(0, 400)}` : ""}`,
        },
      ],
      { temperature: 0.1, requestLabel: "memory_extract" }
    );
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr) as {
      memories?: Array<{ kind?: string; content?: string }>;
    };
    const validKinds = new Set(["preference", "constraint", "fact", "other"]);
    const seen = new Set<string>();
    const out: MemoryCandidate[] = [];
    for (const row of parsed.memories ?? []) {
      const kind = row.kind;
      const content = row.content?.replace(/\s+/g, " ").trim();
      if (!kind || !validKinds.has(kind) || !content || content.length < 3 || content.length > 180) {
        continue;
      }
      if (seen.has(content)) continue;
      seen.add(content);
      out.push({ kind: kind as MemoryCandidate["kind"], content });
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    return [];
  }
}
