import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { autoTitleFromMessage } from "../lib/conversationStorage";
import { conversationIdKey } from "./conversationIds";

function sortByUpdatedAtDesc<T extends { updatedAt: number }>(items: T[]) {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getInternal = internalQuery({
  args: { conversationId: v.id("conversations") },
  async handler(ctx, { conversationId }) {
    return await ctx.db.get(conversationId);
  },
});

/** 当前用户的对话列表（含消息条数，供侧边栏展示） */
export const listByUser = query({
  args: {},
  async handler(ctx) {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const sorted = sortByUpdatedAtDesc(rows);
    return Promise.all(
      sorted.map(async (c) => {
        let messageCount = 0;
        try {
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_conversation", (q) =>
              q.eq("conversationId", conversationIdKey(c._id))
            )
            .collect();
          messageCount = messages.length;
        } catch {
          messageCount = 0;
        }
        return {
          ...c,
          messageCount,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    title: v.optional(v.string()),
  },
  async handler(ctx, { title }) {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      userId,
      title: title?.trim() || "新对话",
      sharedKnowledgeEnabled: true,
      preferencesJson: undefined,
      activeSkillIds: [],
      enabledToolNames: [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const updateTitle = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  async handler(ctx, { conversationId, title }) {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(conversationId);
    if (!row || row.userId !== userId) {
      throw new Error("对话不存在或无权访问。");
    }
    const trimmed = title.trim();
    if (!trimmed) throw new Error("标题不能为空。");
    await ctx.db.patch(conversationId, { title: trimmed, updatedAt: Date.now() });
  },
});

export const updatePreferences = mutation({
  args: {
    conversationId: v.id("conversations"),
    preferencesJson: v.optional(v.string()),
    activeSkillIds: v.optional(v.array(v.string())),
    enabledToolNames: v.optional(v.array(v.string())),
    sharedKnowledgeEnabled: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.conversationId);
    if (!row || row.userId !== userId) {
      throw new Error("对话不存在或无权访问。");
    }

    const patch: {
      updatedAt: number;
      preferencesJson?: string;
      activeSkillIds?: string[];
      enabledToolNames?: string[];
      sharedKnowledgeEnabled?: boolean;
    } = { updatedAt: Date.now() };

    if (args.preferencesJson !== undefined) {
      if (typeof args.preferencesJson !== "string") {
        throw new Error("preferencesJson 格式无效。");
      }
      patch.preferencesJson = args.preferencesJson;
    }
    if (args.activeSkillIds !== undefined) {
      patch.activeSkillIds = args.activeSkillIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0
      );
    }
    if (args.enabledToolNames !== undefined) {
      patch.enabledToolNames = args.enabledToolNames.filter(
        (name): name is string => typeof name === "string" && name.length > 0
      );
    }
    if (args.sharedKnowledgeEnabled !== undefined) {
      patch.sharedKnowledgeEnabled = args.sharedKnowledgeEnabled;
    }

    await ctx.db.patch(args.conversationId, patch);
  },
});

/** 成员3/4：全程行程 Markdown 写回 */
export const patchTripPlanInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    tripPlanMarkdown: v.string(),
  },
  async handler(ctx, { conversationId, tripPlanMarkdown }) {
    await ctx.db.patch(conversationId, {
      tripPlanMarkdown,
      updatedAt: Date.now(),
    });
  },
});

/** 成员4：摘要写回（action 内通过 internalMutation 调用） */
export const patchSummaryInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    summary: v.string(),
  },
  async handler(ctx, { conversationId, summary }) {
    await ctx.db.patch(conversationId, {
      summary,
      updatedAt: Date.now(),
    });
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id("conversations") },
  async handler(ctx, { conversationId }) {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(conversationId);
    if (!row || row.userId !== userId) {
      throw new Error("对话不存在或无权访问。");
    }

    const convKey = conversationIdKey(conversationId);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", convKey))
      .collect();
    for (const m of messages) {
      await ctx.db.delete(m._id);
    }

    try {
      const memories = await ctx.db
        .query("userMemories")
        .withIndex("by_user_sourceConversation", (q) =>
          q.eq("userId", userId).eq("sourceConversationId", convKey)
        )
        .collect();
      for (const mem of memories) {
        await ctx.db.delete(mem._id);
      }
    } catch {
      /* 记忆清理失败不阻断对话删除 */
    }

    await ctx.db.delete(conversationId);
  },
});

/** 首条用户消息时自动更新标题 */
export const maybeAutoTitleInternal = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    userMessage: v.string(),
  },
  async handler(ctx, { conversationId, userMessage }) {
    const row = await ctx.db.get(conversationId);
    if (!row || row.title !== "新对话") return;

    const userMsgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationIdKey(conversationId))
      )
      .filter((q) => q.eq(q.field("role"), "user"))
      .collect();

    if (userMsgs.length === 1) {
      await ctx.db.patch(conversationId, {
        title: autoTitleFromMessage(userMessage),
        updatedAt: Date.now(),
      });
    }
  },
});
