"use client";

import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { AgentSkill } from "@/lib/agent/contracts";
import { cn } from "@/lib/utils";
import {
  isBuiltinSkillEnabled,
  loadBuiltinSkillEnabled,
} from "@/lib/skillPreferences";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

export interface SkillPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

function isSkillAvailable(skill: AgentSkill, builtinMap: Record<string, boolean>): boolean {
  if (skill.isBuiltin) return isBuiltinSkillEnabled(skill.id, builtinMap);
  return skill.enabled;
}

export function SkillPicker({ selectedIds, onChange, disabled }: SkillPickerProps) {
  const skills = useQuery(api.skills.list);
  const [open, setOpen] = useState(false);
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

  if (skills === undefined) return null;
  if (available.length === 0) return null;

  const selectedCount = selectedIds.filter((id) => available.some((s) => s.id === id)).length;

  return (
    <div className="rounded-xl border border-border/60 bg-background/50">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          附加 Skill
          {selectedCount > 0 ? (
            <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {selectedCount}
            </span>
          ) : (
            <span className="text-[10px] font-normal text-muted-foreground">（可选）</span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="border-t border-border/50 px-3 pb-3 pt-2">
          <p className="mb-2 text-[11px] text-muted-foreground">
            勾选后本轮规划与总结将遵循对应 Skill 规则。
          </p>
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
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
                      : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-muted/40",
                    disabled && "pointer-events-none opacity-50"
                  )}
                >
                  {skill.isBuiltin ? "🧭 " : ""}
                  {skill.name.replace(/-/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
