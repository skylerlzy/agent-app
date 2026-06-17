import type { ChatMessage, ILLMClient, IRunModeRouter } from "../contracts";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { refineRunModeIfNeeded } from "../intent/runModeRefinement";
import type { RunModeRouterInput } from "./RunModeRouter";
import { parseRunModeDecisionJson, type RunModeDecision } from "./runModeDecision";

const ROUTER_SYSTEM = `你是智能出行助手的路由分类器。根据用户本轮消息、是否已有完整行程方案、近期对话，选择唯一运行模式：

## 三种模式

- **full_plan_execute**：从零生成或推倒重来完整出行方案（新规划、换目的地、重新做攻略、首次提出出游意向等）
- **incremental_revise**：用户**明确要求**把变更写入/更新右侧已保存的行程正文（改某天、加删景点、调节奏/预算并反映到日程）
- **quick_reply**：仅对话中回答，**不修改**右侧行程（问答、推荐、探索、复述、闲聊、天气等）

## 判定优先级（非常重要）

1. 先问：用户是否**明确要求修改已保存行程**？若否 → 倾向 **quick_reply**
2. 仅有「咨询/探索/了解」语气，即使已有方案 → **quick_reply**
3. 仅有「改写行程」的**明确指令** → **incremental_revise**

## quick_reply 典型（即使有完整南京一日游方案）

- 「还有什么好玩的」「有什么推荐」「附近还能去哪」「值得去吗」
- 「介绍一下夫子庙」「XX要预约吗」「游玩要多久」
- 「复述一下第一天」「当前行程有哪些景点」
- 天气、感谢、闲聊

## incremental_revise 典型（必须更新右侧行程）

- 「把夫子庙**加入**第二天」「**删掉**中山陵」「第二天**改成**慢节奏」
- 「**安排**老门东在 Day2 晚上」「预算**降到**2000 并**调整**餐饮」

## 反例（易错，应判 quick_reply 而非 incremental_revise）

- 用户：「南京还有什么好玩的」→ 在征集额外推荐，**未要求写入行程** → quick_reply
- 用户：「除了中山陵还有什么」→ 了解型问题 → quick_reply

## 其他

- 无已有方案且用户在规划新出行 → full_plan_execute
- 有方案但要换城/从头再来 → full_plan_execute

只输出 JSON：{"mode":"full_plan_execute"|"incremental_revise"|"quick_reply","confidence":0~1,"reason":"一句中文"}`;

function recentHistoryBlock(history: ChatMessage[] | undefined): string {
  const hist = history?.filter((m) => m.content.trim()) ?? [];
  if (!hist.length) return "";
  const tail = hist.slice(-6);
  return formatHistoryForPrompt(tail);
}

/**
 * 用 LLM 理解用户意图并选择 runMode（单次低温度 completion）。
 */
export class LLMRunModeRouter implements IRunModeRouter {
  constructor(private readonly llm: ILLMClient) {}

  async decide(input: RunModeRouterInput): Promise<RunModeDecision> {
    try {
      return await this.classify(input);
    } catch {
      return {
        mode: input.hasExistingPlan ? "quick_reply" : "full_plan_execute",
        source: "fallback",
        reason: "LLM 路由失败，已有方案时默认快答、否则全量规划",
      };
    }
  }

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

    const refined = await refineRunModeIfNeeded(
      this.llm,
      input,
      parsed.mode,
      parsed.reason
    );

    if (refined.refined && refined.mode !== parsed.mode) {
      return {
        mode: refined.mode,
        source: "llm",
        reason: refined.reason ?? parsed.reason,
        confidence: parsed.confidence,
      };
    }

    return parsed;
  }
}
