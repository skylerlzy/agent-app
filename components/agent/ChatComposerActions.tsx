"use client";

import { ActionPopover } from "@/components/agent/ActionPopover";
import { SkillPickerContent, skillPickerBadgeCount } from "@/components/agent/SkillPicker";
import { ToolPickerContent, toolPickerBadgeCount } from "@/components/agent/ToolPicker";
import { TripPreferencesContent } from "@/components/agent/TripPreferencesPanel";
import type { ConversationPreferences } from "@/lib/conversationStorage";
import type { ToolName } from "@/lib/agent/contracts";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Brain, CalendarRange, Sparkles, Wrench } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";

type ActionId = "memory" | "skill" | "tool" | "prefs";

function ActionPill({
  active,
  disabled,
  onClick,
  icon,
  label,
  badge,
  accent,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: string;
  accent: "violet" | "amber" | "sky" | "emerald";
}) {
  const accentMap = {
    violet: {
      pill: "border-violet-500/30 bg-violet-500/[0.07] hover:border-violet-500/45 hover:bg-violet-500/12",
      active: "border-violet-500/55 bg-violet-500/15 shadow-sm shadow-violet-500/10",
      icon: "text-violet-600",
    },
    amber: {
      pill: "border-amber-500/30 bg-amber-500/[0.07] hover:border-amber-500/45 hover:bg-amber-500/12",
      active: "border-amber-500/55 bg-amber-500/15 shadow-sm shadow-amber-500/10",
      icon: "text-amber-600",
    },
    sky: {
      pill: "border-sky-500/30 bg-sky-500/[0.07] hover:border-sky-500/45 hover:bg-sky-500/12",
      active: "border-sky-500/55 bg-sky-500/15 shadow-sm shadow-sky-500/10",
      icon: "text-sky-600",
    },
    emerald: {
      pill: "border-emerald-500/30 bg-emerald-500/[0.07] hover:border-emerald-500/45 hover:bg-emerald-500/12",
      active: "border-emerald-500/55 bg-emerald-500/15 shadow-sm shadow-emerald-500/10",
      icon: "text-emerald-600",
    },
  };
  const a = accentMap[accent];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors",
        a.pill,
        active && a.active,
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <span className={cn("shrink-0", a.icon)}>{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      {badge ? (
        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export interface ChatComposerActionsProps {
  sharedKnowledgeEnabled: boolean;
  onSharedKnowledgeChange: (enabled: boolean) => void;
  activeSkillIds: string[];
  onSkillIdsChange: (ids: string[]) => void;
  enabledToolNames: ToolName[];
  onToolNamesChange: (names: ToolName[]) => void;
  preferences: ConversationPreferences;
  onPreferencesChange: (prefs: ConversationPreferences) => void;
  disabled?: boolean;
}

export function ChatComposerActions({
  sharedKnowledgeEnabled,
  onSharedKnowledgeChange,
  activeSkillIds,
  onSkillIdsChange,
  enabledToolNames,
  onToolNamesChange,
  preferences,
  onPreferencesChange,
  disabled,
}: ChatComposerActionsProps) {
  const [openId, setOpenId] = useState<ActionId | null>(null);
  const anchorRefs = useRef<Partial<Record<ActionId, HTMLDivElement | null>>>({});
  const skills = useQuery(api.skills.list);
  const catalog = useQuery(api.toolSettings.list);

  const toggle = useCallback((id: ActionId) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const close = useCallback(() => setOpenId(null), []);

  const skillCount = skillPickerBadgeCount(activeSkillIds, skills ?? undefined);
  const toolBadge = toolPickerBadgeCount(enabledToolNames, catalog ?? undefined);

  const prefCount =
    preferences.travelThemes.length +
    (preferences.pace ? 1 : 0) +
    (preferences.accommodationType ? 1 : 0) +
    (preferences.dietaryPreset ? 1 : 0) +
    preferences.transportPreferences.length +
    (preferences.travelParty ? 1 : 0) +
    (preferences.budgetCny.trim() ? 1 : 0);

  const pills: Array<{
    id: ActionId;
    accent: "violet" | "amber" | "sky" | "emerald";
    icon: ReactNode;
    label: string;
    badge?: string;
    title: string;
    width: string;
    body: ReactNode;
  }> = [
    {
      id: "memory",
      accent: "violet",
      icon: <Brain className="h-3.5 w-3.5" />,
      label: "长期记忆",
      badge: sharedKnowledgeEnabled ? "开" : "关",
      title: "共享长期记忆",
      width: "w-[min(100vw-2rem,18rem)]",
      body: (
        <>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            {sharedKnowledgeEnabled
              ? "本对话会读取其他对话沉淀的偏好与约束。"
              : "仅使用本对话抽取的记忆。"}
          </p>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={sharedKnowledgeEnabled}
            onClick={() => onSharedKnowledgeChange(!sharedKnowledgeEnabled)}
            className={cn(
              "relative h-7 w-12 rounded-full border transition-colors",
              sharedKnowledgeEnabled ? "border-violet-500/50 bg-violet-500/70" : "border-border bg-muted/60",
              disabled && "opacity-50"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-6 w-6 rounded-full bg-background shadow-sm transition-transform",
                sharedKnowledgeEnabled ? "left-[1.35rem]" : "left-0.5"
              )}
            />
          </button>
        </>
      ),
    },
    {
      id: "skill",
      accent: "amber",
      icon: <Sparkles className="h-3.5 w-3.5" />,
      label: "附加 Skill",
      badge: skillCount > 0 ? String(skillCount) : undefined,
      title: "附加 Skill",
      width: "w-[min(100vw-2rem,24rem)]",
      body: (
        <SkillPickerContent selectedIds={activeSkillIds} onChange={onSkillIdsChange} disabled={disabled} />
      ),
    },
    {
      id: "tool",
      accent: "sky",
      icon: <Wrench className="h-3.5 w-3.5" />,
      label: "本轮工具",
      badge: toolBadge,
      title: "本轮工具",
      width: "w-[min(100vw-2rem,24rem)]",
      body: (
        <ToolPickerContent
          selectedNames={enabledToolNames}
          onChange={onToolNamesChange}
          disabled={disabled}
        />
      ),
    },
    {
      id: "prefs",
      accent: "emerald",
      icon: <CalendarRange className="h-3.5 w-3.5" />,
      label: "出行偏好",
      badge: prefCount > 0 ? String(prefCount) : undefined,
      title: "出行偏好",
      width: "w-[min(100vw-2rem,26rem)]",
      body: (
        <TripPreferencesContent
          preferences={preferences}
          onChange={onPreferencesChange}
          disabled={disabled}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-nowrap gap-2">
      {pills.map((pill) => (
        <div
          key={pill.id}
          ref={(el) => {
            anchorRefs.current[pill.id] = el;
          }}
          className="relative shrink-0"
        >
          <ActionPill
            accent={pill.accent}
            active={openId === pill.id}
            disabled={disabled}
            onClick={() => toggle(pill.id)}
            icon={pill.icon}
            label={pill.label}
            badge={pill.badge}
          />
          <ActionPopover
            open={openId === pill.id}
            onClose={close}
            title={pill.title}
            width={pill.width}
            anchorEl={anchorRefs.current[pill.id] ?? null}
          >
            {pill.body}
          </ActionPopover>
        </div>
      ))}
    </div>
  );
}
