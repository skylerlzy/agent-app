"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ToolCatalogItem } from "@/convex/toolSettings";
import type { ToolName } from "@/lib/agent/contracts";
import { TOOL_NAMES } from "@/lib/agent/contracts";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleAlert, Wrench } from "lucide-react";

function ToggleButton({
  enabled,
  disabled,
  onClick,
}: {
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        enabled ? "border-primary/50 bg-primary/80" : "border-border bg-muted/60",
        disabled && "pointer-events-none opacity-50"
      )}
      aria-pressed={enabled}
      aria-label={enabled ? "已启用" : "已禁用"}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          enabled ? "left-[1.35rem]" : "left-0.5"
        )}
      />
    </button>
  );
}

function EnvStatusBadge({
  envKeys,
  status,
}: {
  envKeys: string[];
  status?: Record<string, boolean>;
}) {
  if (!envKeys.length) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        无需 API Key
      </span>
    );
  }

  const configured = envKeys.every((k) => status?.[k]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px]",
        configured ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
      )}
    >
      {configured ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <CircleAlert className="h-3 w-3" />
      )}
      {configured ? "Key 已配置" : `需在 Convex 配置：${envKeys.join("、")}`}
    </span>
  );
}

export function ToolsPanel() {
  const catalog = useQuery(api.toolSettings.list);
  const setEnabled = useMutation(api.toolSettings.setEnabled);
  const checkEnv = useAction(api.toolSettings.checkEnvStatus);
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void checkEnv({}).then(setEnvStatus).catch(() => undefined);
  }, [checkEnv]);

  const handleToggle = useCallback(
    async (toolName: ToolName, enabled: boolean) => {
      setPending(toolName);
      try {
        await setEnabled({ toolName, enabled: !enabled });
      } finally {
        setPending(null);
      }
    },
    [setEnabled]
  );

  const enableAll = useCallback(async () => {
    setPending("__all__");
    try {
      for (const name of TOOL_NAMES) {
        await setEnabled({ toolName: name, enabled: true });
      }
    } finally {
      setPending(null);
    }
  }, [setEnabled]);

  if (catalog === undefined) {
    return (
      <GlassCard>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">加载工具列表…</CardContent>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-primary" />
            Agent 工具
          </CardTitle>
          <CardDescription>
            控制 Agent 可调用的外部工具。关闭后 trace 中不会出现对应 tool_call；对话页可进一步按会话覆盖。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => void enableAll()}
            >
              全部启用
            </Button>
          </div>

          {catalog.map((item: ToolCatalogItem) => (
            <div
              key={item.toolName}
              className="rounded-xl border border-border/70 bg-background/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{item.displayName}</h3>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.toolName}
                    </code>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-2">
                    <EnvStatusBadge envKeys={item.envKeys} status={envStatus} />
                  </div>
                </div>
                <ToggleButton
                  enabled={item.enabled}
                  disabled={pending === item.toolName || pending === "__all__"}
                  onClick={() => void handleToggle(item.toolName, item.enabled)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
