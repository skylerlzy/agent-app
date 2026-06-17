import type { ScoredChunkCandidate } from "./retrieve";
import { embedTexts } from "./embeddings";
import { getBuiltinKnowledgeCandidates } from "./builtinKnowledge";

const cache = new Map<string, number[]>();
let hydratePromise: Promise<void> | null = null;

async function hydrateBuiltinEmbeddings(candidates: ScoredChunkCandidate[]): Promise<void> {
  const missing = candidates.filter((c) => !cache.has(c.chunkId));
  if (!missing.length) return;

  const texts = missing.map((c) =>
    [c.documentTitle, c.content, c.citation].filter(Boolean).join("\n").slice(0, 2000)
  );
  const vectors = await embedTexts(texts, "document");
  if (!vectors.length) return;

  missing.forEach((c, i) => {
    const vec = vectors[i];
    if (vec?.length) cache.set(c.chunkId, vec);
  });
}

/**
 * 为内置攻略分块补齐向量（进程内缓存，冷启动时批量 embed 一次）。
 */
export async function attachBuiltinEmbeddings(
  candidates: ScoredChunkCandidate[],
  opts?: { city?: string }
): Promise<ScoredChunkCandidate[]> {
  const builtins = getBuiltinKnowledgeCandidates(opts);
  if (!builtins.length) return candidates;

  if (!hydratePromise) {
    hydratePromise = hydrateBuiltinEmbeddings(builtins).catch(() => {
      hydratePromise = null;
    });
  }
  await hydratePromise;

  const enrichedBuiltins = builtins.map((c) => ({
    ...c,
    ...(cache.get(c.chunkId) ? { embedding: cache.get(c.chunkId) } : {}),
  }));

  const seen = new Set<string>();
  const merged: ScoredChunkCandidate[] = [];
  for (const c of [...candidates, ...enrichedBuiltins]) {
    if (seen.has(c.chunkId)) continue;
    seen.add(c.chunkId);
    merged.push(c);
  }
  return merged;
}

/** 测试用：清空缓存 */
export function resetBuiltinEmbeddingCacheForTests(): void {
  cache.clear();
  hydratePromise = null;
}
