import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import { chunkDocument, rankKnowledgeChunks, type ScoredChunkCandidate } from "../lib/agent/knowledge";
import {
  getBuiltinKnowledgeCandidates,
  getBuiltinKnowledgeCatalog,
  getBuiltinKnowledgeDocument,
  isBuiltinKnowledgeDocumentId,
} from "../lib/agent/knowledge/builtinKnowledge";
import {
  inferKnowledgeCityFromText,
  scopeCandidatesToQueryCity,
} from "../lib/agent/knowledge/inferKnowledgeCity";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const sourceTypeValidator = v.union(v.literal("markdown"), v.literal("text"), v.literal("pdf"));

const filtersValidator = v.optional(
  v.object({
    city: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  })
);

function boundedLimit(limit: number | undefined, fallback: number, max: number): number {
  if (!limit || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const tag of tags ?? []) {
    const clean = tag.replace(/\s+/g, " ").trim().slice(0, 24);
    if (clean) seen.add(clean);
  }
  return [...seen].slice(0, 12);
}

function normalizeCity(city: string | undefined): string | undefined {
  const clean = city?.replace(/\s+/g, " ").trim().slice(0, 24);
  return clean || undefined;
}

function toPublicDocument(row: Doc<"knowledgeDocuments">) {
  return {
    id: row._id,
    userId: row.userId,
    title: row.title,
    sourceType: row.sourceType,
    tags: row.tags,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.city ? { city: row.city } : {}),
  };
}

function toCandidate(row: Doc<"knowledgeChunks">): ScoredChunkCandidate {
  return {
    chunkId: row._id,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    content: row.content,
    citation: row.citation,
    tags: row.tags,
    ...(row.city ? { city: row.city } : {}),
  };
}

async function insertChunks(
  ctx: MutationCtx,
  input: {
    userId: string;
    documentId: Id<"knowledgeDocuments">;
    title: string;
    text: string;
    city?: string;
    tags: string[];
    now: number;
  }
): Promise<number> {
  const chunks = chunkDocument(input.text, { title: input.title });
  for (const chunk of chunks) {
    await ctx.db.insert("knowledgeChunks", {
      userId: input.userId,
      documentId: input.documentId,
      documentTitle: input.title,
      content: chunk.content,
      citation: chunk.citation,
      tags: input.tags,
      chunkIndex: chunk.chunkIndex,
      createdAt: input.now,
      updatedAt: input.now,
      ...(input.city ? { city: input.city } : {}),
    });
  }
  return chunks.length;
}

async function deleteChunksForDocument(ctx: MutationCtx, documentId: Id<"knowledgeDocuments">) {
  const chunks = await ctx.db
    .query("knowledgeChunks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .take(200);
  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }
}

function mergeWithBuiltinCandidates(
  userCandidates: ScoredChunkCandidate[],
  city?: string
): ScoredChunkCandidate[] {
  const builtins = getBuiltinKnowledgeCandidates({ city });
  const seen = new Set<string>();
  const merged: ScoredChunkCandidate[] = [];
  for (const c of [...userCandidates, ...builtins]) {
    if (seen.has(c.chunkId)) continue;
    seen.add(c.chunkId);
    merged.push(c);
  }
  return merged;
}

async function retrieveForUser(
  ctx: QueryCtx,
  input: {
    userId: string;
    query: string;
    topK?: number;
    filters?: { city?: string; tags?: string[] };
  }
) {
  const queryText = input.query.trim();
  if (!queryText) return [];

  const city =
    normalizeCity(input.filters?.city) ?? inferKnowledgeCityFromText(queryText);
  const wantedTags = normalizeTags(input.filters?.tags);
  const topK = boundedLimit(input.topK, 5, 10);

  const loadCandidates = async (useCity: string | undefined) => {
    const rows = useCity
      ? await ctx.db
          .query("knowledgeChunks")
          .withIndex("by_user_city", (q) => q.eq("userId", input.userId).eq("city", useCity))
          .take(300)
      : await ctx.db
          .query("knowledgeChunks")
          .withIndex("by_user", (q) => q.eq("userId", input.userId))
          .take(300);

    return rows
      .filter((row) => {
        if (!wantedTags.length) return true;
        return wantedTags.some((tag) => row.tags.includes(tag));
      })
      .map(toCandidate);
  };

  let candidates = scopeCandidatesToQueryCity(
    queryText,
    mergeWithBuiltinCandidates(await loadCandidates(city), city)
  );
  let ranked = rankKnowledgeChunks(queryText, candidates, topK);

  // 城市过滤无命中时回退全库检索，避免「目的地≠文档 city 标签」导致 RAG 失效
  if (!ranked.length && city) {
    candidates = scopeCandidatesToQueryCity(
      queryText,
      mergeWithBuiltinCandidates(await loadCandidates(undefined), city)
    );
    ranked = rankKnowledgeChunks(queryText, candidates, topK);
  }

  return ranked;
}

export const listDocuments = query({
  args: { limit: v.optional(v.number()) },
  async handler(ctx, { limit }) {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_user_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(boundedLimit(limit, 60, 100));
    return [...getBuiltinKnowledgeCatalog(), ...rows.map(toPublicDocument)];
  },
});

export const uploadDocument = mutation({
  args: {
    title: v.string(),
    text: v.string(),
    sourceType: sourceTypeValidator,
    tags: v.optional(v.array(v.string())),
    city: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    const title = normalizeTitle(args.title) || "未命名知识文档";
    const text = args.text.trim();
    if (text.length < 20) throw new Error("文档内容太短，至少需要 20 个字符。");
    if (text.length > 600_000) throw new Error("文档内容过大，请拆分后上传。");

    const tags = normalizeTags(args.tags);
    const city = normalizeCity(args.city);
    const now = Date.now();
    const documentId = await ctx.db.insert("knowledgeDocuments", {
      userId,
      title,
      sourceType: args.sourceType,
      originalText: text,
      tags,
      chunkCount: 0,
      createdAt: now,
      updatedAt: now,
      ...(city ? { city } : {}),
    });
    const chunkCount = await insertChunks(ctx, {
      userId,
      documentId,
      title,
      text,
      city,
      tags,
      now,
    });
    await ctx.db.patch(documentId, { chunkCount, updatedAt: now });
    return { documentId, chunkCount };
  },
});

export const rebuildDocument = mutation({
  args: { documentId: v.string() },
  async handler(ctx, { documentId }) {
    if (isBuiltinKnowledgeDocumentId(documentId)) {
      throw new Error("内置知识库不可重建，请编辑您自己上传的文档。");
    }
    const userId = await requireUserId(ctx);
    const docId = documentId as Id<"knowledgeDocuments">;
    const doc = await ctx.db.get(docId);
    if (!doc || doc.userId !== userId) {
      throw new Error("知识文档不存在或无权访问。");
    }

    await deleteChunksForDocument(ctx, docId);
    const now = Date.now();
    const chunkCount = await insertChunks(ctx, {
      userId,
      documentId: docId,
      title: doc.title,
      text: doc.originalText,
      city: doc.city,
      tags: doc.tags,
      now,
    });
    await ctx.db.patch(docId, { chunkCount, updatedAt: now });
    return { documentId, chunkCount };
  },
});

export const removeDocument = mutation({
  args: { documentId: v.string() },
  async handler(ctx, { documentId }) {
    if (isBuiltinKnowledgeDocumentId(documentId)) {
      throw new Error("内置知识库不可删除。");
    }
    const userId = await requireUserId(ctx);
    const docId = documentId as Id<"knowledgeDocuments">;
    const doc = await ctx.db.get(docId);
    if (!doc || doc.userId !== userId) {
      throw new Error("知识文档不存在或无权访问。");
    }

    await deleteChunksForDocument(ctx, docId);
    await ctx.db.delete(docId);
  },
});

/** 动态更新知识：修改元数据或正文后自动重建分块索引 */
export const updateDocument = mutation({
  args: {
    documentId: v.string(),
    title: v.optional(v.string()),
    text: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    city: v.optional(v.string()),
  },
  async handler(ctx, args) {
    if (isBuiltinKnowledgeDocumentId(args.documentId)) {
      throw new Error("内置知识库不可编辑，请上传自定义攻略覆盖补充。");
    }
    const userId = await requireUserId(ctx);
    const docId = args.documentId as Id<"knowledgeDocuments">;
    const doc = await ctx.db.get(docId);
    if (!doc || doc.userId !== userId) {
      throw new Error("知识文档不存在或无权访问。");
    }

    const nextTitle = args.title !== undefined ? normalizeTitle(args.title) || doc.title : doc.title;
    const nextTags = args.tags !== undefined ? normalizeTags(args.tags) : doc.tags;
    const nextCity =
      args.city !== undefined ? normalizeCity(args.city) : doc.city;
    const nextText = args.text !== undefined ? args.text.trim() : doc.originalText;

    if (args.text !== undefined) {
      if (nextText.length < 20) throw new Error("文档内容太短，至少需要 20 个字符。");
      if (nextText.length > 600_000) throw new Error("文档内容过大，请拆分后上传。");
    }

    const now = Date.now();
    let chunkCount = doc.chunkCount;

    if (args.text !== undefined && nextText !== doc.originalText) {
      await deleteChunksForDocument(ctx, docId);
      chunkCount = await insertChunks(ctx, {
        userId,
        documentId: docId,
        title: nextTitle,
        text: nextText,
        city: nextCity,
        tags: nextTags,
        now,
      });
    }

    await ctx.db.patch(docId, {
      title: nextTitle,
      originalText: nextText,
      tags: nextTags,
      chunkCount,
      updatedAt: now,
      ...(nextCity ? { city: nextCity } : {}),
    });

    return { documentId: args.documentId, chunkCount };
  },
});

export const getDocument = query({
  args: { documentId: v.string() },
  async handler(ctx, { documentId }) {
    if (isBuiltinKnowledgeDocumentId(documentId)) {
      const builtin = getBuiltinKnowledgeDocument(documentId);
      if (!builtin) throw new Error("知识文档不存在或无权访问。");
      return builtin;
    }

    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(documentId as Id<"knowledgeDocuments">);
    if (!doc || doc.userId !== userId) {
      throw new Error("知识文档不存在或无权访问。");
    }
    return {
      ...toPublicDocument(doc),
      originalText: doc.originalText,
    };
  },
});

export const retrieve = query({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
    filters: filtersValidator,
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    return retrieveForUser(ctx, {
      userId,
      query: args.query,
      topK: boundedLimit(args.topK, 5, 10),
      filters: args.filters,
    });
  },
});

export const retrieveInternal = internalQuery({
  args: {
    userId: v.string(),
    query: v.string(),
    topK: v.optional(v.number()),
    filters: filtersValidator,
  },
  async handler(ctx, args) {
    return retrieveForUser(ctx, {
      userId: args.userId,
      query: args.query,
      topK: boundedLimit(args.topK, 5, 10),
      filters: args.filters,
    });
  },
});
