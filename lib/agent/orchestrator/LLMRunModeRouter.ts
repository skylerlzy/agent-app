import type { ChatMessage, ILLMClient } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import type { RunModeRouterInput } from "./RunModeRouter";
import { parseRunModeDecisionJson, type RunModeDecision } from "./runModeDecision";

const ROUTER_SYSTEM = `你是智能出行助手的路由分类器。根据用户本轮消息、是否已有完整行程方案、近期对话，选择唯一运行模式：

- full_plan_execute：需要从零生成或推倒重来完整出行方案（新规划、换目的地、重新做攻略、首次提出出游意向等）
- incremental_revise：在已有方案上做局部修改（改某一天安排/节奏/景点、加减活动、调预算、把 POI 加入某日等），须更新主行程
- quick_reply：简单问答或复述，不修改主行程（天气、概念介绍、复述某天内容、确认信息、闲聊感谢等）

判定原则：
1. 用户明确要求改日程/加景点/改节奏/嵌入某活动 → incremental_revise（即使用词是「加入」「紧凑」「多安排」等）
2. 仅询问、复述、解释已有内容 → quick_reply
3. 无已有方案且用户在规划新出行 → full_plan_execute
4. 有已有方案但用户要全新规划/换城/从头再来 → full_plan_execute

只输出一个 JSON 对象，不要 Markdown。键：mode（三选一字符串）、confidence（0~1 数字）、reason（一句中文依据）。`;

function recentHistoryBlock(history: ChatMessage[] | undefined): string {
  const hist = history?.filter((m) => m.content.trim()) ?? [];
  if (!hist.length) return "";
  const tail = hist.slice(-6);
  return formatHistoryForPrompt(tail);
}

/**
 * 用 LLM 理解用户意图并选择 runMode（单次低温度 completion）。
 */
export class LLMRunModeRouter {
  constructor(private readonly llm: ILLMClient) {}

  async classify(input: RunModeRouterInput): Promise<RunModeDecision> {
    const historyBlock = recentHistoryBlock(input.history);
    const planHint = input.planSummaryHint?.trim()
      ? `【已有方案摘要（前段）】\n${input.planSummaryHint.trim().slice(0, 900)}\n\n`
      : "";

    const user: ChatMessage = {
      role: "user",
      content: `${historyBlock}${planHint}【是否已有完整行程方案】${input.hasExistingPlan ? "是" : "否"}

【用户本轮消息】
${input.goalText.trim()}`,
    };

    const raw = await this.llm.complete(
      [
        { role: "system", content: ROUTER_SYSTEM },
        user,
      ],
      { temperature: 0.1, requestLabel: "run_mode_router" }
    );

    const parsed = parseRunModeDecisionJson(raw);
    if (!parsed) {
      throw new Error("run_mode_router: invalid JSON from LLM");
    }
    return parsed;
  }
}
