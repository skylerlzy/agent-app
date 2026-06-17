import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./authHelpers";
import {
  attachBuiltinEmbeddings,
  chunkDocument,
  embedQuery,
  embedTexts,
  hybridRankKnowledgeChunks,
  inferKnowledgeCityFromText,
  scopeCandidatesToQueryCity,
} from "../lib/agent/knowledge";
import type { ScoredChunkCandidate } from "../lib/agent/knowledge";
import {
  BUILTIN_KNOWLEDGE_USER_ID,
  getBuiltinKnowledgeCatalog,
  getBuiltinKnowledgeDocument,
  isBuiltinKnowledgeDocumentId,
  verifyBuiltinKnowledgeBundle,
} from "../lib/agent/knowledge/builtinKnowledge";

const filtersValidator = v.optional(
  v.object({
    city: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  })
);

const MAX_TEXT_CHARS = 120_000;
const MIN_TEXT_CHARS = 20;
const MAX_USER_DOCS = 80;

function boundedLimit(limit: number | undefined, fallback: number, max: number): number {
  if (!limit || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

function normalizeCity(city: string | undefined): string | undefined {
  const clean = city?.replace(/\s+/g, " ").trim().slice(0, 24);
  return clean || undefined;
}

function rowToPublicDocument(row: Doc<"knowledgeDocuments">) {
  return {
    id: row._id,
    userId: row.userId,
    title: row.title,
    sourceType: row.sourceType,
    tags: row.tags,
    chunkCount: row.chunkCount,
    embeddingStatus: row.embeddingStatus ?? ("pending" as const),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isBuiltin: false as const,
    ...(row.city ? { city: row.city } : {}),
  };
}

function chunkRowToCandidate(row: Doc<"knowledgeChunks">): ScoredChunkCandidate {
  return {
    chunkId: row._id,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    content: row.content,
    citation: row.citation,
    tags: row.tags,
    ...(row.city ? { city: row.city } : {}),
    ...(row.embedding?.length ? { embedding: row.embedding } : {}),
  };
}

/** 内置 + 用户文档目录 */
export const listDocuments = query({
  args: { limit: v.optional(v.number()) },
  async handler(ctx, { limit }) {
    const userId = await requireUserId(ctx);
    const builtin = getBuiltinKnowledgeCatalog();
    const userRows = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_USER_DOCS);
    const userDocs = userRows.map(rowToPublicDocument);
    const merged = [...userDocs, ...builtin];
    return merged.slice(0, boundedLimit(limit, merged.length, 200));
  },
});

export const getDocument = query({
  args: { documentId: v.string() },
  async handler(ctx, { documentId }) {
    const userId = await requireUserId(ctx);
    if (isBuiltinKnowledgeDocumentId(documentId)) {
      const builtin = getBuiltinKnowledgeDocument(documentId);
      if (!builtin) throw new ConvexError("知识文档不存在。");
      return builtin;
    }

    const row = await ctx.db.get(documentId as Id<"knowledgeDocuments">);
    if (!row || row.userId !== userId) throw new ConvexError("知识文档不存在。");
    return {
      ...rowToPublicDocument(row),
      originalText: row.originalText,
    };
  },
});

export const uploadText = mutation({
  args: {
    title: v.string(),
    text: v.string(),
    city: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sourceType: v.optional(v.union(v.literal("markdown"), v.literal("text"))),
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    const title = args.title.trim().slice(0, 120);
    const text = args.text.trim();
    if (!title) throw new ConvexError("标题不能为空。");
    if (text.length < MIN_TEXT_CHARS) throw new ConvexError("正文过短，请至少 20 字。");
    if (text.length > MAX_TEXT_CHARS) throw new ConvexError("正文过长，请控制在 12 万字以内。");

    const existingCount = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existingCount.length >= MAX_USER_DOCS) {
      throw new ConvexError(`最多上传 ${MAX_USER_DOCS} 份用户文档，请先删除旧文档。`);
    }

    const city =
      normalizeCity(args.city) ??
      inferKnowledgeCityFromText(`${title}\n${text.slice(0, 400)}`);
    const tags = (args.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12);
    const chunks = chunkDocument(text, { title, maxChars: 850 });
    const now = Date.now();

    const docId = await ctx.db.insert("knowledgeDocuments", {
      userId,
      title,
      sourceType: args.sourceType ?? "markdown",
      originalText: text,
      tags,
      city,
      chunkCount: chunks.length,
      embeddingStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });

    for (const chunk of chunks) {
      await ctx.db.insert("knowledgeChunks", {
        userId,
        documentId: docId,
        documentTitle: title,
        content: chunk.content,
        citation: chunk.citation,
        tags,
        city,
        chunkIndex: chunk.chunkIndex,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.knowledge.embedDocumentChunksInternal, {
      documentId: docId,
      userId,
    });

    return docId;
  },
});

export const deleteDocument = mutation({
  args: { documentId: v.id("knowledgeDocuments") },
  async handler(ctx, { documentId }) {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(documentId);
    if (!row || row.userId !== userId) throw new ConvexError("知识文档不存在。");

    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
    await ctx.db.delete(documentId);
    return { ok: true as const };
  },
});

export const retrieveHybrid = action({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
    filters: filtersValidator,
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("未登录");

    const queryText = args.query.trim();
    if (!queryText) return { chunks: [], mode: "keyword" as const };

    const city =
      normalizeCity(args.filters?.city) ?? inferKnowledgeCityFromText(queryText);
    const queryEmbedding = await embedQuery(queryText);
    const topK = boundedLimit(args.topK, 2, 10);

    const userCandidates = await ctx.runQuery(internal.knowledge.listCandidatesInternal, {
      userId: identity.subject,
      city,
      tags: args.filters?.tags,
    });

    let candidates = await attachBuiltinEmbeddings(userCandidates, { city });
    candidates = scopeCandidatesToQueryCity(queryText, candidates);

    if (!candidates.length && city) {
      candidates = scopeCandidatesToQueryCity(
        queryText,
        await attachBuiltinEmbeddings(userCandidates, { city })
      );
    }

    return hybridRankKnowledgeChunks(queryText, candidates, topK, queryEmbedding);
  },
});

/** Agent action 用：用户分块 + 内置由 attachBuiltinEmbeddings 合并 */
export const listCandidatesInternal = internalQuery({
  args: {
    userId: v.string(),
    city: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  async handler(ctx, args) {
    const city = normalizeCity(args.city);
    const tagSet = args.tags?.length ? new Set(args.tags) : null;

    let rows: Doc<"knowledgeChunks">[];
    if (city) {
      const cityRows = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_user_city", (q) => q.eq("userId", args.userId).eq("city", city))
        .take(400);
      const generalRows = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .filter((q) => q.eq(q.field("city"), undefined))
        .take(200);
      rows = [...cityRows, ...generalRows];
    } else {
      rows = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .take(500);
    }

    const seen = new Set<string>();
    const candidates: ScoredChunkCandidate[] = [];
    for (const row of rows) {
      if (seen.has(row._id)) continue;
      if (tagSet && !row.tags.some((t) => tagSet.has(t))) continue;
      seen.add(row._id);
      candidates.push(chunkRowToCandidate(row));
    }
    return candidates;
  },
});

export const listChunksForDocumentInternal = internalQuery({
  args: {
    documentId: v.id("knowledgeDocuments"),
    userId: v.string(),
  },
  async handler(ctx, args) {
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== args.userId) return [];
    const rows = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    return rows.sort((a, b) => a.chunkIndex - b.chunkIndex);
  },
});

export const patchDocumentEmbeddingStatusInternal = internalMutation({
  args: {
    documentId: v.id("knowledgeDocuments"),
    userId: v.string(),
    embeddingStatus: v.union(v.literal("ready"), v.literal("failed")),
  },
  async handler(ctx, args) {
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== args.userId) return;
    await ctx.db.patch(args.documentId, {
      embeddingStatus: args.embeddingStatus,
      updatedAt: Date.now(),
    });
  },
});

export const patchChunkEmbeddingsInternal = internalMutation({
  args: {
    updates: v.array(
      v.object({
        chunkId: v.id("knowledgeChunks"),
        embedding: v.array(v.float64()),
      })
    ),
  },
  async handler(ctx, { updates }) {
    const now = Date.now();
    for (const item of updates) {
      await ctx.db.patch(item.chunkId, {
        embedding: item.embedding,
        updatedAt: now,
      });
    }
  },
});

export const embedDocumentChunksInternal = internalAction({
  args: {
    documentId: v.id("knowledgeDocuments"),
    userId: v.string(),
  },
  async handler(ctx, args) {
    const rows = await ctx.runQuery(internal.knowledge.listChunksForDocumentInternal, args);
    if (!rows.length) {
      await ctx.runMutation(internal.knowledge.patchDocumentEmbeddingStatusInternal, {
        documentId: args.documentId,
        userId: args.userId,
        embeddingStatus: "failed",
      });
      return;
    }

    try {
      const texts = rows.map((row) =>
        [row.documentTitle, row.content, row.citation].filter(Boolean).join("\n").slice(0, 2000)
      );
      const vectors = await embedTexts(texts, "document");
      if (vectors.length !== rows.length) {
        throw new Error("embedding count mismatch");
      }

      await ctx.runMutation(internal.knowledge.patchChunkEmbeddingsInternal, {
        updates: rows.map((row, i) => ({
          chunkId: row._id,
          embedding: vectors[i]!,
        })),
      });
      await ctx.runMutation(internal.knowledge.patchDocumentEmbeddingStatusInternal, {
        documentId: args.documentId,
        userId: args.userId,
        embeddingStatus: "ready",
      });
    } catch {
      await ctx.runMutation(internal.knowledge.patchDocumentEmbeddingStatusInternal, {
        documentId: args.documentId,
        userId: args.userId,
        embeddingStatus: "failed",
      });
    }
  },
});

/** 校验内置知识包完整性（本地 JSON，无需联网） */
export const builtinBundleStatus = query({
  args: {},
  async handler(ctx) {
    await requireUserId(ctx);
    return verifyBuiltinKnowledgeBundle();
  },
});
