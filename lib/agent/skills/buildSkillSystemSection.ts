import type { ResolvedSkill } from "../contracts";

const DEFAULT_MAX_CHARS = 6000;

/**
 * 将已解析 Skill 格式化为注入 LLM system 段的统一文本。
 * 成员4 compose() 或 action 在 run 前调用。
 */
export function buildSkillSystemSection(
  skills: ResolvedSkill[],
  opts?: { maxChars?: number }
): string {
  if (!skills.length) return "";

  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const header =
    "【用户附加 Skill 指引】以下规则优先级高于一般出行建议；规划、工具步骤选择与最终总结须严格遵循：\n";

  const sections: string[] = [];
  let used = header.length;

  for (const skill of skills) {
    const block = `\n### Skill: ${skill.name}\n${skill.promptSection.trim()}\n`;
    if (used + block.length > maxChars) {
      const remaining = maxChars - used - 80;
      if (remaining > 200) {
        sections.push(`\n### Skill: ${skill.name}\n${skill.promptSection.trim().slice(0, remaining)}…\n`);
      }
      sections.push("\n（其余 Skill 正文因 token 预算已截断。）\n");
      break;
    }
    sections.push(block);
    used += block.length;
  }

  return header + sections.join("");
}
