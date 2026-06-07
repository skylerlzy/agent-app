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

  const paragraphs = splitParagraphs(text);
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

  return fallback.slice(0, maxChunks).map((content, i) => ({
    content,
    chunkIndex: i,
    citation: `第 ${i + 1} 段`,
  }));
}
