import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./authHelpers";
import { conversationIdKey } from "./conversationIds";
import {
  activeSkillIdsValidator,
  runModeValidator,
  runPreferencesValidator,
} from "./runValidators";

function sortByCreatedAt<T extends { createdAt: number }>(items: T[]) {
  return [...items].sort((a, b) => a.createdAt - b.createdAt);
}

export const listRowsForConversationInternal = internalQuery({
  args: { conversationId: v.id("conversations") },
  async handler(ctx, { conversationId }) {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationIdKey(conversationId))
      )
      .collect();
    return sortByCreatedAt(rows);
  },
});

export const getMessageInternal = internalQuery({
  args: { messageId: v.id("messages") },
  async handler(ctx, { messageId }) {
    return await ctx.db.get(messageId);
  },
});

/** 分页消息列表（当前返回全部，后续可加 cursor） */
export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  async handler(ctx, { conversationId, limit }) {
    const userId = await requireUserId(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return [];
    }

    const rows = sortByCreatedAt(
      await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationIdKey(conversationId))
        )
        .collect()
    );

    const capped = limit && limit > 0 ? rows.slice(-limit) : rows;

    return Promise.all(
      capped.map(async (m) => {
        let sessionStatus: "running" | "done" | "error" | undefined;
        if (m.role === "assistant" && m.runSessionId) {
          const session = await ctx.db
            .query("agentSessions")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", m.runSessionId!))
            .unique();
          sessionStatus = session?.status;
        }
        return { ...m, sessionStatus };
      })
    );
  },
});

export const patchMessageContentInternal = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  async handler(ctx, { messageId, content }) {
    await ctx.db.patch(messageId, { content });
  },
});

/**
 * 写入 user 消息 + assistant 占位，并调度 runAgentInConversation。
 * 返回 sessionId 供前端订阅 trace。
 */
export const sendUserMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    preferences: runPreferencesValidator,
    activeSkillIds: activeSkillIdsValidator,
    enabledToolNames: v.optional(v.array(v.string())),
    runMode: runModeValidator,
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("对话不存在或无权访问。");
    }

    const text = args.content.trim();
    if (!text) throw new Error("消息内容不能为空。");

    const now = Date.now();
    const sessionId = crypto.randomUUID();

    const userMessageId = await ctx.db.insert("messages", {
      conversationId: conversationIdKey(args.conversationId),
      role: "user",
      content: text,
      createdAt: now,
    });

    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: conversationIdKey(args.conversationId),
      role: "assistant",
      content: "",
      runSessionId: sessionId,
      createdAt: now + 1,
    });

    await ctx.db.patch(args.conversationId, { updatedAt: now });

    await ctx.scheduler.runAfter(0, internal.agent.runAgentInConversationInternal, {
      sessionId,
      conversationId: args.conversationId,
      userMessageId,
      assistantMessageId,
      preferences: args.preferences,
      activeSkillIds: args.activeSkillIds,
      enabledToolNames: args.enabledToolNames,
      runMode: args.runMode,
    });

    await ctx.runMutation(internal.conversations.maybeAutoTitleInternal, {
      conversationId: args.conversationId,
      userMessage: text,
    });

    return { sessionId, userMessageId, assistantMessageId };
  },
});
