"use client";

import type { ConversationPreferences } from "@/lib/conversationStorage";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACCOMMODATION_OPTIONS,
  DIETARY_PRESET_OPTIONS,
  getPreferenceChipPalette,
  PREFERENCE_SECTION_ACCENTS,
  TRANSPORT_OPTIONS,
  TRAVEL_PARTY_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  TRAVEL_THEME_OPTIONS,
} from "@/lib/tripPreferenceOptions";
import type { ReactNode } from "react";

type SectionKey = keyof typeof PREFERENCE_SECTION_ACCENTS;

function ChipRow({
  label,
  hint,
  section,
  children,
}: {
  label: string;
  hint?: string;
  section: SectionKey;
  children: ReactNode;
}) {
  const accent = PREFERENCE_SECTION_ACCENTS[section];
  return (
    <div className="space-y-2.5">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r px-2.5 py-1",
          accent
        )}
      >
        <p className="text-xs font-bold tracking-wide">{label}</p>
        {hint ? (
          <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px] font-medium opacity-80">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  optionId,
  active,
  disabled,
  onClick,
  children,
  index = 0,
}: {
  optionId: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  index?: number;
}) {
  const palette = getPreferenceChipPalette(optionId);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: `${index * 35}ms` }}
      className={cn(
        "group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-xs font-semibold",
        "transition-all duration-200 ease-out motion-safe:animate-fade-in",
        "hover:scale-[1.05] hover:-translate-y-0.5 active:scale-[0.96]",
        active ? palette.active : palette.idle,
        active && "motion-safe:animate-chip-pop ring-2 ring-white/40",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent bg-[length:200%_100%] motion-safe:animate-chip-shine"
        />
      ) : null}
      <span
        className={cn(
          "relative text-sm leading-none transition-transform duration-200",
          "group-hover:scale-110",
          active && "motion-safe:animate-chip-emoji-wiggle"
        )}
      >
        {palette.emoji}
      </span>
      <span className="relative">{children}</span>
      {active ? (
        <span
          aria-hidden
          className="relative ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black/15 bg-white/80 text-xs font-black leading-none text-emerald-950 shadow-sm"
        >
          ✓
        </span>
      ) : null}
    </button>
  );
}

export interface TripPreferencesContentProps {
  preferences: ConversationPreferences;
  onChange: (prefs: ConversationPreferences) => void;
  disabled?: boolean;
}

export function TripPreferencesContent({ preferences, onChange, disabled }: TripPreferencesContentProps) {
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

  const selectedCount =
    preferences.travelThemes.length +
    (preferences.pace ? 1 : 0) +
    (preferences.accommodationType ? 1 : 0) +
    (preferences.dietaryPreset ? 1 : 0) +
    preferences.transportPreferences.length +
    (preferences.travelParty ? 1 : 0);

  return (
    <div className="max-h-[min(20rem,52vh)] space-y-4 overflow-y-auto pr-0.5">
      <p className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-sky-500/8 to-violet-500/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="mr-1">🎒</span>
        点选你的旅行 vibe，Agent 会按偏好安排行程
        {selectedCount > 0 ? (
          <span className="ml-1.5 font-semibold text-emerald-700">· 已选 {selectedCount} 项</span>
        ) : null}
      </p>

      <ChipRow label="旅行主题" hint="可多选" section="theme">
        {TRAVEL_THEME_OPTIONS.map((t, i) => (
          <Chip
            key={t.id}
            optionId={t.id}
            index={i}
            active={preferences.travelThemes.includes(t.id)}
            disabled={disabled}
            onClick={() => toggleInList(t.id, preferences.travelThemes)}
          >
            {t.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="旅行节奏" section="pace">
        {TRAVEL_PACE_OPTIONS.map((p, i) => (
          <Chip
            key={p.id}
            optionId={p.id}
            index={i}
            active={preferences.pace === p.id}
            disabled={disabled}
            onClick={() => patch({ pace: preferences.pace === p.id ? "" : p.id })}
          >
            {p.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="住宿类型" section="accommodation">
        {ACCOMMODATION_OPTIONS.map((a, i) => (
          <Chip
            key={a.id}
            optionId={a.id}
            index={i}
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

      <ChipRow label="饮食习惯" section="dietary">
        {DIETARY_PRESET_OPTIONS.map((d, i) => (
          <Chip
            key={d.id}
            optionId={d.id}
            index={i}
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

      <ChipRow label="交通偏好" hint="可多选" section="transport">
        {TRANSPORT_OPTIONS.map((t, i) => (
          <Chip
            key={t.id}
            optionId={t.id}
            index={i}
            active={preferences.transportPreferences.includes(t.id)}
            disabled={disabled}
            onClick={() => toggleTransport(t.id)}
          >
            {t.label}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow label="同行规模" section="party">
        {TRAVEL_PARTY_OPTIONS.map((p, i) => (
          <Chip
            key={p.id}
            optionId={p.id}
            index={i}
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

      <div className="space-y-2">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r px-2.5 py-1",
            PREFERENCE_SECTION_ACCENTS.budget
          )}
        >
          <span className="text-sm">💰</span>
          <label className="text-xs font-bold tracking-wide">人均预算（元）</label>
        </div>
        <Input
          type="number"
          min={0}
          value={preferences.budgetCny}
          onChange={(e) => patch({ budgetCny: e.target.value })}
          placeholder="如 3000 — 随便花也行 😎"
          disabled={disabled}
          className={cn(
            "h-10 rounded-2xl border-amber-500/30 bg-gradient-to-r from-amber-500/[0.06] via-yellow-500/[0.04] to-orange-500/[0.06] text-xs",
            "transition-all duration-200 hover:border-amber-500/45 focus-visible:ring-amber-500/30",
            preferences.budgetCny.trim() && "border-amber-500/50 shadow-sm shadow-amber-500/15"
          )}
        />
      </div>
    </div>
  );
}

/** @deprecated 使用 ChatComposerActions 中的出行偏好悬浮框 */
export function TripPreferencesPanel(props: TripPreferencesContentProps) {
  return <TripPreferencesContent {...props} />;
}
