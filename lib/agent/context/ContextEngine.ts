import type {
  AgentContextBundle,
  AgentRunInput,
  ChatMessage,
  IContextEngine,
  ILLMClient,
  KnowledgeChunk,
  UserMemory,
} from "../contracts";
import { formatCitations } from "../knowledge";
import {
  estimateMessagesTokens,
  estimateTextTokens,
  readContextTokenBudget,
} from "./estimateTokens";

const DEFAULT_MAX_RECENT_MESSAGES = 20;
const DEFAULT_MEMORY_LIMIT = 10;
const DEFAULT_RAG_LIMIT = 5;
const DEFAULT_WORKING_MEMORY_CHARS = 7000;
const SUMMARY_TRIGGER_RATIO = 0.6;

export interface ContextEngineOptions {
  defaultTokenBudget?: number;
  maxRecentMessages?: number;
  memoryLimit?: number;
  ragLimit?: number;
  maxWorkingMemoryChars?: number;
  summarizer?: ILLMClient;
}

function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+\n/g, "\n").trim();
}

function clip(text: string, maxChars: number): string {
  const t = clean(text);
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 24)).trim()}\n...（已截断）`;
}

function formatMemories(memories: UserMemory[], limit: number): string {
  const picked = memories.slice(0, limit);
  if (!picked.length) return "";
  return [
    "【长期记忆】",
    "以下为跨对话沉淀的用户偏好、事实与约束；若与本轮明确要求冲突，以本轮为准。",
    ...picked.map((m, i) => `${i + 1}. ${m.kind}: ${m.content}`),
  ].join("\n");
}

function formatRag(chunks: KnowledgeChunk[], limit: number): string {
  const picked = chunks.slice(0, limit);
  if (!picked.length) return "";
  const body = picked
    .map((c, i) =>
      [
        `${i + 1}. ${c.documentTitle} · ${c.citation} · score=${c.score}`,
        clip(c.content, 1200),
        `[来源: ${c.documentTitle} · ${c.citation}]`,
      ].join("\n")
    )
    .join("\n\n");
  const citations = formatCitations(picked);
  return [
    "【RAG 知识片段】",
    "引用攻略/知识库事实时，句末保留对应 [来源: ...] 标记。",
    body,
    citations ? `【可用出处标记】\n${citations}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatBundleForSystem(
  bundle: AgentContextBundle,
  opts: Required<Pick<ContextEngineOptions, "memoryLimit" | "ragLimit" | "maxWorkingMemoryChars">>
): string {
  const sections = [
    bundle.conversationSummary?.trim()
      ? `【此前对话摘要】\n${bundle.conversationSummary.trim()}`
      : "",
    bundle.workingMemory?.trim()
      ? `【工作记忆】\n${clip(bundle.workingMemory, opts.maxWorkingMemoryChars)}`
      : "",
    formatMemories(bundle.longTermMemories ?? [], opts.memoryLimit),
    formatRag(bundle.ragChunks ?? [], opts.ragLimit),
  ].filter(Boolean);
  return sections.join("\n\n");
}

function pickRecentHistoryWithinBudget(
  history: ChatMessage[],
  budgetLeft: number,
  maxRecentMessages: number
): ChatMessage[] {
  const picked: ChatMessage[] = [];
  let used = 0;
  const candidates = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim())
    .slice(-maxRecentMessages);

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const msg = candidates[i];
    const cost = estimateTextTokens(msg.content) + 4;
    if (picked.length > 0 && used + cost > budgetLeft) break;
    if (cost > budgetLeft && picked.length === 0) {
      picked.unshift({
        ...msg,
        content: clip(msg.content, Math.max(600, budgetLeft * 3)),
      });
      break;
    }
    picked.unshift(msg);
    used += cost;
  }

  return picked;
}

function fallbackSummary(history: ChatMessage[], existingSummary?: string): string {
  const lines: string[] = [];
  if (existingSummary?.trim()) {
    lines.push(existingSummary.trim());
  }
  const older = history.filter((m) => m.content.trim());
  const facts: string[] = [];
  for (const m of older) {
    const text = m.content.replace(/\s+/g, " ").trim();
    const hits = text.match(
      /[^。！？.!?]*(?:预算|人均|忌口|不吃|不能吃|偏好|喜欢|希望|必须|不要|慢节奏|快节奏|老人|孩子|出发|返回|住宿|交通)[^。！？.!?]*/g
    );
    for (const hit of hits ?? []) {
      const t = hit.trim();
      if (t.length >= 6 && !facts.includes(t)) facts.push(t);
      if (facts.length >= 12) break;
    }
    if (facts.length >= 12) break;
  }
  if (facts.length) {
    lines.push("关键约束：" + facts.map((f) => f.slice(0, 120)).join("；"));
  } else if (older.length) {
    lines.push(
      older
        .slice(-6)
        .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content.trim().slice(0, 160)}`)
        .join("\n")
    );
  }
  return clip([...new Set(lines)].join("\n"), 1800);
}

async function summarizeWithLlm(
  summarizer: ILLMClient,
  history: ChatMessage[],
  existingSummary?: string
): Promise<string> {
  const transcript = history
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content.trim().slice(0, 1800)}`)
    .join("\n\n");
  const text = await summarizer.complete(
    [
      {
        role: "system",
        content:
          "你是上下文压缩器。请把旅行规划多轮对话压缩为 400-900 字中文摘要，保留目的地、日期、预算、节奏、住宿、交通、饮食忌口、同行人、已确认行程、用户后续修订。不要添加新事实。",
      },
      {
        role: "user",
        content: `${existingSummary ? `已有摘要：\n${existingSummary}\n\n` : ""}待压缩对话：\n${transcript}`,
      },
    ],
    { temperature: 0.1, requestLabel: "context_summarize" }
  );
  return clip(text, 1800);
}

export class ContextEngine implements IContextEngine {
  private readonly defaultTokenBudget: number;
  private readonly maxRecentMessages: number;
  private readonly memoryLimit: number;
  private readonly ragLimit: number;
  private readonly maxWorkingMemoryChars: number;
  private readonly summarizer?: ILLMClient;

  constructor(options: ContextEngineOptions = {}) {
    this.defaultTokenBudget = options.defaultTokenBudget ?? readContextTokenBudget();
    this.maxRecentMessages = options.maxRecentMessages ?? DEFAULT_MAX_RECENT_MESSAGES;
    this.memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
    this.ragLimit = options.ragLimit ?? DEFAULT_RAG_LIMIT;
    this.maxWorkingMemoryChars = options.maxWorkingMemoryChars ?? DEFAULT_WORKING_MEMORY_CHARS;
    this.summarizer = options.summarizer;
  }

  async compose(input: {
    systemBase: string;
    history: ChatMessage[];
    currentUserText: string;
    contextBundle: AgentContextBundle;
    tokenBudget?: number;
  }): Promise<{ messages: ChatMessage[]; updatedSummary?: string }> {
    const tokenBudget = input.tokenBudget ?? this.defaultTokenBudget;
    const baseSystem = clean(input.systemBase);
    const bundleBlock = formatBundleForSystem(input.contextBundle, {
      memoryLimit: this.memoryLimit,
      ragLimit: this.ragLimit,
      maxWorkingMemoryChars: this.maxWorkingMemoryChars,
    });
    let systemContent = [baseSystem, bundleBlock].filter(Boolean).join("\n\n");
    const currentUser: ChatMessage = {
      role: "user",
      content: clip(input.currentUserText, Math.max(1200, Math.floor(tokenBudget * 2.5))),
    };

    const currentUserCost = estimateTextTokens(currentUser.content) + 8;
    const maxSystemTokens = Math.max(300, tokenBudget - currentUserCost - 300);
    if (estimateTextTokens(systemContent) > maxSystemTokens) {
      systemContent = clip(systemContent, Math.max(900, Math.floor(maxSystemTokens * 2.6)));
    }

    const fixedCost =
      estimateTextTokens(systemContent) + estimateTextTokens(currentUser.content) + 16;
    const historyBudget = Math.max(300, tokenBudget - fixedCost);
    const recentHistory = pickRecentHistoryWithinBudget(
      input.history,
      historyBudget,
      this.maxRecentMessages
    );

    const messages: ChatMessage[] = [
      ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
      ...recentHistory,
      currentUser,
    ];

    const rawHistoryTokens = estimateMessagesTokens(input.history);
    const shouldSummarize =
      input.history.length > recentHistory.length ||
      rawHistoryTokens > tokenBudget * SUMMARY_TRIGGER_RATIO;

    let updatedSummary: string | undefined;
    if (shouldSummarize && input.history.length > 0) {
      const olderCount = Math.max(0, input.history.length - recentHistory.length);
      const toSummarize = olderCount > 0 ? input.history.slice(0, olderCount) : input.history;
      try {
        updatedSummary = this.summarizer
          ? await summarizeWithLlm(
              this.summarizer,
              toSummarize,
              input.contextBundle.conversationSummary
            )
          : fallbackSummary(toSummarize, input.contextBundle.conversationSummary);
      } catch {
        updatedSummary = fallbackSummary(toSummarize, input.contextBundle.conversationSummary);
      }
      if (!updatedSummary.trim()) updatedSummary = undefined;
    }

    return { messages, updatedSummary };
  }

  async optimizeAgentInput(
    input: AgentRunInput,
    opts?: { systemBase?: string; tokenBudget?: number }
  ): Promise<{ input: AgentRunInput; updatedSummary?: string }> {
    const bundle: AgentContextBundle = input.contextBundle ?? {
      longTermMemories: [],
      ragChunks: [],
    };
    const result = await this.compose({
      systemBase: opts?.systemBase ?? "智能出行助手上下文包",
      history: input.history ?? [],
      currentUserText: input.goal.rawText,
      contextBundle: bundle,
      tokenBudget: opts?.tokenBudget,
    });

    const optimizedHistory = result.messages.filter(
      (m, index) =>
        m.role !== "system" &&
        !(index === result.messages.length - 1 && m.role === "user")
    );
    const estimatedTokens = estimateMessagesTokens(result.messages);
    const nextBundle: AgentContextBundle = {
      ...bundle,
      conversationSummary: result.updatedSummary ?? bundle.conversationSummary,
      estimatedTokens,
    };

    return {
      input: {
        ...input,
        history: optimizedHistory,
        contextBundle: nextBundle,
      },
      updatedSummary: result.updatedSummary,
    };
  }
}
