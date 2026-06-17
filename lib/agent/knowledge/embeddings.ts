import { agentDebug } from "../debugLog";
import { fetchWithTimeout } from "../http/fetchWithTimeout";
import { resolveLLMConfig } from "../llm/resolveLLMEnv";

export type EmbeddingTextType = "query" | "document";

const DEFAULT_MODEL = "text-embedding-v3";
const BATCH_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 45_000;

function readEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
}

function readTimeoutMs(): number {
  const raw = process.env.EMBEDDING_HTTP_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5_000 ? n : DEFAULT_TIMEOUT_MS;
}

function isEmbeddingEnabled(): boolean {
  const flag = process.env.RAG_EMBEDDING_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim());
}

function embeddingEndpoint(baseURL: string): string {
  const normalized = baseURL.replace(/\/+$/, "");
  return `${normalized}/embeddings`;
}

/** L2 归一化，便于余弦相似度用点积计算 */
export function normalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!norm || !Number.isFinite(norm)) return vec;
  return vec.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

async function embedBatch(
  texts: string[],
  textType: EmbeddingTextType
): Promise<number[][]> {
  const cfg = resolveLLMConfig();
  const model = readEmbeddingModel();
  const timeoutMs = readTimeoutMs();
  const endpoint = embeddingEndpoint(cfg.baseURL);

  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: texts,
        encoding_format: "float",
      }),
    },
    timeoutMs,
    "Embedding API 请求超时",
    `dashscope:embedding:${textType}`
  );

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Embedding API ${res.status}: ${raw.slice(0, 400)}`);
  }

  let parsed: { data?: Array<{ embedding?: number[]; index?: number }> };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`Embedding API 返回非 JSON: ${raw.slice(0, 200)}`);
  }

  const rows = parsed.data ?? [];
  if (!rows.length) throw new Error("Embedding API 未返回向量");

  const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((row, i) => normalizeVector(row.embedding ?? [])).filter((v) => v.length > 0);
}

/**
 * 调用 DashScope OpenAI 兼容 Embeddings 接口。
 * 无 API Key 或 RAG_EMBEDDING_ENABLED=false 时返回空数组（调用方降级为关键词检索）。
 */
export async function embedTexts(
  texts: string[],
  textType: EmbeddingTextType = "document"
): Promise<number[][]> {
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!cleaned.length) return [];
  if (!isEmbeddingEnabled()) {
    agentDebug("[agent-rag] embedding skipped: no DASHSCOPE_API_KEY or RAG_EMBEDDING_ENABLED=false");
    return [];
  }

  const results: number[][] = [];
  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch, textType);
    if (vectors.length !== batch.length) {
      throw new Error(`Embedding 批次数量不匹配：期望 ${batch.length}，得到 ${vectors.length}`);
    }
    results.push(...vectors);
  }
  return results;
}

export async function embedQuery(text: string): Promise<number[] | undefined> {
  const [vec] = await embedTexts([text], "query");
  return vec?.length ? vec : undefined;
}

export function isRagEmbeddingAvailable(): boolean {
  return isEmbeddingEnabled();
}
