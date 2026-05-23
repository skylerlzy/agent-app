import type { AgentSkill, ISkillRegistry, ResolvedSkill } from "../contracts";
import { buildSkillSystemSection } from "./buildSkillSystemSection";
import { getBuiltinSkills } from "./builtinSkills";

function skillPromptBody(skill: AgentSkill): string {
  const fmEnd = skill.markdownBody.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return fmEnd ? skill.markdownBody.slice(fmEnd[0].length).trim() : skill.markdownBody.trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,，。！？；;:：/|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * ISkillRegistry 内存实现：合并内置与用户 Skill，供 action 与单测使用。
 */
export class SkillRegistry implements ISkillRegistry {
  constructor(private readonly catalog: AgentSkill[]) {}

  static fromSkills(skills: AgentSkill[]): SkillRegistry {
    return new SkillRegistry(skills);
  }

  static withUserSkills(userSkills: AgentSkill[]): SkillRegistry {
    const builtins = getBuiltinSkills();
    const byId = new Map<string, AgentSkill>();
    for (const s of builtins) byId.set(s.id, s);
    for (const s of userSkills) byId.set(s.id, s);
    return new SkillRegistry([...byId.values()]);
  }

  async listForUser(userId: string): Promise<AgentSkill[]> {
    const builtins = getBuiltinSkills();
    const userRows = this.catalog.filter((s) => s.userId === userId && !s.isBuiltin);
    return [...builtins, ...userRows].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async resolve(skillIds: string[]): Promise<ResolvedSkill[]> {
    if (!skillIds.length) return [];
    const byId = new Map(this.catalog.map((s) => [s.id, s]));
    const resolved: ResolvedSkill[] = [];
    for (const id of skillIds) {
      const skill = byId.get(id);
      if (!skill || !skill.enabled) continue;
      resolved.push({
        skillId: skill.id,
        name: skill.name,
        promptSection: skillPromptBody(skill),
      });
    }
    return resolved;
  }

  async matchSkills(input: {
    userId: string;
    goalText: string;
    tags?: string[];
    limit?: number;
  }): Promise<string[]> {
    const limit = input.limit ?? 2;
    const available = (await this.listForUser(input.userId)).filter((s) => s.enabled);
    const goalTokens = new Set(tokenize(input.goalText));
    const extraTags = new Set((input.tags ?? []).map((t) => t.toLowerCase()));

    const scored = available.map((skill) => {
      let score = 0;
      for (const tag of skill.tags) {
        const t = tag.toLowerCase();
        if (extraTags.has(t)) score += 3;
        if ([...goalTokens].some((g) => g.includes(t) || t.includes(g))) score += 2;
      }
      for (const token of goalTokens) {
        if (skill.name.toLowerCase().includes(token)) score += 2;
        if (skill.description.toLowerCase().includes(token)) score += 1;
      }
      return { skill, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.skill.id);
  }
}

export { buildSkillSystemSection };

/** 便捷：解析 id 列表并生成 system 段 */
export async function resolveSkillSystemSection(
  registry: ISkillRegistry,
  skillIds: string[]
): Promise<string> {
  const resolved = await registry.resolve(skillIds);
  return buildSkillSystemSection(resolved);
}
