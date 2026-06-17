export { chunkDocument } from "./chunkDocument";
export type { DocumentChunk, ChunkDocumentOptions } from "./chunkDocument";
export type { MemoryCandidate, MemoryKind } from "./extractMemories";
export { extractMemoryCandidates } from "./extractMemories";
export { extractMemoryCandidatesWithLLM } from "./extractMemoriesLLM";
export {
  BUILTIN_KNOWLEDGE_USER_ID,
  BUILTIN_KNOWLEDGE_DEFINITIONS,
  BUILTIN_KNOWLEDGE_SOURCE,
  getBuiltinKnowledgeCandidates,
  getBuiltinKnowledgeCatalog,
  getBuiltinKnowledgeDocument,
  isBuiltinKnowledgeDocumentId,
  KNOWN_KNOWLEDGE_CITY_NAMES,
  verifyBuiltinKnowledgeBundle,
  EXPECTED_BUILTIN_DOCUMENT_COUNT,
} from "./builtinKnowledge";
export { CHINA_TIER12_WIKIVOYAGE } from "./chinaTier12Catalog";
export { ensureKnowledgeCitations } from "./ensureKnowledgeCitations";
export { formatCitations } from "./formatCitations";
export {
  inferKnowledgeCityFromText,
  scopeCandidatesToQueryCity,
} from "./inferKnowledgeCity";
export { buildRagQuery } from "./shouldRetrieveKnowledge";
export { KnowledgeService } from "./KnowledgeService";
export type { KnowledgeServiceStore } from "./KnowledgeService";
export {
  formatAgentKnowledgeContext,
  formatLongTermMemories,
  formatRagChunks,
  rankKnowledgeChunks,
  scoreKnowledgeChunk,
} from "./retrieve";
export type { ScoredChunkCandidate } from "./retrieve";
export {
  embedTexts,
  embedQuery,
  cosineSimilarity,
  isRagEmbeddingAvailable,
  normalizeVector,
} from "./embeddings";
export type { EmbeddingTextType } from "./embeddings";
export { hybridRankKnowledgeChunks } from "./hybridRetrieve";
export type { RetrievalMode } from "./hybridRetrieve";
export { attachBuiltinEmbeddings, resetBuiltinEmbeddingCacheForTests } from "./builtinEmbeddingCache";
