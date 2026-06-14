import type { KnowledgeChunk } from "../contracts";
import { formatCitations } from "./formatCitations";

const CITATION_MARKER = /\[来源:\s*[^\]]+·[^\]]+\]/;

/** 若已引用 RAG 片段但 LLM 未写出处，追加标准 [来源: …] 区块 */
export function ensureKnowledgeCitations(
  text: string,
  chunks: KnowledgeChunk[] | undefined,
  opts?: { sectionHeading?: string }
): string {
  const body = text.trim();
  if (!body || !chunks?.length) return body;

  if (CITATION_MARKER.test(body)) return body;

  const citations = formatCitations(chunks);
  if (!citations) return body;

  const heading = opts?.sectionHeading ?? "**参考来源**";
  return `${body}\n\n${heading}\n\n${citations}`;
}
