"use client";

import type { ConversationPreferences } from "@/lib/conversationStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CalendarRange, MapPin, Sparkles } from "lucide-react";

export interface TripSetupPanelProps {
  preferences: ConversationPreferences;
  onChange: (prefs: ConversationPreferences) => void;
  onConfirm: () => void;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  /** 初始确认 vs 中途修改 */
  mode?: "initial" | "edit";
  confirmLabel?: string;
}

export function isTripSetupComplete(prefs: ConversationPreferences): boolean {
  return Boolean(
    prefs.origin.trim() && prefs.destination.trim() && prefs.tripStart.trim() && prefs.tripEnd.trim()
  );
}

export function formatTripDateRange(start: string, end: string): string {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return "";
  if (s && e) return s === e ? s : `${s} ～ ${e}`;
  return s || e;
}

export function formatTripRoute(origin: string, destination: string): string {
  const o = origin.trim();
  const d = destination.trim();
  if (o && d) return `${o} → ${d}`;
  return o || d;
}

export type TripCoreFields = Pick<ConversationPreferences, "origin" | "destination" | "tripStart" | "tripEnd">;

export function tripCoreFieldsChanged(a: TripCoreFields, b: TripCoreFields): boolean {
  return (
    a.origin.trim() !== b.origin.trim() ||
    a.destination.trim() !== b.destination.trim() ||
    a.tripStart.trim() !== b.tripStart.trim() ||
    a.tripEnd.trim() !== b.tripEnd.trim()
  );
}

export function TripSetupPanel({
  preferences,
  onChange,
  onConfirm,
  error,
  disabled,
  className,
  mode = "initial",
  confirmLabel,
}: TripSetupPanelProps) {
  const patch = (partial: Partial<ConversationPreferences>) => {
    onChange({ ...preferences, ...partial });
  };

  const ready = isTripSetupComplete(preferences);

  return (
    <div
      className={cn(
        mode === "initial"
          ? "mx-auto w-full max-w-md rounded-2xl border border-primary/25 bg-gradient-to-br from-card/95 via-emerald-500/[0.06] to-voyage-sky/[0.07] p-6 shadow-xl shadow-voyage-sky/10 ring-1 ring-voyage-teal/10"
          : "w-full space-y-4",
        className
      )}
    >
      {mode === "initial" ? (
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-foreground">先确认本次出行信息</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            选择出发地、目的地与旅行时间后，再开始与 Agent 对话规划行程。
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-violet-600" />
              出发地
            </label>
            <Input
              value={preferences.origin}
              onChange={(e) => patch({ origin: e.target.value })}
              placeholder="例：上海、北京"
              disabled={disabled}
              className="h-10 border-violet-500/25 bg-background/80 text-sm focus-visible:ring-violet-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-emerald-600" />
              目的地
            </label>
            <Input
              value={preferences.destination}
              onChange={(e) => patch({ destination: e.target.value })}
              placeholder="例：南京、珠海"
              disabled={disabled}
              className="h-10 border-emerald-500/25 bg-background/80 text-sm focus-visible:ring-emerald-500/30"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <CalendarRange className="h-3.5 w-3.5 text-sky-600" />
              开始日期
            </label>
            <Input
              type="date"
              value={preferences.tripStart}
              onChange={(e) => patch({ tripStart: e.target.value })}
              disabled={disabled}
              className="h-10 border-sky-500/25 bg-background/80 text-sm focus-visible:ring-sky-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <CalendarRange className="h-3.5 w-3.5 text-sky-600" />
              结束日期
            </label>
            <Input
              type="date"
              value={preferences.tripEnd}
              onChange={(e) => patch({ tripEnd: e.target.value })}
              disabled={disabled}
              className="h-10 border-sky-500/25 bg-background/80 text-sm focus-visible:ring-sky-500/30"
            />
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className={cn("w-full gap-2 bg-primary shadow-md shadow-primary/20", mode === "initial" ? "mt-5" : "mt-2")}
        disabled={disabled || !ready}
        onClick={onConfirm}
      >
        {confirmLabel ?? (mode === "initial" ? "确认，开始对话" : "保存修改")}
      </Button>
    </div>
  );
}
