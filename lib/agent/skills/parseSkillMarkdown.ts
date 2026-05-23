/** Anthropic SKILL.md frontmatter 解析结果 */
export interface ParsedSkillMarkdown {
  name: string;
  description: string;
  tags: string[];
  /** frontmatter 之后的正文 */
  body: string;
  /** 原始全文 */
  markdownBody: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatterValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return trimmed
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseFrontmatterBlock(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    out[m[1]!.toLowerCase()] = parseFrontmatterValue(m[2] ?? "");
  }
  return out;
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * 解析 SKILL.md：提取 YAML frontmatter 的 name / description / tags 与正文。
 */
export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const trimmed = markdown.replace(/^\uFEFF/, "").trim();
  const match = trimmed.match(FRONTMATTER_RE);

  if (!match) {
    const firstLine = trimmed.split("\n")[0]?.replace(/^#\s*/, "").trim() || "custom-skill";
    return {
      name: slugFromTitle(firstLine) || "custom-skill",
      description: firstLine.slice(0, 200),
      tags: [],
      body: trimmed,
      markdownBody: trimmed,
    };
  }

  const meta = parseFrontmatterBlock(match[1] ?? "");
  const body = (match[2] ?? "").trim();
  const name = meta.name?.trim() || slugFromTitle(body.split("\n")[0]?.replace(/^#\s*/, "") ?? "") || "custom-skill";
  const description =
    meta.description?.trim() ||
    body
      .split("\n")
      .find((l) => l.trim() && !l.startsWith("#"))
      ?.trim()
      .slice(0, 240) ||
    name;

  return {
    name,
    description,
    tags: parseTags(meta.tags),
    body,
    markdownBody: trimmed,
  };
}
