import type { AgentRunMode, ChatMessage, IRunModeRouter } from "../contracts";

const RECAP_PATTERNS: RegExp[] = [
  /复述/,
  /重复(?:一遍|一下)?/,
  /再说(?:一遍|一下)/,
  /再看(?:一遍|一下)?/,
  /回顾/,
  /总结一下/,
  /之前(?:的|已经)?.*(?:行程|安排|计划|方案)/,
  /已经生成(?:的)?/,
  /上面(?:的|提到)/,
  /刚才(?:的|说)/,
  /哪(?:一|1)?天/,
  /行程(?:是|安排)(?:什么|怎样)/,
  /帮我(?:看|列|整理).*(?:day|第.*天)/i,
  // 须带「复述/查看」语境，避免「第三天节奏改紧凑」被误判为复述
  /(?:复述|重复|再说|回顾|看看|说一下).*(?:day\s*\d+|第\s*[一二三四五六七八九十\d]+\s*天)/i,
  /(?:day\s*\d+|第\s*[一二三四五六七八九十\d]+\s*天).*(?:是什么|有哪些|怎么安排|内容|怎样|说了什么)/i,
];

const REVISE_PATTERNS: RegExp[] = [
  /改(?:成|为|一下|动)?/,
  /修改/,
  /调整/,
  /换成/,
  /替换/,
  /删除/,
  /去掉/,
  /增加/,
  /添加/,
  /加入/,
  /嵌入/,
  /纳入/,
  /列入/,
  /减少/,
  /降低/,
  /升(?:高|到)/,
  /预算/,
  /慢节奏/,
  /快节奏/,
  /少(?:点|些)?.*景点/,
  /多(?:点|些)?.*景点/,
  /重新规划/,
  /换(?:个|一种)/,
  /紧凑/,
  /更(?:紧凑|轻松|慢|快)/,
  /多安排/,
  /少安排/,
  /更多活动/,
  /写入.*日程/,
  /更新.*(?:day|第.*天|日程)/i,
  /(?:第\s*[一二三四五六七八九十\d]+\s*天|day\s*\d+).*(?:节奏|日程|行程|安排|活动|景点)/i,
  /(?:节奏|日程|行程).*(?:第\s*[一二三四五六七八九十\d]+\s*天|day\s*\d+)/i,
];

const FULL_PLAN_PATTERNS: RegExp[] = [
  /规划/,
  /安排/,
  /设计/,
  /制定/,
  /\d+\s*天\s*(?:游|行程)/,
  /帮我.*游/,
  /想去/,
  /出行方案/,
  /攻略/,
  /度假/,
];

/** 隐含出行规划意图（短句也须走 full，如「从南京去珠海玩」） */
const TRAVEL_INTENT_PATTERNS: RegExp[] = [
  /从.+?(?:去|到|飞).+?(?:玩|旅|游)/,
  /(?:去|到|飞).{2,}?(?:玩|旅(?:游|行)|度假)/,
  /(?:周末|假期|小长假|国庆|春节).*(?:去|玩|游|旅)/,
  /出(?:游|行)/,
  /自由行/,
  /自(?:助|驾)游/,
];

const FORCE_FULL_PATTERNS: RegExp[] = [/重新规划/, /全新/, /另起/, /从头/, /重做/];

/** 简单问答（含天气）：走 quick_reply，允许 0～1 次工具 */
const SIMPLE_QA_PATTERNS: RegExp[] = [
  /天气怎么样/,
  /天气如何/,
  /查(?:一下|查)?.*天气/,
  /会下雨/,
  /气温/,
  /多少度/,
  /冷不冷/,
  /热不热/,
  /适合出行吗/,
  /你好/,
  /谢谢/,
  /什么是/,
  /介绍一下/,
];

const TOOL_NEEDED_IN_PLAN_PATTERNS: RegExp[] = [
  /路线/,
  /多久/,
  /多远/,
  /实时/,
  /最新.*天气/,
];

export interface RunModeRouterInput {
  goalText: string;
  history: ChatMessage[];
  hasExistingPlan: boolean;
  planSummaryHint?: string;
}

/**
 * 启发式 runMode 路由：
 * - 简单问答 / 复述 → quick_reply
 * - 局部修订（已有方案）→ incremental_revise
 * - 新规划 / 强制重规划 → full_plan_execute
 */
export function decideRunMode(input: RunModeRouterInput): AgentRunMode {
  const text = input.goalText.trim();
  if (!text) return "full_plan_execute";

  if (FORCE_FULL_PATTERNS.some((p) => p.test(text))) {
    return "full_plan_execute";
  }

  const isRecap = RECAP_PATTERNS.some((p) => p.test(text));
  const isRevise = REVISE_PATTERNS.some((p) => p.test(text));
  const wantsNewPlan = FULL_PLAN_PATTERNS.some((p) => p.test(text));
  const hasTravelIntent = TRAVEL_INTENT_PATTERNS.some((p) => p.test(text));
  const needsFullPlan = wantsNewPlan || hasTravelIntent;
  const isSimpleQa = SIMPLE_QA_PATTERNS.some((p) => p.test(text));
  const needsPlanLevelTool =
    TOOL_NEEDED_IN_PLAN_PATTERNS.some((p) => p.test(text)) && needsFullPlan;

  if (isSimpleQa && !needsFullPlan && !isRevise) {
    return "quick_reply";
  }

  if (!input.hasExistingPlan) {
    if (needsFullPlan || needsPlanLevelTool) return "full_plan_execute";
    if (isRevise) return "full_plan_execute";
    // 新对话默认完整规划；勿因短句误判 quick（如「从南京去珠海玩」）
    if (isSimpleQa) return "quick_reply";
    return "full_plan_execute";
  }

  // 修订优先于「含 DayN 字样」的复述，避免局部改日程误走 quick_reply
  if (isRevise && !needsPlanLevelTool) {
    return "incremental_revise";
  }

  if (isRecap && !isRevise) {
    return "quick_reply";
  }

  if (needsFullPlan && !isRecap) {
    return "full_plan_execute";
  }

  if (!isRevise && !needsFullPlan && text.length <= 80) {
    return "quick_reply";
  }

  return "full_plan_execute";
}

/** IRunModeRouter 默认实现（启发式，无 LLM 开销） */
export class RunModeRouter implements IRunModeRouter {
  async decide(input: RunModeRouterInput) {
    return {
      mode: decideRunMode(input),
      source: "heuristic" as const,
    };
  }
}
