"use client";

import { useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ToolCatalogItem } from "@/convex/toolSettings";
import { TOOL_NAMES, type ToolName } from "@/lib/agent/contracts";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

export interface ToolPickerProps {
  /** 空数组表示使用全局默认（设置页） */
  selectedNames: ToolName[];
  onChange: (names: ToolName[]) => void;
  disabled?: boolean;
}

export function ToolPicker({ selectedNames, onChange, disabled }: ToolPickerProps) {
  const catalog = useQuery(api.toolSettings.list);
  const [open, setOpen] = useState(false);

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
        const next = base.filter((n: ToolName) => n !== name);
        onChange(next);
      } else {
        onChange([...base, name]);
      }
    },
    [available, disabled, onChange, selectedNames]
  );

  const useDefaults = useCallback(() => {
    onChange([]);
  }, [onChange]);

  if (catalog === undefined) return null;

  const customMode = selectedNames.length > 0;
  const selectedCount = effectiveSelected.length;

  return (
    <div className="rounded-xl border border-border/60 bg-background/50">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Wrench className="h-3.5 w-3.5 text-primary" />
          本轮工具
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {selectedCount}/{TOOL_NAMES.length}
          </span>
          {!customMode ? (
            <span className="text-[10px] font-normal text-muted-foreground">（跟随设置）</span>
          ) : null}
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
            关闭的工具不会出现在 Agent trace 中。未自定义时沿用「设置 → 工具管理」的全局开关。
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
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
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
                      : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-muted/40",
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
      ) : null}
    </div>
  );
}
