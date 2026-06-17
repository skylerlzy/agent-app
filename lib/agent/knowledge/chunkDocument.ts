export interface DocumentChunk {
  content: string;
  chunkIndex: number;
  citation: string;
}

export interface ChunkDocumentOptions {
  title: string;
  maxChars?: number;
  overlapChars?: number;
  maxChunks?: number;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(text: string): string[] {
  return normalizeText(text)
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** 按 Markdown 标题切段，保留标题作为下文上下文 */
function splitByMarkdownHeadings(text: string): string[] {
  const normalized = normalizeText(text);
  const parts = normalized.split(/(?=^#{1,3}\s+)/m).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return splitParagraphs(text);

  const sections: string[] = [];
  let headingStack = "";

  for (const part of parts) {
    const headingMatch = part.match(/^(#{1,3}\s+.+?)(?:\n|$)/);
    if (headingMatch) {
      headingStack = headingMatch[1].trim();
      const body = part.slice(headingMatch[0].length).trim();
      if (body) sections.push(`${headingStack}\n\n${body}`);
      else sections.push(headingStack);
      continue;
    }
    sections.push(headingStack ? `${headingStack}\n\n${part}` : part);
  }

  return sections.filter(Boolean);
}

function takeWithOverlap(text: string, maxChars: number, overlapChars: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const end = Math.min(text.length, cursor + maxChars);
    chunks.push(text.slice(cursor, end).trim());
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return chunks.filter(Boolean);
}

export function chunkDocument(text: string, options: ChunkDocumentOptions): DocumentChunk[] {
  const maxChars = Math.max(300, Math.min(options.maxChars ?? 900, 1800));
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? 120, Math.floor(maxChars / 3)));
  const maxChunks = Math.max(1, Math.min(options.maxChunks ?? 80, 120));

  const paragraphs = splitByMarkdownHeadings(text);
  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (buffer.trim()) {
        chunks.push(buffer.trim());
        buffer = "";
      }
      chunks.push(...takeWithOverlap(paragraph, maxChars, overlapChars));
      continue;
    }

    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars && buffer.trim()) {
      chunks.push(buffer.trim());
      buffer = paragraph;
    } else {
      buffer = next;
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());
  const fallback = chunks.length ? chunks : takeWithOverlap(normalizeText(text), maxChars, overlapChars);

  return fallback.slice(0, maxChunks).map((content, i) => {
    const heading = content.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
    return {
      content,
      chunkIndex: i,
      citation: heading ? `章节「${heading.slice(0, 24)}」` : `第 ${i + 1} 段`,
    };
  });
}
