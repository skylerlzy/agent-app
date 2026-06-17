import type { ILLMClient } from "../contracts";
import { extractJsonObject, parseBooleanField } from "./parseIntentJson";

export interface QuickReplyToolDecision {
  useWeather: boolean;
  source: "llm" | "fallback";
  reason: string;
}

const QUICK_TOOL_SYSTEM = `你是旅游助手 quick_reply 模式的工具选择器。用户处于简单问答/复述模式，最多允许调用 1 次天气工具。

判断用户本轮是否需要在回答前查询天气预报（useWeather=true）：
- 问某地天气、气温、是否下雨、适不适合出行等 → true
- 复述行程、介绍概念、推荐景点（非天气）→ false

只输出 JSON：{"useWeather":boolean,"reason":"一句中文"}`;

export async function decideQuickReplyTools(
  llm: ILLMClient,
  goalText: string
): Promise<QuickReplyToolDecision> {
  const text = goalText.trim();
  if (!text) return { useWeather: false, source: "fallback", reason: "空消息" };

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: QUICK_TOOL_SYSTEM },
        { role: "user", content: `【用户消息】\n${text}` },
      ],
      { temperature: 0.1, requestLabel: "quick_reply_tools" }
    );
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) throw new Error("invalid JSON");
    const parsed = JSON.parse(jsonStr) as { useWeather?: unknown; reason?: string };
    const useWeather = parseBooleanField(parsed.useWeather);
    if (useWeather === undefined) throw new Error("missing useWeather");
    return {
      useWeather,
      source: "llm",
      reason: parsed.reason?.trim() || (useWeather ? "需要查天气" : "无需天气工具"),
    };
  } catch {
    return { useWeather: false, source: "fallback", reason: "LLM 工具分类失败，默认不调用工具" };
  }
}
