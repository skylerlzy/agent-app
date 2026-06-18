import type { AgentRunInput } from "../contracts";

const COUPLE_SKILL_IDS = ["builtin:couple-romantic-travel"];
const COUPLE_SKILL_NAMES = ["couple-romantic-travel"];
const FAMILY_SKILL_IDS = ["builtin:family-slow-travel"];
const FAMILY_SKILL_NAMES = ["family-slow-travel"];

export interface SkillTripHints {
  isCoupleRomantic: boolean;
  isFamilySlow: boolean;
  /** 餐饮 poi_search 优先关键词 */
  foodKeywords: string[];
  /** 若 skill 要求且用户未指定 pace，建议默认节奏 */
  suggestedPace?: "slow" | "balanced";
  requiresSkillMoments: boolean;
  activeSkillLabels: string[];
}

function skillSectionMentions(section: string | undefined, patterns: RegExp[]): boolean {
  if (!section?.trim()) return false;
  return patterns.some((re) => re.test(section));
}

function idsMatch(activeIds: string[] | undefined, candidates: string[]): boolean {
  if (!activeIds?.length) return false;
  return activeIds.some(
    (id) =>
      candidates.includes(id) ||
      candidates.some((c) => id.endsWith(c.replace(/^builtin:/, "")) || id.includes(c))
  );
}

/** 从 activeSkillIds 与 skillSystemSection 解析本轮 Skill 对行程生成的通用约束 */
export function resolveSkillTripHints(input: AgentRunInput): SkillTripHints {
  const section = input.skillSystemSection ?? "";
  const ids = input.activeSkillIds ?? [];
  const party = input.context.preferences.travelParty;

  const isCoupleRomantic =
    idsMatch(ids, [...COUPLE_SKILL_IDS, ...COUPLE_SKILL_NAMES]) ||
    skillSectionMentions(section, [/couple-romantic-travel/i, /情侣甜蜜出行/, /情侣浪漫/, /二人世界/]) ||
    (party === "couple" &&
      skillSectionMentions(section, [/浪漫/, /golden hour/, /黄金三刻/]));

  const isFamilySlow =
    idsMatch(ids, [...FAMILY_SKILL_IDS, ...FAMILY_SKILL_NAMES]) ||
    skillSectionMentions(section, [/family-slow-travel/i, /亲子慢游/, /带娃/]);

  const foodKeywords: string[] = [];
  const activeSkillLabels: string[] = [];

  if (isCoupleRomantic) {
    activeSkillLabels.push("情侣浪漫出行");
    foodKeywords.push(
      "景观餐厅 河景餐位",
      "浪漫餐厅 夜景",
      "情侣 特色餐厅"
    );
  }
  if (isFamilySlow) {
    activeSkillLabels.push("亲子慢游");
    foodKeywords.push("亲子餐厅 家庭友好", "儿童友好 餐厅");
  }

  const dest = input.context.preferences.destination?.replace(/市$/u, "") ?? "";
  if (dest && foodKeywords.length === 0) {
    foodKeywords.push(`${dest} 特色美食 老字号`);
  }

  return {
    isCoupleRomantic,
    isFamilySlow,
    foodKeywords,
    suggestedPace: isCoupleRomantic || isFamilySlow ? "slow" : undefined,
    requiresSkillMoments: isCoupleRomantic || isFamilySlow,
    activeSkillLabels,
  };
}

export function skillMomentSectionTitle(hints: SkillTripHints): string {
  if (hints.isCoupleRomantic) return "情侣浪漫时刻";
  if (hints.isFamilySlow) return "亲子/家庭友好提示";
  return hints.activeSkillLabels[0] ?? "专属体验亮点";
}
