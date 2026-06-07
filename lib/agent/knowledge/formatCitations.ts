import type { KnowledgeChunk } from "../contracts";

export function formatCitations(chunks: KnowledgeChunk[]): string {
  const seen = new Set<string>();
  const citations: string[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.documentTitle}::${chunk.citation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(`[来源: ${chunk.documentTitle} · ${chunk.citation}]`);
  }

  return citations.join("\n");
}
