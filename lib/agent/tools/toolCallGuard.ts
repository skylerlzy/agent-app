import type { ToolArguments, ToolName } from "../contracts";

/** 稳定序列化工具参数，用于同参去重 */
export function normalizeToolCallKey(toolName: ToolName, args: unknown): string {
  const obj =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  return `${toolName}:${JSON.stringify(sorted)}`;
}

/** 从工具成功返回中解析是否禁止同参重试 */
export function parseDoNotRetrySameArgs(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { doNotRetrySameArgs?: boolean; note?: string };
  if (d.doNotRetrySameArgs === true) return true;
  const note = typeof d.note === "string" ? d.note : "";
  return (
    /不在.*(?:7|15|30)\s*日预报/.test(note) ||
    /已改读实时天气/.test(note) ||
    /doNotRetrySameArgs/.test(note)
  );
}

export function hashToolResultSummary(summary: string): string {
  return summary.length > 4000 ? summary.slice(0, 4000) : summary;
}
