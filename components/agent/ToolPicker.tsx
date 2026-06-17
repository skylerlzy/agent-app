"use client";

import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { ToolCatalogItem } from "@/convex/toolSettings";
import { TOOL_NAMES, type ToolName } from "@/lib/agent/contracts";
import { cn } from "@/lib/utils";

export interface ToolPickerContentProps {
  selectedNames: ToolName[];
  onChange: (names: ToolName[]) => void;
  disabled?: boolean;
}

export function ToolPickerContent({ selectedNames, onChange, disabled }: ToolPickerContentProps) {
  const catalog = useQuery(api.toolSettings.list);

  const available = useMemo((): ToolCatalogItem[] => {
    if (!catalog) return [];
    return catalog.filter((t: ToolCatalogItem) => t.enabled);
  }, [catalog]);

  const effectiveSelected = useMemo(() => {
    if (selectedNames.length > 0) return selectedNames;
    return available.map((t: ToolCatalogItem) => t.toolName);
  }, [available, selectedNames]);

  const toggle = useCallback(
    (name: ToolName) => {
      if (disabled) return;
      const base =
        selectedNames.length > 0 ? selectedNames : available.map((t: ToolCatalogItem) => t.toolName);
      if (base.includes(name)) {
        onChange(base.filter((n: ToolName) => n !== name));
      } else {
        onChange([...base, name]);
      }
    },
    [available, disabled, onChange, selectedNames]
  );

  const useDefaults = useCallback(() => {
    onChange([]);
  }, [onChange]);

  if (catalog === undefined) {
    return <p className="text-xs text-muted-foreground">加载工具…</p>;
  }

  const customMode = selectedNames.length > 0;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        关闭的工具不会出现在 Agent trace 中。未自定义时沿用「设置 → 工具管理」。
      </p>
      <div className="flex flex-wrap gap-2">
        {available.map((item) => {
          const active = effectiveSelected.includes(item.toolName);
          return (
            <button
              key={item.toolName}
              type="button"
              disabled={disabled}
              onClick={() => toggle(item.toolName)}
              title={item.description}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-900 shadow-sm"
                  : "border-border/80 bg-background/80 text-muted-foreground hover:border-sky-500/30 hover:bg-sky-500/[0.06]",
                disabled && "pointer-events-none opacity-50"
              )}
            >
              {item.displayName}
            </button>
          );
        })}
      </div>
      {customMode ? (
        <button
          type="button"
          disabled={disabled}
          onClick={useDefaults}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          恢复为全局默认
        </button>
      ) : null}
    </div>
  );
}

export function toolPickerBadgeCount(selectedNames: ToolName[], catalog: ToolCatalogItem[] | undefined): string {
  const available = catalog?.filter((t) => t.enabled) ?? [];
  const count =
    selectedNames.length > 0 ? selectedNames.length : available.length || TOOL_NAMES.length;
  return `${count}/${TOOL_NAMES.length}`;
}
