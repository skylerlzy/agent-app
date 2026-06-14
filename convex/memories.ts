import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { conversationIdKey } from "./conversationIds";
import { extractMemoryCandidates, type MemoryKind } from "../lib/agent/knowledge";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const memoryKindValidator = v.union(
  v.literal("preference"),
  v.literal("fact"),
  v.literal("constraint"),
  v.literal("other")
);

function boundedLimit(limit: number | undefined, fallback: number, max: number): number {
  if (!limit || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function toPublicMemory(row: Doc<"userMemories">) {
  return {
    id: row._id,
    userId: row.userId,
    kind: row.kind,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.sourceConversationId ? { sourceConversationId: row.sourceConversationId } : {}),
  };
}

async function assertConversationOwner(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  userId: string
) {
  const row = await ctx.db.get(conversationId);
  if (!row || row.userId !== userId) {
    throw new Error("对话不存在或无权访问。");
  }
}

export const list = query({
  args: {
    kind: v.optional(memoryKindValidator),
    limit: v.optional(v.number()),
  },
  async handler(ctx, { kind, limit }) {
    const userId = await requireUserId(ctx);
    const take = boundedLimit(limit, 80, 120);
    const rows = kind
      ? await ctx.db
          .query("userMemories")
          .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
          .take(take)
      : await ctx.db
          .query("userMemories")
          .withIndex("by_user_updatedAt", (q) => q.eq("userId", userId))
          .order("desc")
          .take(take);

    return rows.sort((a, b) => b.updatedAt - a.updatedAt).map(toPublicMemory);
  },
});

export const create = mutation({
  args: {
    kind: memoryKindValidator,
    content: v.string(),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    const content = normalizeContent(args.content);
    if (!content) throw new Error("记忆内容不能为空。");
    if (content.length > 500) throw new Error("单条记忆最多 500 字。");

    if (args.sourceConversationId) {
      await assertConversationOwner(ctx, args.sourceConversationId, userId);
    }

    const now = Date.now();
    const insert = {
      userId,
      kind: args.kind,
      content,
      createdAt: now,
      updatedAt: now,
      ...(args.sourceConversationId
        ? { sourceConversationId: conversationIdKey(args.sourceConversationId) }
        : {}),
    };
    const id = await ctx.db.insert("userMemories", insert);
    return id;
  },
});

export const update = mutation({
  args: {
    memoryId: v.id("userMemories"),
    kind: v.optional(memoryKindValidator),
    content: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.memoryId);
    if (!row || row.userId !== userId) {
      throw new Error("记忆不存在或无权访问。");
    }

    const patch: Partial<Pick<Doc<"userMemories">, "kind" | "content" | "updatedAt">> = {
      updatedAt: Date.now(),
    };
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.content !== undefined) {
      const content = normalizeContent(args.content);
      if (!content) throw new Error("记忆内容不能为空。");
      if (content.length > 500) throw new Error("单条记忆最多 500 字。");
      patch.content = content;
    }
    await ctx.db.patch(args.memoryId, patch);
  },
});

export const remove = mutation({
  args: { memoryId: v.id("userMemories") },
  async handler(ctx, { memoryId }) {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(memoryId);
    if (!row || row.userId !== userId) {
      throw new Error("记忆不存在或无权访问。");
    }
    await ctx.db.delete(memoryId);
  },
});

export const listLongTermMemoriesInternal = internalQuery({
  args: {
    userId: v.string(),
    conversationId: v.optional(v.id("conversations")),
    sharedKnowledgeEnabled: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const take = boundedLimit(args.limit, 12, 30);
    const shared = args.sharedKnowledgeEnabled ?? true;

    const rows = shared
      ? await ctx.db
          .query("userMemories")
          .withIndex("by_user_updatedAt", (q) => q.eq("userId", args.userId))
          .order("desc")
          .take(take)
      : args.conversationId
        ? await ctx.db
            .query("userMemories")
            .withIndex("by_user_sourceConversation", (q) =>
              q
                .eq("userId", args.userId)
                .eq("sourceConversationId", conversationIdKey(args.conversationId!))
            )
            .take(take)
        : [];

    return rows.sort((a, b) => b.updatedAt - a.updatedAt).map(toPublicMemory);
  },
});

export const extractFromTurnInternal = internalMutation({
  args: {
    userId: v.string(),
    conversationId: v.id("conversations"),
    userMessage: v.string(),
    assistantReply: v.string(),
  },
  async handler(ctx, args) {
    const candidates = extractMemoryCandidates({
      userMessage: args.userMessage,
      assistantReply: args.assistantReply,
    });
    if (!candidates.length) return [];

    const existing = await ctx.db
      .query("userMemories")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(200);
    const existingContent = new Set(existing.map((m) => normalizeContent(m.content)));

    const now = Date.now();
    const created: Array<ReturnType<typeof toPublicMemory>> = [];
    for (const candidate of candidates) {
      const content = normalizeContent(candidate.content);
      if (!content || existingContent.has(content)) continue;
      const id = await ctx.db.insert("userMemories", {
        userId: args.userId,
        kind: candidate.kind as MemoryKind,
        content,
        sourceConversationId: conversationIdKey(args.conversationId),
        createdAt: now,
        updatedAt: now,
      });
      const row = await ctx.db.get(id);
      if (row) created.push(toPublicMemory(row));
      existingContent.add(content);
    }

    return created;
  },
});
