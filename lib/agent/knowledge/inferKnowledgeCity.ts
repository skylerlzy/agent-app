import type { ScoredChunkCandidate } from "./retrieve";
import { inferCityFromText } from "../tools/ToolArgumentValidator";
import { KNOWN_KNOWLEDGE_CITY_NAMES } from "./chinaTier12Catalog";

/**
 * 从用户问题推断 RAG 城市（与内置知识库 city 字段一致，不含「市」）。
 */
export function inferKnowledgeCityFromText(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;

  const withSuffix = inferCityFromText(t);
  if (withSuffix) return withSuffix.replace(/市$/u, "");

  for (const city of KNOWN_KNOWLEDGE_CITY_NAMES) {
    if (t.includes(city)) return city;
  }
  return undefined;
}

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
