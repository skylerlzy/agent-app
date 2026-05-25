import type { ChatMessage } from "../contracts";

/** 将多轮 history 与对话摘要格式化为可注入 LLM 的文本块（成员3 产出，成员4 可在此基础上做裁剪/压缩） */
export function formatHistoryForPrompt(history: ChatMessage[] | undefined, summary?: string): string {
  const parts: string[] = [];
  if (summary?.trim()) {
    parts.push(`【此前对话摘要】\n${summary.trim()}`);
  }
  const hist = history?.filter((m) => m.content.trim()) ?? [];
  if (hist.length) {
    parts.push(
      "【近期对话（由远及近）】\n" +
        hist
          .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content.trim().slice(0, 4000)}`)
          .join("\n\n")
    );
  }
  return parts.length ? `${parts.join("\n\n")}\n\n` : "";
}
