import type { KnowledgeChunk } from "../contracts";
import { cosineSimilarity } from "./embeddings";
import { rankKnowledgeChunks, type ScoredChunkCandidate } from "./retrieve";

export type RetrievalMode = "keyword" | "hybrid";

const RRF_K = 60;
const VECTOR_CANDIDATE_POOL = 24;
const KEYWORD_CANDIDATE_POOL = 24;
const MIN_VECTOR_SIMILARITY = 0.12;

function reciprocalRankFusion(
  rankedLists: KnowledgeChunk[][],
  topK: number,
  candidateMap: Map<string, ScoredChunkCandidate>
): KnowledgeChunk[] {
  const fused = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((item, rank) => {
      const rrf = 1 / (RRF_K + rank + 1);
      fused.set(item.chunkId, (fused.get(item.chunkId) ?? 0) + rrf);
    });
  }

  return [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([chunkId, score]) => {
      const c = candidateMap.get(chunkId)!;
      return {
        chunkId: c.chunkId,
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        content: c.content,
        citation: c.citation,
        score: Number(score.toFixed(4)),
      };
    });
}

function rankByVector(
  queryEmbedding: number[],
  candidates: ScoredChunkCandidate[],
  pool: number
): KnowledgeChunk[] {
  return candidates
    .filter((c) => c.embedding?.length)
    .map((c) => ({
      candidate: c,
      similarity: cosineSimilarity(queryEmbedding, c.embedding!),
    }))
    .filter((x) => x.similarity >= MIN_VECTOR_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, pool)
    .map(({ candidate, similarity }) => ({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentTitle: candidate.documentTitle,
      content: candidate.content,
      citation: candidate.citation,
      score: Number(similarity.toFixed(4)),
    }));
}

/**
 * 混合检索：关键词打分 + 向量相似度，经 RRF 融合排序。
 * 无 queryEmbedding 或候选无向量时自动降级为纯关键词。
 */
export function hybridRankKnowledgeChunks(
  query: string,
  candidates: ScoredChunkCandidate[],
  topK = 5,
  queryEmbedding?: number[]
): { chunks: KnowledgeChunk[]; mode: RetrievalMode } {
  const limit = Math.max(1, Math.min(Math.floor(topK), 10));
  const candidateMap = new Map(candidates.map((c) => [c.chunkId, c]));

  const keywordRanked = rankKnowledgeChunks(
    query,
    candidates,
    Math.min(KEYWORD_CANDIDATE_POOL, candidates.length)
  );

  const hasVectors =
    Boolean(queryEmbedding?.length) &&
    candidates.some((c) => c.embedding && c.embedding.length > 0);

  if (!hasVectors || !queryEmbedding?.length) {
    return { chunks: keywordRanked.slice(0, limit), mode: "keyword" };
  }

  const vectorRanked = rankByVector(
    queryEmbedding,
    candidates,
    Math.min(VECTOR_CANDIDATE_POOL, candidates.length)
  );

  if (!vectorRanked.length) {
    return { chunks: keywordRanked.slice(0, limit), mode: "keyword" };
  }

  const fused = reciprocalRankFusion([keywordRanked, vectorRanked], limit, candidateMap);
  return { chunks: fused, mode: "hybrid" };
}
