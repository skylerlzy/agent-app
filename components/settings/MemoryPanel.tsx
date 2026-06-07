"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserMemory } from "@/lib/agent/contracts";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Brain, Pencil, Plus, Save, Trash2, X } from "lucide-react";

const KIND_OPTIONS: Array<{ id: UserMemory["kind"]; label: string }> = [
  { id: "preference", label: "偏好" },
  { id: "constraint", label: "约束" },
  { id: "fact", label: "事实" },
  { id: "other", label: "其他" },
];

function kindLabel(kind: UserMemory["kind"]): string {
  return KIND_OPTIONS.find((x) => x.id === kind)?.label ?? kind;
}

function KindSelect({
  value,
  onChange,
  disabled,
}: {
  value: UserMemory["kind"];
  onChange: (kind: UserMemory["kind"]) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as UserMemory["kind"])}
      className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
    >
      {KIND_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MemoryBadge({ kind }: { kind: UserMemory["kind"] }) {
  return (
    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      {kindLabel(kind)}
    </span>
  );
}

export function MemoryPanel() {
  const memories = useQuery(api.memories.list, { limit: 100 });
  const createMemory = useMutation(api.memories.create);
  const updateMemory = useMutation(api.memories.update);
  const removeMemory = useMutation(api.memories.remove);

  const [kind, setKind] = useState<UserMemory["kind"]>("preference");
  const [content, setContent] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<UserMemory["kind"]>("preference");
  const [editContent, setEditContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => memories ?? [], [memories]);

  const handleCreate = useCallback(async () => {
    const text = content.trim();
    if (!text) {
      setError("请输入记忆内容。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createMemory({ kind, content: text });
      setContent("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [content, createMemory, kind]);

  const beginEdit = useCallback((memory: UserMemory) => {
    setEditId(memory.id);
    setEditKind(memory.kind);
    setEditContent(memory.content);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editId) return;
    const text = editContent.trim();
    if (!text) {
      setError("记忆内容不能为空。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateMemory({
        memoryId: editId as Id<"userMemories">,
        kind: editKind,
        content: text,
      });
      setEditId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [editContent, editId, editKind, updateMemory]);

  const handleRemove = useCallback(
    async (memory: UserMemory) => {
      if (!window.confirm("确定删除这条长期记忆？")) return;
      setBusy(true);
      setError(null);
      try {
        await removeMemory({ memoryId: memory.id as Id<"userMemories"> });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [removeMemory]
  );

  if (memories === undefined) {
    return (
      <GlassCard className="cursor-default border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">加载长期记忆…</CardContent>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <GlassCard className="cursor-default">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            新增长期记忆
          </CardTitle>
          <CardDescription className="text-xs">
            这里保存的偏好、事实和约束会在对话开启共享知识时跨对话注入 Agent。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <KindSelect value={kind} onChange={setKind} disabled={busy} />
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例：用户不吃辣；用户偏好慢节奏、少排队的路线。"
              disabled={busy}
              className="min-h-[72px] flex-1 resize-y text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" disabled={busy || !content.trim()} className="gap-1.5" onClick={() => void handleCreate()}>
              <Plus className="h-4 w-4" />
              保存记忆
            </Button>
          </div>
        </CardContent>
      </GlassCard>

      {error ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">长期记忆列表</h2>
            <p className="text-xs text-muted-foreground">运行后自动抽取的偏好也会出现在这里，可手动修正。</p>
          </div>
          <span className="text-xs text-muted-foreground">{grouped.length} 条</span>
        </div>

        {grouped.length === 0 ? (
          <GlassCard className="cursor-default border-dashed">
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              暂无长期记忆。可以手动新增，或在对话中表达稳定偏好后由系统自动抽取。
            </CardContent>
          </GlassCard>
        ) : (
          <div className="grid gap-3">
            {grouped.map((memory) => {
              const editing = editId === memory.id;
              return (
                <GlassCard key={memory.id} className="cursor-default">
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        {editing ? (
                          <div className="space-y-2">
                            <KindSelect value={editKind} onChange={setEditKind} disabled={busy} />
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              disabled={busy}
                              className="min-h-[80px] text-sm"
                            />
                          </div>
                        ) : (
                          <>
                            <MemoryBadge kind={memory.kind} />
                            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{memory.content}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {memory.sourceConversationId ? "来自对话抽取" : "手动创建"} ·{" "}
                              {new Date(memory.updatedAt).toLocaleString()}
                            </p>
                          </>
                        )}
                      </div>

                      <div className={cn("flex shrink-0 gap-2", editing && "self-end")}>
                        {editing ? (
                          <>
                            <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setEditId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="sm" className="h-8 w-8 p-0" disabled={busy} onClick={() => void handleSave()}>
                              <Save className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => beginEdit(memory)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => void handleRemove(memory)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
