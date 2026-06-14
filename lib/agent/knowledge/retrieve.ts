import type { AgentContextBundle, KnowledgeChunk, UserMemory } from "../contracts";
import { formatCitations } from "./formatCitations";
import { inferKnowledgeCityFromText } from "./inferKnowledgeCity";

export interface ScoredChunkCandidate {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  citation: string;
  tags?: string[];
  city?: string;
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:()[\]{}"'`~@#$%^&*_+=|\\/<>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTerms(query: string): string[] {
  const normalized = normalize(query);
  const terms = new Set<string>();

  for (const word of normalized.split(/\s+/).filter(Boolean)) {
    if (word.length >= 2) terms.add(word);
    if (/[\u4e00-\u9fa5]{3,}/.test(word)) {
      for (let i = 0; i < word.length - 1; i += 1) {
        terms.add(word.slice(i, i + 2));
      }
    }
  }

  return [...terms].slice(0, 40);
}

export function scoreKnowledgeChunk(
  query: string,
  candidate: ScoredChunkCandidate,
  opts?: { queryCity?: string }
): number {
  const terms = extractTerms(query);
  if (!terms.length) return 0;

  const haystack = normalize(
    [
      candidate.documentTitle,
      candidate.content,
      candidate.citation,
      candidate.city ?? "",
      ...(candidate.tags ?? []),
    ].join(" ")
  );

  let score = 0;
  for (const term of terms) {
    const firstHit = haystack.indexOf(term);
    if (firstHit < 0) continue;
    score += term.length >= 4 ? 3 : 1;
    if (firstHit < 240) score += 0.5;
  }

  const queryCity = opts?.queryCity ?? inferKnowledgeCityFromText(query);
  if (queryCity && candidate.city) {
    const docCity = candidate.city.replace(/市$/u, "");
    if (docCity === queryCity) score += 4;
    else score *= 0.15;
  }

  return score;
}

export function rankKnowledgeChunks(
  query: string,
  candidates: ScoredChunkCandidate[],
  topK = 5
): KnowledgeChunk[] {
  const limit = Math.max(1, Math.min(Math.floor(topK), 10));
  const queryCity = inferKnowledgeCityFromText(query);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreKnowledgeChunk(query, candidate, { queryCity }),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate) => ({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentTitle: candidate.documentTitle,
      content: candidate.content,
      citation: candidate.citation,
      score: Number(candidate.score.toFixed(2)),
    }));
}

export function formatLongTermMemories(memories: UserMemory[], limit = 8): string {
  const picked = memories.slice(0, Math.max(0, limit));
  if (!picked.length) return "";
  return [
    "【长期记忆】",
    ...picked.map((m, i) => `${i + 1}. ${m.kind}: ${m.content}`),
  ].join("\n");
}

export function formatRagChunks(chunks: KnowledgeChunk[], limit = 5): string {
  const picked = chunks.slice(0, Math.max(0, limit));
  if (!picked.length) return "";
  return [
    "【RAG 知识片段】",
    ...picked.map((c, i) =>
      [
        `${i + 1}. ${c.documentTitle} · ${c.citation} · score=${c.score}`,
        c.content,
        `[来源: ${c.documentTitle} · ${c.citation}]`,
      ].join("\n")
    ),
  ].join("\n\n");
}

export function formatAgentKnowledgeContext(bundle?: AgentContextBundle): string {
  if (!bundle) return "";
  const sections = [
    formatLongTermMemories(bundle.longTermMemories ?? []),
    formatRagChunks(bundle.ragChunks ?? []),
  ].filter(Boolean);
  if (!sections.length) return "";
  const citations = formatCitations(bundle.ragChunks ?? []);
  return [...sections, citations ? `【可用出处标记】\n${citations}` : ""]
    .filter(Boolean)
    .join("\n\n");
}
