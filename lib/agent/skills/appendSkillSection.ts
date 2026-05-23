/** 将 Skill system 段追加到 base system prompt */
export function appendSkillSection(baseSystem: string, skillSection?: string): string {
  const section = skillSection?.trim();
  if (!section) return baseSystem;
  return `${baseSystem.trim()}\n\n${section}`;
}
