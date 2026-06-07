import { ConvexError, v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { createAutonomousAgentPipeline } from "../lib/agent/orchestrator/factory";
import type {
  AgentRunInput,
  AgentRunMode,
  ChatMessage,
  KnowledgeChunk,
  ITraceSink,
  ReasoningEvent,
  TripPreferences,
  UserMemory,
  UserGoal,
} from "../lib/agent/contracts";
import { buildAgentRunInput } from "../lib/agent/conversation/ConversationContextBuilder";
import {
  buildWorkingMemoryWithTripPlan,
  extractTripPlanFromHistory,
  looksLikeFullItinerary,
} from "../lib/agent/context/tripPlanMemory";
import { decideRunMode } from "../lib/agent/orchestrator/RunModeRouter";
import { SkillRegistry, resolveSkillSystemSection } from "../lib/agent/skills/SkillRegistry";
import {
  activeSkillIdsValidator,
  runModeValidator,
  runPreferencesValidator,
} from "./runValidators";

const runSlotsValidator = v.optional(
  v.object({
    originCity: v.optional(v.string()),
    destination: v.optional(v.string()),
    startDateIso: v.optional(v.string()),
    endDateIso: v.optional(v.string()),
    budgetCny: v.optional(v.number()),
    pace: v.optional(v.union(v.literal("slow"), v.literal("balanced"), v.literal("fast"))),
  })
);

type RunBody = {
  sessionId: string;
  goalRaw: string;
  conversationId?: string;
  slots?: UserGoal["slots"];
  preferences?: AgentRunInput["context"]["preferences"];
  activeSkillIds?: string[];
  runMode?: AgentRunInput["runMode"];
  enabledToolNames?: string[];
};

function buildAgentInput(args: RunBody, userId: string): AgentRunInput {
  const pref = args.preferences ?? {};
  const baseSlots = args.slots ?? {};
  const mergedSlots = {
    ...baseSlots,
    startDateIso: pref.tripStartDateIso ?? baseSlots.startDateIso,
    endDateIso: pref.tripEndDateIso ?? baseSlots.endDateIso,
    pace: pref.pace ?? baseSlots.pace,
    budgetCny: pref.budgetCny ?? baseSlots.budgetCny,
  };
  const goalSlots = Object.fromEntries(
    Object.entries(mergedSlots).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const slotsOut =
    Object.keys(goalSlots).length > 0 ? (goalSlots as UserGoal["slots"]) : undefined;

  return {
    sessionId: args.sessionId,
    conversationId: args.conversationId,
    goal: {
      rawText: args.goalRaw,
      slots: slotsOut,
    },
    context: {
      userId,
      preferences: pref,
    },
    runMode: args.runMode,
    contextBundle: {
      longTermMemories: [],
      ragChunks: [],
    },
    activeSkillIds: args.activeSkillIds ?? [],
    enabledToolNames: args.enabledToolNames as AgentRunInput["enabledToolNames"],
  };
}

type SessionMeta = {
  conversationId?: string;
  runMode?: AgentRunMode;
  messageId?: string;
};

async function buildAgentInputForConversation(args: {
  ctx: GenericActionCtx<DataModel>;
  sessionId: string;
  conversationId: Id<"conversations">;
  userId: string;
  userMessageId: Id<"messages">;
  preferences: TripPreferences;
  activeSkillIds?: string[];
  enabledToolNames?: string[];
  runMode?: AgentRunMode;
}): Promise<AgentRunInput> {
  const allMessages: Doc<"messages">[] = await args.ctx.runQuery(
    internal.messages.listRowsForConversationInternal,
    {
      conversationId: args.conversationId,
    }
  );

  const conversation = await args.ctx.runQuery(internal.conversations.getInternal, {
    conversationId: args.conversationId,
  });

  const currentIndex = allMessages.findIndex((row: Doc<"messages">) => row._id === args.userMessageId);
  if (currentIndex < 0) {
    throw new Error("无法找到当前用户消息，请刷新页面后重试。");
  }

  const historyRows = allMessages.slice(0, currentIndex);
  const history: ChatMessage[] = historyRows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
    }));

  const userMessage = allMessages[currentIndex];
  const [longTermMemories, ragChunks]: [UserMemory[], KnowledgeChunk[]] = await Promise.all([
    args.ctx.runQuery(internal.memories.listLongTermMemoriesInternal, {
      userId: args.userId,
      conversationId: args.conversationId,
      sharedKnowledgeEnabled: conversation?.sharedKnowledgeEnabled ?? true,
      limit: 12,
    }),
    args.ctx.runQuery(internal.knowledge.retrieveInternal, {
      userId: args.userId,
      query: userMessage.content,
      topK: 5,
    }),
  ]);

  const input = await buildAgentRunInput({
    sessionId: args.sessionId,
    userId: args.userId,
    conversationId: args.conversationId,
    userMessage: userMessage.content,
    preferences: args.preferences,
    history,
    conversationSummary: conversation?.summary,
    runMode: args.runMode,
    activeSkillIds: args.activeSkillIds,
    enabledToolNames: args.enabledToolNames as AgentRunInput["enabledToolNames"],
  });
  input.contextBundle = {
    ...input.contextBundle,
    longTermMemories,
    ragChunks,
  };
  return input;
}

async function enrichInputWithSkills(
  ctx: GenericActionCtx<DataModel>,
  input: AgentRunInput,
  userId: string
): Promise<AgentRunInput> {
  const skillIds = input.activeSkillIds ?? [];
  if (!skillIds.length) return input;

  const catalog = await ctx.runQuery(internal.skills.listForUserInternal, { userId });
  const registry = SkillRegistry.fromSkills(catalog);
  const skillSystemSection = await resolveSkillSystemSection(registry, skillIds);
  return { ...input, skillSystemSection };
}

async function executeAgentPipeline(
  ctx: GenericActionCtx<DataModel>,
  input: AgentRunInput,
  goalRaw: string,
  userId: string,
  traceSink: ITraceSink,
  sessionMeta?: SessionMeta
): Promise<ReasoningEvent[]> {
  const events: ReasoningEvent[] = [];
  const sink: ITraceSink = {
    emit: async (event: ReasoningEvent) => {
      events.push(event);
      await traceSink.emit(event);
    },
  };

  let pipeline;
  try {
    pipeline = createAutonomousAgentPipeline(sink, {});
  } catch (e) {
    if (e instanceof ConvexError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new ConvexError(
      `无法初始化 Agent（Convex Dashboard 须配置 DASHSCOPE_API_KEY 等，与 Next 部署无关）: ${message}`
    );
  }

  await ctx.runMutation(internal.agent.createSession, {
    sessionId: input.sessionId,
    userId,
    goalText: goalRaw,
    conversationId: sessionMeta?.conversationId,
    runMode: sessionMeta?.runMode,
    messageId: sessionMeta?.messageId,
  });

  const enrichedInput = await enrichInputWithSkills(ctx, input, userId);

  try {
    for await (const _ of pipeline.run(enrichedInput)) {
      /* 事件已通过 traceSink */
    }
    await ctx.runMutation(internal.agent.setSessionStatus, {
      sessionId: input.sessionId,
      status: "done",
    });
  } catch (e) {
    await ctx.runMutation(internal.agent.setSessionStatus, {
      sessionId: input.sessionId,
      status: "error",
    });
    if (e instanceof ConvexError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new ConvexError(message);
  }

  return events;
}

function summarizeFromEvents(events: ReasoningEvent[]): string {
  const err = [...events].reverse().find((e) => e.type === "run_error");
  if (err && err.type === "run_error") {
    return `运行失败: ${err.payload.message}`;
  }
  const done = [...events].reverse().find((e) => e.type === "run_done");
  if (done && done.type === "run_done") {
    return done.payload.summary;
  }
  return "";
}

const runAgentInConversationArgs = {
  sessionId: v.string(),
  conversationId: v.id("conversations"),
  userMessageId: v.id("messages"),
  assistantMessageId: v.id("messages"),
  runMode: runModeValidator,
  preferences: runPreferencesValidator,
  activeSkillIds: activeSkillIdsValidator,
  enabledToolNames: v.optional(v.array(v.string())),
};

type RunAgentInConversationArgs = {
  sessionId: string;
  conversationId: Id<"conversations">;
  userMessageId: Id<"messages">;
  assistantMessageId: Id<"messages">;
  runMode?: AgentRunMode;
  preferences?: TripPreferences;
  activeSkillIds?: string[];
  enabledToolNames?: string[];
};

async function runAgentInConversationHandler(
  ctx: GenericActionCtx<DataModel>,
  args: RunAgentInConversationArgs,
  userId: string
): Promise<{ sessionId: string }> {
  const existing = await ctx.runQuery(internal.agent.getSessionById, {
    sessionId: args.sessionId,
  });
  if (existing) {
    throw new Error("该 sessionId 已存在，请刷新页面后重试。");
  }

  const conversation = await ctx.runQuery(internal.conversations.getInternal, {
    conversationId: args.conversationId,
  });
  if (!conversation || conversation.userId !== userId) {
    throw new Error("对话不存在或无权访问。");
  }

  const userMessageRow = await ctx.runQuery(internal.messages.getMessageInternal, {
    messageId: args.userMessageId,
  });
  if (
    !userMessageRow ||
    userMessageRow.conversationId !== args.conversationId ||
    userMessageRow.role !== "user"
  ) {
    throw new Error("无法找到当前用户消息或消息类型错误。");
  }

  const assistantMessageRow = await ctx.runQuery(internal.messages.getMessageInternal, {
    messageId: args.assistantMessageId,
  });
  if (
    !assistantMessageRow ||
    assistantMessageRow.conversationId !== args.conversationId ||
    assistantMessageRow.role !== "assistant"
  ) {
    throw new Error("无法找到用于回应的助手消息。");
  }

  const input = await buildAgentInputForConversation({
    ctx,
    sessionId: args.sessionId,
    conversationId: args.conversationId,
    userId,
    userMessageId: args.userMessageId,
    preferences: args.preferences ?? {},
    activeSkillIds: args.activeSkillIds,
    enabledToolNames: args.enabledToolNames,
    runMode: args.runMode,
  });

  const tripPlan =
    conversation.tripPlanMarkdown?.trim() ||
    extractTripPlanFromHistory(input.history) ||
    "";

  if (tripPlan) {
    input.contextBundle = {
      ...input.contextBundle,
      longTermMemories: input.contextBundle?.longTermMemories ?? [],
      ragChunks: input.contextBundle?.ragChunks ?? [],
      workingMemory: buildWorkingMemoryWithTripPlan(tripPlan),
    };
    if (!conversation.tripPlanMarkdown?.trim()) {
      await ctx.runMutation(internal.conversations.patchTripPlanInternal, {
        conversationId: args.conversationId,
        tripPlanMarkdown: tripPlan,
      });
    }
  }

  const resolvedMode =
    args.runMode ??
    decideRunMode({
      goalText: userMessageRow.content,
      history: input.history ?? [],
      hasExistingPlan: Boolean(tripPlan),
    });
  input.runMode = resolvedMode;

  const traceSink: ITraceSink = {
    emit: async (event: ReasoningEvent) => {
      await ctx.runMutation(internal.agent.appendTraceEvent, {
        sessionId: args.sessionId,
        eventJson: JSON.stringify(event),
      });
    },
  };

  const events = await executeAgentPipeline(
    ctx,
    input,
    userMessageRow.content,
    userId,
    traceSink,
    {
      conversationId: args.conversationId,
      runMode: resolvedMode,
      messageId: args.assistantMessageId,
    }
  );

  const summary = summarizeFromEvents(events);
  const runDone = [...events].reverse().find((e) => e.type === "run_done");
  const updatesMasterPlan =
    runDone?.type === "run_done" ? runDone.payload.updatesMasterPlan : undefined;

  if (summary) {
    await ctx.runMutation(internal.messages.patchMessageContentInternal, {
      messageId: args.assistantMessageId,
      content: summary,
    });

    if (resolvedMode === "quick_reply") {
      /* 复述/问答：不覆盖全程方案与对话级摘要 */
    } else if (updatesMasterPlan !== false && looksLikeFullItinerary(summary)) {
      await ctx.runMutation(internal.conversations.patchTripPlanInternal, {
        conversationId: args.conversationId,
        tripPlanMarkdown: summary,
      });
      await ctx.runMutation(internal.conversations.patchSummaryInternal, {
        conversationId: args.conversationId,
        summary: summary.slice(0, 2000),
      });
    } else {
      await ctx.runMutation(internal.conversations.patchSummaryInternal, {
        conversationId: args.conversationId,
        summary: summary.slice(0, 2000),
      });
    }

    await ctx.runMutation(internal.memories.extractFromTurnInternal, {
      userId,
      conversationId: args.conversationId,
      userMessage: userMessageRow.content,
      assistantReply: summary,
    });
  }

  return { sessionId: args.sessionId };
}

export const getSessionById = internalQuery({
  args: { sessionId: v.string() },
  async handler(ctx, { sessionId }) {
    return await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

export const createSession = internalMutation({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    conversationId: v.optional(v.string()),
    runMode: v.optional(
      v.union(v.literal("full_plan_execute"), v.literal("incremental_revise"), v.literal("quick_reply"))
    ),
    messageId: v.optional(v.string()),
    goalText: v.string(),
  },
  async handler(ctx, { sessionId, userId, conversationId, runMode, messageId, goalText }) {
    await ctx.db.insert("agentSessions", {
      sessionId,
      userId,
      conversationId,
      runMode,
      messageId,
      status: "running",
      goalText,
      createdAt: Date.now(),
    });
  },
});

export const appendTraceEvent = internalMutation({
  args: {
    sessionId: v.string(),
    eventJson: v.string(),
  },
  async handler(ctx, { sessionId, eventJson }) {
    const event = JSON.parse(eventJson) as ReasoningEvent;
    await ctx.db.insert("agentTraceEvents", {
      sessionId,
      seq: event.seq,
      eventJson,
    });
  },
});

export const setSessionStatus = internalMutation({
  args: {
    sessionId: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
  },
  async handler(ctx, { sessionId, status }) {
    const row = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, { status });
  },
});

export const listTraceEvents = query({
  args: { sessionId: v.string() },
  async handler(ctx, { sessionId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const session = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!session || session.userId !== identity.subject) {
      return [];
    }
    const rows = await ctx.db
      .query("agentTraceEvents")
      .withIndex("by_session_seq", (q) => q.eq("sessionId", sessionId))
      .collect();
    rows.sort((a, b) => a.seq - b.seq);
    return rows.map((r) => JSON.parse(r.eventJson) as ReasoningEvent);
  },
});

/** 由 messages.sendUserMessage 调度；无需 Clerk（mutation 已鉴权） */
export const runAgentInConversationInternal = internalAction({
  args: runAgentInConversationArgs,
  handler: async (ctx, args): Promise<{ sessionId: string }> => {
    const conversation: Doc<"conversations"> | null = await ctx.runQuery(
      internal.conversations.getInternal,
      {
        conversationId: args.conversationId,
      }
    );
    if (!conversation) {
      throw new Error("对话不存在。");
    }
    return runAgentInConversationHandler(ctx, args, conversation.userId);
  },
});

/** 对话续聊主入口（也可由前端直接调用，与 sendUserMessage 二选一） */
export const runAgentInConversation = action({
  args: runAgentInConversationArgs,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("未登录：请先通过 Clerk 登录后再运行 Agent。");
    }
    return runAgentInConversationHandler(ctx, args, identity.subject);
  },
});

export const runAgent = action({
  args: {
    sessionId: v.string(),
    goalRaw: v.string(),
    conversationId: v.optional(v.string()),
    runMode: runModeValidator,
    slots: runSlotsValidator,
    preferences: runPreferencesValidator,
    activeSkillIds: activeSkillIdsValidator,
    enabledToolNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("未登录：请先通过 Clerk 登录后再运行 Agent。");
    }

    const existing = await ctx.runQuery(internal.agent.getSessionById, {
      sessionId: args.sessionId,
    });
    if (existing) {
      throw new Error("该 sessionId 已存在，请刷新页面后重试。");
    }

    const traceSink: ITraceSink = {
      emit: async (event: ReasoningEvent) => {
        await ctx.runMutation(internal.agent.appendTraceEvent, {
          sessionId: args.sessionId,
          eventJson: JSON.stringify(event),
        });
      },
    };

    const input = buildAgentInput(args, identity.subject);
    await executeAgentPipeline(ctx, input, args.goalRaw, identity.subject, traceSink);

    return { sessionId: args.sessionId };
  },
});

function convexEvalPublicMode(): boolean {
  const v = process.env.EVAL_PUBLIC_EVAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function rawCleanEvalSecret(s: string): string {
  let t = (s ?? "").replace(/\r/g, "").replace(/^\uFEFF/, "").trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function normEvalSecret(s: string): string {
  return rawCleanEvalSecret(s).normalize("NFKC");
}

const EVAL_PUBLIC_PLACEHOLDER = "__eval_public__";

export const runAgentEval = action({
  args: {
    evalSecret: v.string(),
    sessionId: v.string(),
    goalRaw: v.string(),
    slots: runSlotsValidator,
    preferences: runPreferencesValidator,
    activeSkillIds: activeSkillIdsValidator,
  },
  handler: async (ctx, args) => {
    if (convexEvalPublicMode()) {
      if (args.evalSecret !== EVAL_PUBLIC_PLACEHOLDER) {
        throw new ConvexError(
          "已开启 EVAL_PUBLIC_EVAL：evalSecret 须为固定值 __eval_public__（由 Next /api/eval/run 注入）。"
        );
      }
    } else {
      const expected = normEvalSecret(process.env.EVAL_SERVER_SECRET ?? "");
      if (!expected || expected.length < 8) {
        throw new ConvexError(
          "Convex 未配置有效的 EVAL_SERVER_SECRET（长度至少 8）。请在 Convex Dashboard → Environment Variables 添加；或在内网联调时设置 EVAL_PUBLIC_EVAL=true。"
        );
      }
      const got = normEvalSecret(args.evalSecret);
      if (got !== expected) {
        throw new ConvexError(
          `评测密钥无效（规范化后比对）：Convex 侧长度=${expected.length}，请求侧长度=${got.length}。`
              + (expected.length !== got.length
                  ? " 两侧长度不同，说明三处未使用同一段密钥。"
                  : " 长度相同但内容不同，或 Convex 与 Next 指向了不同部署。")
              + " 请在 agent-app 目录执行 npx convex env get EVAL_SERVER_SECRET --prod（或省略 --prod）"
              + " 与 Next / Java 评测侧环境变量逐字对照；Dashboard 勿给整段加引号。改完后务必 npx convex deploy。"
        );
      }
    }

    const existing = await ctx.runQuery(internal.agent.getSessionById, {
      sessionId: args.sessionId,
    });
    if (existing) {
      throw new ConvexError("该 sessionId 已存在，请更换 sessionId 后重试。");
    }

    const collected: ReasoningEvent[] = [];
    const traceSink: ITraceSink = {
      emit: async (event: ReasoningEvent) => {
        collected.push(event);
        await ctx.runMutation(internal.agent.appendTraceEvent, {
          sessionId: args.sessionId,
          eventJson: JSON.stringify(event),
        });
      },
    };

    const evalUserId = "eval-platform";
    const input = buildAgentInput(args, evalUserId);
    const t0 = Date.now();
    await executeAgentPipeline(ctx, input, args.goalRaw, evalUserId, traceSink);
    const latencyMs = Date.now() - t0;

    const blob = JSON.stringify(collected);
    const tokenEstimate = Math.max(1, Math.round((args.goalRaw.length + blob.length) / 4));

    return {
      sessionId: args.sessionId,
      output: summarizeFromEvents(collected),
      trace_json: blob,
      latency_ms: latencyMs,
      token_estimate: tokenEstimate,
    };
  },
});
