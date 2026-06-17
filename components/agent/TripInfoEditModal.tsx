"use client";

import { TripSetupPanel } from "@/components/agent/TripSetupPanel";
import type { ConversationPreferences } from "@/lib/conversationStorage";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";

export function TripInfoEditModal({
  open,
  preferences,
  onChange,
  onSave,
  onClose,
  error,
  disabled,
  showRegenerateWarning,
}: {
  open: boolean;
  preferences: ConversationPreferences;
  onChange: (prefs: ConversationPreferences) => void;
  onSave: () => void;
  onClose: () => void;
  error?: string | null;
  disabled?: boolean;
  showRegenerateWarning?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        aria-label="关闭"
        onClick={onClose}
      />
      <GlassCard className="relative z-10 w-full max-w-md shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-3">
          <CardTitle className="text-base">修改出行信息</CardTitle>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {showRegenerateWarning ? (
            <p className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-950">
              修改出发地、目的地或旅行日期后，将使用<strong>完整规划模式</strong>重新生成全部旅行方案，右侧现有行程会被覆盖。
            </p>
          ) : null}
          <TripSetupPanel
            mode="edit"
            preferences={preferences}
            onChange={onChange}
            onConfirm={onSave}
            error={error}
            disabled={disabled}
            confirmLabel={showRegenerateWarning ? "保存并重新规划" : "保存修改"}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
