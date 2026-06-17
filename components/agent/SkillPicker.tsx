"use client";

import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { AgentSkill } from "@/lib/agent/contracts";
import { cn } from "@/lib/utils";
import { isBuiltinSkillEnabled, loadBuiltinSkillEnabled } from "@/lib/skillPreferences";

export interface SkillPickerContentProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

function isSkillAvailable(skill: AgentSkill, builtinMap: Record<string, boolean>): boolean {
  if (skill.isBuiltin) return isBuiltinSkillEnabled(skill.id, builtinMap);
  return skill.enabled;
}

export function SkillPickerContent({ selectedIds, onChange, disabled }: SkillPickerContentProps) {
  const skills = useQuery(api.skills.list);
  const [builtinMap, setBuiltinMap] = useState(loadBuiltinSkillEnabled);

  useEffect(() => {
    const onStorage = () => setBuiltinMap(loadBuiltinSkillEnabled());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const available = useMemo(() => {
    if (!skills) return [];
    return skills.filter((s) => isSkillAvailable(s, builtinMap));
  }, [skills, builtinMap]);

  const toggle = useCallback(
    (id: string) => {
      if (disabled) return;
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [disabled, onChange, selectedIds]
  );

  if (skills === undefined) {
    return <p className="text-xs text-muted-foreground">加载 Skill…</p>;
  }
  if (available.length === 0) {
    return <p className="text-xs text-muted-foreground">暂无可用 Skill</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">勾选后本轮规划与总结将遵循对应 Skill 规则。</p>
      <div className="flex flex-wrap gap-2">
        {available.map((skill) => {
          const active = selectedIds.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(skill.id)}
              title={skill.description}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-900 shadow-sm"
                  : "border-border/80 bg-background/80 text-muted-foreground hover:border-amber-500/30 hover:bg-amber-500/[0.06]",
                disabled && "pointer-events-none opacity-50"
              )}
            >
              {skill.isBuiltin ? "✦ " : ""}
              {skill.name.replace(/-/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function skillPickerBadgeCount(selectedIds: string[], skills: AgentSkill[] | undefined): number {
  if (!skills) return 0;
  return selectedIds.filter((id) => skills.some((s) => s.id === id)).length;
}
