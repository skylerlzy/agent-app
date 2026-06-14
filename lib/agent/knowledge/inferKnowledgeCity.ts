import type { ScoredChunkCandidate } from "./retrieve";
import { inferCityFromText } from "../tools/ToolArgumentValidator";

/** 内置知识库已覆盖的目的地（与 builtinKnowledge 中 city 字段一致，不含「市」） */
const KNOWN_KNOWLEDGE_CITIES = [
  "珠海",
  "南京",
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "成都",
  "重庆",
  "西安",
  "厦门",
  "苏州",
] as const;

/**
 * 从用户问题推断 RAG 城市（支持「珠海美食」等无「市」后缀写法）。
 * 返回与 knowledgeChunks.city / 内置文档 city 一致的短名，如「珠海」「南京」。
 */
export function inferKnowledgeCityFromText(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;

  const withSuffix = inferCityFromText(t);
  if (withSuffix) return withSuffix.replace(/市$/u, "");

  for (const city of KNOWN_KNOWLEDGE_CITIES) {
    if (t.includes(city)) return city;
  }
  return undefined;
}

/** 问题中已明确城市时，剔除其它城市的知识块，保留通用（无 city）与目标城 */
export function scopeCandidatesToQueryCity(
  query: string,
  candidates: ScoredChunkCandidate[]
): ScoredChunkCandidate[] {
  const qCity = inferKnowledgeCityFromText(query);
  if (!qCity) return candidates;

  return candidates.filter((c) => {
    if (!c.city) return true;
    const docCity = c.city.replace(/市$/u, "");
    return docCity === qCity;
  });
}
