"use client";

import type { ConversationPreferences } from "@/lib/conversationStorage";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ACCOMMODATION_OPTIONS,
  DIETARY_PRESET_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PARTY_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  TRAVEL_THEME_OPTIONS,
} from "@/lib/tripPreferenceOptions";
import { CalendarRange, ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";

function ChipRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
          : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-muted/40",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      {children}
    </button>
  );
}

export interface TripPreferencesPanelProps {
  preferences: ConversationPreferences;
  onChange: (prefs: ConversationPreferences) => void;
  disabled?: boolean;
}

export function TripPreferencesPanel({ preferences, onChange, disabled }: TripPreferencesPanelProps) {
  const [open, setOpen] = useState(false);

  const patch = (partial: Partial<ConversationPreferences>) => {
    onChange({ ...preferences, ...partial });
  };

  const toggleInList = (id: string, list: string[]) => {
    patch({
      travelThemes: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    });
  };

  const toggleTransport = (id: string) => {
    const list = preferences.transportPreferences;
    patch({
      transportPreferences: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    });
  };

  return (
    <div className="shrink-0 rounded-xl border border-border/60 bg-muted/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
      >
        <span className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" strokeWidth={1.75} />
          出行偏好（日期、主题、预算等）
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open ? (
        <div className="max-h-[min(20rem,40vh)] space-y-4 overflow-y-auto border-t border-border/50 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">开始日期</label>
              <Input
                type="date"
                value={preferences.tripStart}
                onChange={(e) => patch({ tripStart: e.target.value })}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">结束日期</label>
              <Input
                type="date"
                value={preferences.tripEnd}
                onChange={(e) => patch({ tripEnd: e.target.value })}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <ChipRow label="旅行主题" hint="可多选">
            {TRAVEL_THEME_OPTIONS.map((t) => (
              <Chip
                key={t.id}
                active={preferences.travelThemes.includes(t.id)}
                disabled={disabled}
                onClick={() => toggleInList(t.id, preferences.travelThemes)}
              >
                {t.label}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="旅行节奏">
            {TRAVEL_PACE_OPTIONS.map((p) => (
              <Chip
                key={p.id}
                active={preferences.pace === p.id}
                disabled={disabled}
                onClick={() => patch({ pace: preferences.pace === p.id ? "" : p.id })}
              >
                {p.label}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="住宿类型">
            {ACCOMMODATION_OPTIONS.map((a) => (
              <Chip
                key={a.id}
                active={preferences.accommodationType === a.id}
                disabled={disabled}
                onClick={() =>
                  patch({
                    accommodationType:
                      preferences.accommodationType === a.id ? "" : (a.id as ConversationPreferences["accommodationType"]),
                  })
                }
              >
                {a.label}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="饮食习惯">
            {DIETARY_PRESET_OPTIONS.map((d) => (
              <Chip
                key={d.id}
                active={preferences.dietaryPreset === d.id}
                disabled={disabled}
                onClick={() =>
                  patch({
                    dietaryPreset:
                      preferences.dietaryPreset === d.id ? "" : (d.id as ConversationPreferences["dietaryPreset"]),
                  })
                }
              >
                {d.label}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="交通偏好" hint="可多选">
            {TRANSPORT_OPTIONS.map((t) => (
              <Chip
                key={t.id}
                active={preferences.transportPreferences.includes(t.id)}
                disabled={disabled}
                onClick={() => toggleTransport(t.id)}
              >
                {t.label}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow label="同行规模">
            {TRAVEL_PARTY_OPTIONS.map((p) => (
              <Chip
                key={p.id}
                active={preferences.travelParty === p.id}
                disabled={disabled}
                onClick={() =>
                  patch({
                    travelParty: preferences.travelParty === p.id ? "" : (p.id as ConversationPreferences["travelParty"]),
                  })
                }
              >
                {p.label}
              </Chip>
            ))}
          </ChipRow>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">人均预算（元）</label>
              <Input
                type="number"
                min={0}
                value={preferences.budgetCny}
                onChange={(e) => patch({ budgetCny: e.target.value })}
                placeholder="如 3000"
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">饮食补充</label>
              <Input
                value={preferences.dietaryNotes}
                onChange={(e) => patch({ dietaryNotes: e.target.value })}
                placeholder="过敏、忌口等"
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">备注与特别要求</label>
            <Textarea
              value={preferences.additionalNotes}
              onChange={(e) => patch({ additionalNotes: e.target.value })}
              placeholder="带老人小孩、必去某博物馆等"
              className="min-h-[72px] resize-y text-xs"
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
