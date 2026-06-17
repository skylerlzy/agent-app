import { chunkDocument } from "./chunkDocument";
import type { ScoredChunkCandidate } from "./retrieve";
import { KNOWN_KNOWLEDGE_CITY_NAMES } from "./chinaTier12Catalog";
import builtinData from "./data/builtin-wikivoyage.json";

export { KNOWN_KNOWLEDGE_CITY_NAMES };

/** 与内置 Skill 一致，标识系统预置知识 */
export const BUILTIN_KNOWLEDGE_USER_ID = "__builtin__";

export interface BuiltinKnowledgeDefinition {
  id: string;
  title: string;
  city?: string;
  tags: string[];
  text: string;
  sourceUrl?: string;
  tier?: number;
}

type BuiltinJsonDoc = {
  id: string;
  title: string;
  city?: string;
  tags: string[];
  text: string;
  sourceUrl?: string;
  tier?: number;
};

export const BUILTIN_KNOWLEDGE_DEFINITIONS: BuiltinKnowledgeDefinition[] = (
  builtinData as { documents: BuiltinJsonDoc[] }
).documents.map((doc) => ({
  id: doc.id,
  title: doc.title,
  tags: doc.tags,
  text: doc.text,
  ...(doc.city ? { city: doc.city } : {}),
  ...(doc.sourceUrl ? { sourceUrl: doc.sourceUrl } : {}),
  ...(doc.tier !== undefined ? { tier: doc.tier } : {}),
}));

export const BUILTIN_KNOWLEDGE_SOURCE = (builtinData as { source?: string }).source;

const NOW = 1700000000000;

let cachedCandidates: ScoredChunkCandidate[] | null = null;

function buildCachedCandidates(): ScoredChunkCandidate[] {
  if (cachedCandidates) return cachedCandidates;
  const all: ScoredChunkCandidate[] = [];
  for (const doc of BUILTIN_KNOWLEDGE_DEFINITIONS) {
    const chunks = chunkDocument(doc.text, { title: doc.title, maxChars: 850 });
    for (const chunk of chunks) {
      all.push({
        chunkId: `${doc.id}:${chunk.chunkIndex}`,
        documentId: doc.id,
        documentTitle: doc.title,
        content: chunk.content,
        citation: chunk.citation,
        tags: doc.tags,
        ...(doc.city ? { city: doc.city } : {}),
      });
    }
  }
  cachedCandidates = all;
  return all;
}

/** 内置知识分块，供 RAG 检索 */
export function getBuiltinKnowledgeCandidates(opts?: { city?: string }): ScoredChunkCandidate[] {
  const all = buildCachedCandidates();
  const city = opts?.city?.trim();
  if (!city) return all;

  const citySpecific = all.filter((c) => c.city === city);
  const general = all.filter((c) => !c.city);
  if (citySpecific.length) return [...citySpecific, ...general];
  return all;
}

export function getBuiltinKnowledgeCatalog() {
  return BUILTIN_KNOWLEDGE_DEFINITIONS.map((doc) => ({
    id: doc.id,
    userId: BUILTIN_KNOWLEDGE_USER_ID,
    title: doc.title,
    sourceType: "markdown" as const,
    tags: doc.tags,
    chunkCount: chunkDocument(doc.text, { title: doc.title, maxChars: 850 }).length,
    embeddingStatus: "ready" as const,
    createdAt: NOW,
    updatedAt: NOW,
    isBuiltin: true as const,
    ...(doc.city ? { city: doc.city } : {}),
    ...(doc.sourceUrl ? { sourceUrl: doc.sourceUrl } : {}),
  }));
}

export function getBuiltinKnowledgeDocument(id: string) {
  const doc = BUILTIN_KNOWLEDGE_DEFINITIONS.find((d) => d.id === id);
  if (!doc) return null;
  return {
    ...getBuiltinKnowledgeCatalog().find((d) => d.id === id)!,
    originalText: doc.text,
  };
}

export function isBuiltinKnowledgeDocumentId(id: string): boolean {
  return id.startsWith("builtin:");
}

/** 使分块缓存失效（开发时热更新用） */
export function resetBuiltinKnowledgeCache(): void {
  cachedCandidates = null;
}

export const EXPECTED_BUILTIN_DOCUMENT_COUNT = 55;

/** 启动时校验内置 JSON 是否完整打包在仓库内 */
export function verifyBuiltinKnowledgeBundle(): {
  ok: boolean;
  documentCount: number;
  message: string;
  offlineReady: boolean;
} {
  const count = BUILTIN_KNOWLEDGE_DEFINITIONS.length;
  const meta = builtinData as { documentCount?: number };
  const emptyDocs = BUILTIN_KNOWLEDGE_DEFINITIONS.filter((d) => !d.text.trim());

  if (count !== EXPECTED_BUILTIN_DOCUMENT_COUNT) {
    return {
      ok: false,
      documentCount: count,
      message: `内置文档数量应为 ${EXPECTED_BUILTIN_DOCUMENT_COUNT}，当前为 ${count}`,
      offlineReady: false,
    };
  }
  if (meta.documentCount !== EXPECTED_BUILTIN_DOCUMENT_COUNT) {
    return {
      ok: false,
      documentCount: count,
      message: `builtin-wikivoyage.json 元数据 documentCount 与实体内容不一致`,
      offlineReady: false,
    };
  }
  if (emptyDocs.length) {
    return {
      ok: false,
      documentCount: count,
      message: `存在 ${emptyDocs.length} 份空文档`,
      offlineReady: false,
    };
  }

  return {
    ok: true,
    documentCount: count,
    message: `内置 ${count} 份出行指南已随项目打包，关键词检索无需联网`,
    offlineReady: true,
  };
}
