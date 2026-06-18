import type { AgentRunInput, ILLMClient } from "../contracts";
import { serializeTripPlan } from "../tripPlan/schema";
import {
  formatItineraryDiffSummary,
  formatItineraryJsonForPrompt,
  formatItinerarySlotsForAssessment,
  mergeIncrementalTripPlan,
  tripPlanMeaningfullyChanged,
} from "../tripPlan/incrementalReviseMerge";
import {
  applyRevisionOperations,
  parseRevisionOperations,
  type RevisionOperation,
} from "../tripPlan/incrementalReviseOperations";
import type { TripPlanDocument } from "../tripPlan/types";
import { appendSkillSection } from "../skills/appendSkillSection";
import {
  isGenericIncrementalChatReply,
  parseIncrementalReviseOutput,
  type IncrementalReviseOutput,
} from "./incrementalReviseOutput";
import { summarizeRevisionChanges } from "./incrementalReviseSummary";
import { extractJsonObject } from "./runModeDecision";

const TRIP_PLAN_JSON_HINT = `tripPlanStructured 须为 version=1 的完整对象，字段含 meta, overview, weatherTips, transport, themesAndPlaces, itinerary(按天 morning/afternoon/evening 三个数组), foodAndBudget, tipsAndDisclaimer, topPlacesToVisit 等。`;

type RevisionAssessment = {
  status: "applied" | "already_satisfied" | "not_applied";
  chatReply: string;
  tripPlanStructured?: TripPlanDocument;
};

function buildReviseSystemPrompt(skillSection?: string): string {
  return appendSkillSection(
    `你是行程修订引擎。用户要在**已有结构化 JSON 行程**上做局部修改，你必须在 tripPlanStructured 里真实写入变更。

## 工作方式
1. 以【基线 JSON】为唯一来源：先完整复制全部字段与全部天数，再仅改用户提到的部分。
2. itinerary 天数必须与基线一致；每一天必须输出 morning、afternoon、evening 三个数组（可为空 []）。
3. 用户说「取消 / 删掉 / 不要」某时段 → 该数组设为 []。
4. 用户说「不去 A 了，改为 B」→ 该时段替换为 B，不得同时保留 A。
5. 未提及的天与时段：从基线**原样保留**。
6. chatReply：2～5 句，说明具体改动；若基线已满足要求，说明「该时段已无安排/已符合要求」。
7. 不要编造新的实时天气/铁路 API 数据。

## 输出格式
只输出一个 JSON 对象：
{"chatReply":"...","tripPlanStructured":{...完整方案...}}`,
    skillSection
  );
}

function buildReviseUserMessage(input: {
  historyBlock: string;
  knowledgeBlock: string;
  baseline: TripPlanDocument;
  userRequest: string;
  preferences: AgentRunInput["context"]["preferences"];
  retryNote?: string;
}): string {
  const baselineJson = serializeTripPlan(input.baseline);
  const trimmedBaseline =
    baselineJson.length > 14000
      ? `${baselineJson.slice(0, 14000)}\n…（基线 JSON 已截断，itinerary 见下）`
      : baselineJson;

  const parts = [
    input.historyBlock,
    input.knowledgeBlock ? `${input.knowledgeBlock}\n` : "",
    input.retryNote ? `【重试说明】\n${input.retryNote}\n` : "",
    `【基线 tripPlanStructured JSON（必须以此为底修改）】\n${trimmedBaseline}`,
    `\n【基线 itinerary 数组（便于对照）】\n${formatItineraryJsonForPrompt(input.baseline)}`,
    `\n【用户偏好】\n${JSON.stringify(input.preferences, null, 2)}`,
    `\n【用户修订要求】\n${input.userRequest.trim()}`,
  ];

  return parts.filter(Boolean).join("\n");
}

function buildRetryNote(userRequest: string): string {
  return `上次输出合并后与基线 itinerary 相同，或未落实用户修订。
用户要求：「${userRequest.trim()}」
请输出**完整** tripPlanStructured（所有天数保留），并修改用户点名的 day/slot。`;
}

async function callReviseLlm(
  llm: ILLMClient,
  system: string,
  user: string,
  label: string,
  temperature: number
): Promise<IncrementalReviseOutput | null> {
  const raw = (
    await llm.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature, requestLabel: label }
    )
  ).trim();

  let parsed = parseIncrementalReviseOutput(raw);
  if (parsed) return parsed;

  const retryRaw = (
    await llm.complete(
      [
        {
          role: "system",
          content: `${system}\n\n上次未输出合法 JSON。请仅输出 {"chatReply":"...","tripPlanStructured":{...}}。${TRIP_PLAN_JSON_HINT}`,
        },
        { role: "user", content: user },
      ],
      { temperature: 0.1, requestLabel: `${label}_json_retry` }
    )
  ).trim();

  return parseIncrementalReviseOutput(retryRaw);
}

/** LLM 将用户自然语言解析为结构化 operations，再确定性写入 baseline */
async function interpretRevisionOperations(
  llm: ILLMClient,
  input: {
    baseline: TripPlanDocument;
    userRequest: string;
  }
): Promise<{ operations: RevisionOperation[]; chatReply: string } | null> {
  const system = `你是行程修订意图解析器。根据用户要求与当前按日安排，输出要执行的修订操作（不要输出完整 tripPlan）。

只输出 JSON：
{
  "chatReply": "2～5 句面向用户的说明",
  "operations": [
    { "action": "clear", "slot": "morning|afternoon|evening", "dayIndex": 1, "dateIso": "2026-06-26", "dayTitle": "Day 3" },
    { "action": "replace", "slot": "evening", "dayIndex": 1, "itineraryItem": "清华大学", "briefDescription": "..." }
  ]
}

规则：
- dayIndex 为 1-based，与 Day 1/2/3 对应；尽量同时给出 dateIso 或 dayTitle（若能从基线推断）
- clear：清空该时段；replace：替换为该活动
- 若用户要取消的时段在基线中已是空，operations 可为 []，chatReply 说明「已无安排/已符合要求」
- 只输出用户明确要求的操作，不要改其他天`;

  const user = `【用户修订要求】
${input.userRequest.trim()}

【当前按日安排】
${formatItinerarySlotsForAssessment(input.baseline)}

【itinerary JSON】
${formatItineraryJsonForPrompt(input.baseline)}`;

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.15, requestLabel: "incremental_revise_operations" }
    );
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr) as {
      chatReply?: string;
      operations?: unknown;
    };
    const chatReply = parsed.chatReply?.trim();
    if (!chatReply) return null;
    return {
      operations: parseRevisionOperations(parsed.operations),
      chatReply,
    };
  } catch {
    return null;
  }
}

async function assessRevisionOutcome(
  llm: ILLMClient,
  input: {
    baseline: TripPlanDocument;
    candidate: TripPlanDocument;
    userRequest: string;
  }
): Promise<RevisionAssessment | null> {
  const system = `你是行程修订结果校验器。输出 JSON：
{"status":"applied"|"already_satisfied"|"not_applied","chatReply":"2～5句中文"}

- already_satisfied：baseline 已符合用户要求（如要取消的时段已是空）
- applied：candidate 相对 baseline 已正确落实用户要求
- not_applied：仍未满足`;

  const user = `【用户修订要求】
${input.userRequest.trim()}

【baseline】
${formatItinerarySlotsForAssessment(input.baseline)}

【candidate】
${formatItinerarySlotsForAssessment(input.candidate)}

【差异】
${formatItineraryDiffSummary(input.baseline, input.candidate)}`;

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.1, requestLabel: "incremental_revise_assess" }
    );
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr) as {
      status?: string;
      chatReply?: string;
      tripPlanStructured?: unknown;
    };
    const status = parsed.status;
    const chatReply = parsed.chatReply?.trim();
    if (
      !chatReply ||
      (status !== "applied" && status !== "already_satisfied" && status !== "not_applied")
    ) {
      return null;
    }

    let tripPlanStructured: TripPlanDocument | undefined;
    if (parsed.tripPlanStructured) {
      const doc = parseIncrementalReviseOutput(
        JSON.stringify({ chatReply, tripPlanStructured: parsed.tripPlanStructured })
      );
      tripPlanStructured = doc?.tripPlanStructured;
    }

    return { status, chatReply, tripPlanStructured };
  } catch {
    return null;
  }
}

async function finalizeChatReply(
  llm: ILLMClient,
  input: {
    userRequest: string;
    baseline: TripPlanDocument;
    tripPlan: TripPlanDocument;
    chatReply: string;
  }
): Promise<string> {
  let chatReply = input.chatReply;
  if (isGenericIncrementalChatReply(chatReply)) {
    chatReply = await summarizeRevisionChanges(llm, {
      userRequest: input.userRequest,
      previousPlan: formatItinerarySlotsForAssessment(input.baseline),
      revisedPlan: formatItinerarySlotsForAssessment(input.tripPlan),
    });
  } else if (!/改|换|取消|删|增|调整|替换|已无|已是|符合/u.test(chatReply)) {
    const diff = formatItineraryDiffSummary(input.baseline, input.tripPlan);
    if (diff !== "（itinerary 无变化）") {
      chatReply = `${chatReply.trim()} 具体变更：${diff.replace(/\n/g, "；")}。`;
    }
  }
  return chatReply;
}

function buildGracefulReply(
  baseline: TripPlanDocument,
  userRequest: string,
  preferredReply?: string
): string {
  if (preferredReply?.trim()) return preferredReply.trim();
  return `已处理您的修订要求「${userRequest.trim().slice(0, 80)}」。当前按日安排如下，请查看右侧行程面板：\n${formatItinerarySlotsForAssessment(baseline)}`;
}

export async function reviseTripPlanWithLlm(
  llm: ILLMClient,
  input: {
    baseline: TripPlanDocument;
    userRequest: string;
    historyBlock: string;
    knowledgeBlock: string;
    preferences: AgentRunInput["context"]["preferences"];
    skillSystemSection?: string;
  }
): Promise<{ tripPlan: TripPlanDocument; chatReply: string }> {
  const system = buildReviseSystemPrompt(input.skillSystemSection);
  const baseUser = buildReviseUserMessage({
    historyBlock: input.historyBlock,
    knowledgeBlock: input.knowledgeBlock,
    baseline: input.baseline,
    userRequest: input.userRequest,
    preferences: input.preferences,
  });

  let parsed = await callReviseLlm(llm, system, baseUser, "incremental_revise", 0.25);
  if (!parsed) {
    const opsOnly = await interpretRevisionOperations(llm, {
      baseline: input.baseline,
      userRequest: input.userRequest,
    });
    if (opsOnly?.operations.length) {
      const tripPlan = applyRevisionOperations(input.baseline, opsOnly.operations);
      return {
        tripPlan,
        chatReply: await finalizeChatReply(llm, {
          userRequest: input.userRequest,
          baseline: input.baseline,
          tripPlan,
          chatReply: opsOnly.chatReply,
        }),
      };
    }
    if (opsOnly?.operations.length === 0 && opsOnly.chatReply) {
      return { tripPlan: input.baseline, chatReply: opsOnly.chatReply };
    }
    throw new Error("增量修订 LLM 未返回可解析的 JSON");
  }

  let tripPlan = mergeIncrementalTripPlan(input.baseline, parsed.tripPlanStructured);
  let chatReply = parsed.chatReply;

  if (!tripPlanMeaningfullyChanged(input.baseline, tripPlan)) {
    parsed = await callReviseLlm(
      llm,
      system,
      buildReviseUserMessage({ ...input, retryNote: buildRetryNote(input.userRequest) }),
      "incremental_revise_apply_retry",
      0.15
    );
    if (parsed) {
      tripPlan = mergeIncrementalTripPlan(input.baseline, parsed.tripPlanStructured);
      chatReply = parsed.chatReply;
    }
  }

  if (tripPlanMeaningfullyChanged(input.baseline, tripPlan)) {
    chatReply = await finalizeChatReply(llm, {
      userRequest: input.userRequest,
      baseline: input.baseline,
      tripPlan,
      chatReply,
    });
    return { tripPlan, chatReply };
  }

  const opsResult = await interpretRevisionOperations(llm, {
    baseline: input.baseline,
    userRequest: input.userRequest,
  });
  if (opsResult) {
    if (opsResult.operations.length > 0) {
      tripPlan = applyRevisionOperations(input.baseline, opsResult.operations);
      if (tripPlanMeaningfullyChanged(input.baseline, tripPlan)) {
        chatReply = await finalizeChatReply(llm, {
          userRequest: input.userRequest,
          baseline: input.baseline,
          tripPlan,
          chatReply: opsResult.chatReply,
        });
        return { tripPlan, chatReply };
      }
    } else if (/已无|已经|符合|无需|空/u.test(opsResult.chatReply)) {
      return { tripPlan: input.baseline, chatReply: opsResult.chatReply };
    }
  }

  const assessment = await assessRevisionOutcome(llm, {
    baseline: input.baseline,
    candidate: tripPlan,
    userRequest: input.userRequest,
  });

  if (assessment?.status === "already_satisfied") {
    return { tripPlan: input.baseline, chatReply: assessment.chatReply };
  }

  if (assessment?.status === "applied") {
    const assessedPlan = assessment.tripPlanStructured
      ? mergeIncrementalTripPlan(input.baseline, assessment.tripPlanStructured)
      : tripPlan;
    chatReply = await finalizeChatReply(llm, {
      userRequest: input.userRequest,
      baseline: input.baseline,
      tripPlan: assessedPlan,
      chatReply: assessment.chatReply,
    });
    return { tripPlan: assessedPlan, chatReply };
  }

  if (assessment?.status === "not_applied" && opsResult?.operations.length) {
    tripPlan = applyRevisionOperations(input.baseline, opsResult.operations);
    if (tripPlanMeaningfullyChanged(input.baseline, tripPlan)) {
      chatReply = await finalizeChatReply(llm, {
        userRequest: input.userRequest,
        baseline: input.baseline,
        tripPlan,
        chatReply: opsResult.chatReply,
      });
      return { tripPlan, chatReply };
    }
  }

  if (opsResult) {
    tripPlan = applyRevisionOperations(input.baseline, opsResult.operations);
    if (tripPlanMeaningfullyChanged(input.baseline, tripPlan)) {
      chatReply = await finalizeChatReply(llm, {
        userRequest: input.userRequest,
        baseline: input.baseline,
        tripPlan,
        chatReply: opsResult.chatReply,
      });
      return { tripPlan, chatReply };
    }
    if (opsResult.operations.length === 0) {
      return { tripPlan: input.baseline, chatReply: opsResult.chatReply };
    }
  }

  return {
    tripPlan: input.baseline,
    chatReply: buildGracefulReply(
      input.baseline,
      input.userRequest,
      assessment?.chatReply ?? opsResult?.chatReply ?? chatReply
    ),
  };
}
