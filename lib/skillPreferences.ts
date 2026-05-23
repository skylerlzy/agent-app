const STORAGE_KEY = "agent-app.builtin-skills-enabled.v1";

export type BuiltinSkillEnabledMap = Record<string, boolean>;

export function loadBuiltinSkillEnabled(): BuiltinSkillEnabledMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BuiltinSkillEnabledMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBuiltinSkillEnabled(map: BuiltinSkillEnabledMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** 内置 Skill 默认启用 */
export function isBuiltinSkillEnabled(skillId: string, map?: BuiltinSkillEnabledMap): boolean {
  const m = map ?? loadBuiltinSkillEnabled();
  return m[skillId] !== false;
}

export function setBuiltinSkillEnabled(skillId: string, enabled: boolean): BuiltinSkillEnabledMap {
  const next = { ...loadBuiltinSkillEnabled(), [skillId]: enabled };
  saveBuiltinSkillEnabled(next);
  return next;
}
