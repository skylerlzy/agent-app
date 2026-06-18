import type { AgentRunInput, IToolRegistry, ToolName } from "../contracts";
import {
  extractFoodFromPoiSearch,
  extractRestaurantsFromAllPoiLogs,
} from "./buildFromToolLogs";
import { resolveSkillTripHints } from "./skillTripContext";
import { getCanonicalDestination } from "./tripContext";
import type { ToolLogEntry } from "./tripContext";

const MIN_FOOD_POIS = 3;
const MAX_SUPPLEMENT_CALLS = 4;

function foodPoiCount(logs: ToolLogEntry[], destination?: string): number {
  const fromFood = extractFoodFromPoiSearch(logs, { destination });
  const fromAll = extractRestaurantsFromAllPoiLogs(logs, { destination });
  const seen = new Set<string>();
  for (const item of [...fromFood, ...fromAll]) {
    if (item.name?.trim()) seen.add(item.name);
  }
  return seen.size;
}

function poiSearchAlreadyRan(logs: ToolLogEntry[], keywords: string): boolean {
  const needle = keywords.trim().slice(0, 12);
  return logs.some((log) => {
    if (log.toolName !== "poi_search") return false;
    try {
      const data = JSON.parse(log.summary) as { keywords?: string };
      return typeof data.keywords === "string" && data.keywords.includes(needle);
    } catch {
      return log.summary.includes(needle);
    }
  });
}

/** 根据目的地、饮食偏好与 Skill 生成餐饮 poi_search 关键词列表 */
export function resolveFoodPoiKeywords(input: AgentRunInput): string[] {
  const dest = getCanonicalDestination(input)?.replace(/市$/u, "") ?? "当地";
  const hints = resolveSkillTripHints(input);
  const dietary = input.context.preferences.dietaryPreset;

  const keywords: string[] = [];

  for (const kw of hints.foodKeywords) {
    if (!keywords.includes(kw)) keywords.push(kw);
  }

  if (dietary === "halal") {
    keywords.push(`${dest} 清真餐厅`, `${dest} 清真美食`);
  } else if (dietary === "vegetarian") {
    keywords.push(`${dest} 素食餐厅`, `${dest} 素食友好`);
  } else if (dietary === "local") {
    keywords.push(`${dest} 本地特色菜 老字号`, `${dest} 特色小吃`);
  } else {
    keywords.push(`${dest} 特色美食 老字号餐厅`, `${dest} 本地菜馆`);
  }

  keywords.push(`${dest} 人气餐厅`);

  return [...new Set(keywords)].slice(0, MAX_SUPPLEMENT_CALLS + 2);
}

/**
 * 执行阶段结束后、总结前：若餐饮 POI 不足，自动补调 poi_search。
 * 保证饮食与预算章节有真实店名，而非仅模板文案。
 */
export async function supplementTripToolLogs(
  registry: IToolRegistry,
  input: AgentRunInput,
  toolLogs: ToolLogEntry[]
): Promise<{ logs: ToolLogEntry[]; supplemented: string[] }> {
  const dest = getCanonicalDestination(input);
  if (!dest) return { logs: toolLogs, supplemented: [] };

  if (foodPoiCount(toolLogs, dest) >= MIN_FOOD_POIS) {
    return { logs: toolLogs, supplemented: [] };
  }

  const tool = registry.get("poi_search");
  if (!tool) return { logs: toolLogs, supplemented: [] };

  const newLogs = [...toolLogs];
  const supplemented: string[] = [];

  for (const keywords of resolveFoodPoiKeywords(input)) {
    if (foodPoiCount(newLogs, dest) >= MIN_FOOD_POIS) break;
    if (poiSearchAlreadyRan(newLogs, keywords)) continue;
    if (supplemented.length >= MAX_SUPPLEMENT_CALLS) break;

    try {
      const result = await tool.execute(
        { city: dest, keywords },
        {
          userId: input.context.userId,
          stepId: `supplement_food_${supplemented.length + 1}`,
          userContext: input.context,
        }
      );
      if (!result.ok || !result.data) continue;

      newLogs.push({
        stepId: `supplement_food_${supplemented.length + 1}`,
        toolName: "poi_search" as ToolName,
        summary: JSON.stringify(result.data),
      });
      supplemented.push(keywords);
    } catch {
      /* 单条补调失败不影响总结 */
    }
  }

  return { logs: newLogs, supplemented };
}
