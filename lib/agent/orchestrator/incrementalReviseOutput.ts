import { isValidTripPlan, parseTripPlanDocument } from "../tripPlan/schema";
import { extractJsonObject } from "./runModeDecision";
import type { TripPlanDocument } from "../tripPlan/types";

export interface IncrementalReviseOutput {
  chatReply: string;
  tripPlanStructured: TripPlanDocument;
}

export function parseIncrementalReviseOutput(raw: string): IncrementalReviseOutput | null {
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as {
      chatReply?: string;
      tripPlanStructured?: unknown;
      tripPlan?: unknown;
    };
    const chatReply = parsed.chatReply?.trim();
    const planRaw = parsed.tripPlanStructured ?? parsed.tripPlan;
    const tripPlanStructured = parseTripPlanDocument(planRaw);
    if (!chatReply || !isValidTripPlan(tripPlanStructured)) {
      return null;
    }
    return { chatReply, tripPlanStructured };
  } catch {
    return null;
  }
}

export function isGenericIncrementalChatReply(chatReply: string): boolean {
  const t = chatReply.trim();
  if (!t) return true;
  if (
    /已根据您的要求更新|已按您的要求|完整修订版行程已同步至右侧|已同步至右侧「全程出行方案」|请打开「全程出行方案」查看/.test(
      t
    )
  ) {
    return true;
  }
  if (t.length < 20 && /已更新|已同步/.test(t)) return true;
  return false;
}

/** LLM 未按 JSON 输出时的降级：不再用规则引擎，由上层触发重试或报错 */
export function fallbackIncrementalReviseOutput(
  _raw: string,
  _userRequest: string,
  _baseline: TripPlanDocument | null
): IncrementalReviseOutput | null {
  return null;
}
