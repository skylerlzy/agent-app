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
  /day\s*\d+/i,
  /第\s*[一二三四五六七八九十\d]+\s*天/,
  /哪(?:一|1)?天/,
  /行程(?:是|安排)(?:什么|怎样)/,
  /帮我(?:看|列|整理).*(?:day|第.*天)/i,
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
  const isSimpleQa = SIMPLE_QA_PATTERNS.some((p) => p.test(text));
  const needsPlanLevelTool =
    TOOL_NEEDED_IN_PLAN_PATTERNS.some((p) => p.test(text)) && wantsNewPlan;

  if (isSimpleQa && !wantsNewPlan && !isRevise) {
    return "quick_reply";
  }

  if (!input.hasExistingPlan) {
    if (wantsNewPlan || needsPlanLevelTool) return "full_plan_execute";
    if (isRevise) return "full_plan_execute";
    if (text.length <= 80) return "quick_reply";
    return "full_plan_execute";
  }

  if (isRecap && !isRevise) {
    return "quick_reply";
  }

  if (isRevise && !needsPlanLevelTool) {
    return "incremental_revise";
  }

  if (wantsNewPlan && !isRecap) {
    return "full_plan_execute";
  }

  if (!isRevise && !wantsNewPlan && text.length <= 80) {
    return "quick_reply";
  }

  return "full_plan_execute";
}

/** IRunModeRouter 默认实现（启发式，无 LLM 开销） */
export class RunModeRouter implements IRunModeRouter {
  decide(input: RunModeRouterInput): AgentRunMode {
    return decideRunMode(input);
  }
}
