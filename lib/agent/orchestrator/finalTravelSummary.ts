import type { AgentRunInput, ExecutionPlan, ILLMClient, ToolName } from "../contracts";
import { appendSkillSection } from "../skills/appendSkillSection";
import { formatHistoryForPrompt } from "../context/formatHistoryForPrompt";
import { formatAgentKnowledgeContext, formatCitations } from "../knowledge";

function flattenSteps(plan: ExecutionPlan) {
  return plan.phases.flatMap((phase) => phase.steps ?? []);
}

export type ToolLogEntry = { stepId: string; toolName: ToolName; summary: string };

function fallbackMarkdown(plan: ExecutionPlan, toolLogs: ToolLogEntry[]): string {
  const steps = flattenSteps(plan);
  const toolBlock =
    toolLogs.length > 0
      ? toolLogs.map((t) => `**${t.stepId} · ${t.toolName}**\n\`\`\`json\n${t.summary}\n\`\`\``).join("\n\n")
      : "_本回合暂无成功工具返回的详细 JSON；以下为执行概况。_";

  return [
    "## 行程总览",
    "",
    `已完成计划中的 **${steps.length}** 个步骤。`,
    plan.plannerRationale ? `\n> 规划要点摘录：${plan.plannerRationale.slice(0, 400)}${plan.plannerRationale.length > 400 ? "…" : ""}` : "",
    "",
    "## 天气与着装提示",
    "",
    "_请查看上方轨迹中的天气工具结果；若未调用，以当地临近预报为准。_",
    "",
    "## 交通与耗时参考",
    "",
    "_请查看轨迹中的高德路径估算结果；公交/跨城场景以驾车路网回退时已在工具 note 中说明。_",
    "",
    "## 主题与推荐景点",
    "",
    "_最终润色总结暂不可用；景点与活动建议请以规划步骤描述与自由文本目标为准。_",
    "",
    "## 日程建议（按天）",
    "",
    steps.map((s) => `- **${s.id}**：${s.description}`).join("\n") || "_无步骤。_",
    "",
    "## 饮食与预算",
    "",
    "_请结合用户填写的偏好与目标正文。_",
    "",
    "## 提示与免责",
    "",
    "本摘要为自动降级模板；**开放时间与票价以景区与官方渠道为准**，**铁路时刻以 12306 为准**。",
    "",
    "## 工具观测摘要",
    "",
    toolBlock,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * 在全部步骤执行完后，基于计划与用户偏好生成「示例项目风格」的 Markdown 旅行稿。
 */
export async function synthesizeTravelMarkdown(
  llm: ILLMClient,
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[]
): Promise<string> {
  const planBrief = [
    plan.plannerRationale ? `【规划论证】\n${plan.plannerRationale}` : "",
    ...plan.phases.flatMap((ph) => [
      `【阶段】${ph.title}`,
      ...(ph.steps ?? []).map((s) => `  ${s.id}: ${s.description}`),
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  const toolsBlock =
    toolLogs.length > 0
      ? toolLogs.map((t) => `--- ${t.stepId} / ${t.toolName} ---\n${t.summary}`).join("\n\n")
      : "（本回合无成功工具 JSON。请仅依据用户目标与偏好给出原则性建议，并明确写出「未查询到实时天气/路线数据」。）";

  const system = appendSkillSection(
    `你是面向最终用户的智能出行顾问。你只能把「工具观测数据」中出现的数值与文字当作事实；禁止编造未出现在其中的气温、AQI、距离、耗时或票价。
请用 **Markdown** 写一份完整、友好的中文出行方案。必须按顺序包含以下二级标题（行首 ## ）：
## 行程总览
## 天气与着装提示
## 交通与耗时参考
## 主题与推荐景点
## 日程建议（按天）
## 饮食与预算
## 提示与免责

要求：
- 「主题与推荐景点」「日程建议」可写具体景点/街区名称，但须标注为**常识性参考**，并提醒开放时间、预约与门票以官方为准；高铁/动车时刻以 12306 为准。
- 若 weather_forecast / maps_route_estimate 数据缺失或 JSON 中有错误提示，须在对应章节诚实说明，不得杜撰补全。
- 若【RAG 知识片段】非空，涉及攻略/知识库事实的句子必须追加对应格式的出处标记：[来源: 文档标题 · 引用位置]。
- 必须遵守【长期记忆】中的用户偏好和约束；若与本轮明确要求冲突，以本轮要求为准并简短说明。
- 结合用户偏好 JSON 中的 **tripStartDateIso / tripEndDateIso**、节奏、主题、交通方式、预算、住宿类型、饮食预设、同行规模与备注，写可执行的**按日**日程粒度（例如「上午 / 下午」），但不要假装已订票。`,
    input.skillSystemSection
  );

  const historyBlock = formatHistoryForPrompt(
    input.history,
    input.contextBundle?.conversationSummary
  );
  const knowledgeBlock = formatAgentKnowledgeContext(input.contextBundle);

  const user = `${historyBlock}${knowledgeBlock ? `${knowledgeBlock}\n\n` : ""}【用户目标】\n${input.goal.rawText}\n\n【结构化槽位】\n${JSON.stringify(input.goal.slots ?? {}, null, 2)}\n\n【用户偏好】\n${JSON.stringify(input.context.preferences, null, 2)}\n\n【执行计划】\n${planBrief}\n\n【工具观测数据】\n${toolsBlock}${historyBlock ? "\n\n【多轮说明】回答须与「近期对话」中的约束一致（如预算、节奏、忌口）；若用户在本轮修订了部分内容，在摘要中明确变更点并保留未改部分。" : ""}`;

  const text = await llm.complete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.35, requestLabel: "run_final_travel_summary" }
  );
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty summary");
  return trimmed;
}

export async function buildRunDoneSummary(
  llm: ILLMClient | undefined,
  input: AgentRunInput,
  plan: ExecutionPlan,
  toolLogs: ToolLogEntry[]
): Promise<string> {
  if (!llm) {
    const citations = formatCitations(input.contextBundle?.ragChunks ?? []);
    const base = fallbackMarkdown(plan, toolLogs);
    return citations ? `${base}\n\n## 知识来源\n\n${citations}` : base;
  }
  try {
    return await synthesizeTravelMarkdown(llm, input, plan, toolLogs);
  } catch {
    return fallbackMarkdown(plan, toolLogs);
  }
}
