const PLACEHOLDER_RE = /（待根据工具数据补充）|（待补充）|^待补充|请查看推理轨迹/;

export function isPlaceholderText(text?: string | null): boolean {
  if (!text?.trim()) return true;
  return PLACEHOLDER_RE.test(text.trim());
}

/** 展示前去掉占位短语 */
export function stripPlaceholderText(text?: string | null): string {
  if (!text?.trim()) return "";
  const cleaned = text
    .replace(/（待根据工具数据补充）/g, "")
    .replace(/（待补充）/g, "")
    .replace(/^待补充[。．]?/g, "")
    .trim();
  return cleaned;
}
