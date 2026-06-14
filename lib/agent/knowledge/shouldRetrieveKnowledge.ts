import type { AgentRunMode } from "../contracts";

/** 明显不需要查知识库 */
const SKIP_RAG_PATTERNS: RegExp[] = [
  /^(?:复述|重复|再说)(?:一遍|一下)?/,
  /天气怎么样|天气如何|会下雨|多少度|气温/,
  /^(?:你好|谢谢|好的|收到)[。!！]?$/,
  /加入.*(?:第|day)\s*\d/i,
  /(?:第|day)\s*\d+.*(?:节奏|改成|改为|删除|去掉|紧凑|留白)/i,
];

/** 需要查攻略/事实库 */
const NEED_RAG_PATTERNS: RegExp[] = [
  /攻略|游记|介绍|推荐|有什么|有哪些|怎么玩|怎么安排|注意事项/,
  /开放时间|门票|预约|美食|小吃|景点|博物馆|历史|文化|典故|传说|必去/,
  /适合.*(?:晚上|白天|亲子|老人|情侣)/,
  /查(?:一下|查)?|了解(?:一下)?/,
  /本地(?:特色|文化|习俗)/,
];

export function buildRagQuery(parts: {
  userMessage: string;
  destination?: string;
  additionalNotes?: string;
}): string {
  return [parts.userMessage, parts.destination, parts.additionalNotes]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

/**
 * 课程要求「在需要时检索」：完整规划默认检索；问答/修订仅在明显需要攻略事实时检索。
 */
export function shouldRetrieveKnowledge(input: {
  goalText: string;
  runMode?: AgentRunMode;
}): boolean {
  const text = input.goalText.trim();
  if (!text) return false;
  if (SKIP_RAG_PATTERNS.some((p) => p.test(text))) return false;
  if (input.runMode === "full_plan_execute") return true;
  if (NEED_RAG_PATTERNS.some((p) => p.test(text))) return true;
  return false;
}

export function skipRagReason(goalText: string, runMode?: AgentRunMode): string {
  if (shouldRetrieveKnowledge({ goalText, runMode })) return "";
  if (SKIP_RAG_PATTERNS.some((p) => p.test(goalText.trim()))) {
    return "本轮为复述/天气/纯日程修订，无需检索外部知识库";
  }
  if (runMode === "incremental_revise") {
    return "增量修订未涉及攻略事实查询，跳过 RAG";
  }
  return "未检测到需要知识库支撑的问题";
}
