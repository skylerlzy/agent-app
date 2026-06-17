"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAT_PANEL_STYLES } from "@/lib/voyageTheme";
import { cn } from "@/lib/utils";
import { MessageSquarePlus, Pencil, Search, Trash2, X, Check } from "lucide-react";
import { useMemo, useState } from "react";

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: number;
  messageCount?: number;
}

export interface ConversationListProps {
  conversations: ConversationListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  className,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const startRename = (c: ConversationListItem) => {
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditTitle("");
  };

  return (
    <aside className={cn(CHAT_PANEL_STYLES.shell, className)}>
      <div className={CHAT_PANEL_STYLES.topStripe} aria-hidden />
      <div className={cn(CHAT_PANEL_STYLES.header, "relative z-[2] space-y-3 p-3")}>
        <Button
          type="button"
          onClick={onNew}
          className="h-9 w-full gap-2 border-0 bg-voyage-brand text-sm text-primary-foreground shadow-md shadow-primary/25 hover:brightness-105"
          size="sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          新建对话
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索对话…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className={cn(CHAT_PANEL_STYLES.body, "relative z-[2] p-2")}>
        {filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            {search.trim() ? "无匹配对话" : "暂无对话，点击上方新建"}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((c) => {
              const active = c.id === activeId;
              const isEditing = editingId === c.id;
              return (
                <li key={c.id}>
                  {isEditing ? (
                    <div className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 p-2">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-7 flex-1 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                      />
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={commitRename}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={cancelRename}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "group relative flex items-start gap-1 rounded-lg border px-2 py-2 transition-all duration-200",
                        active
                          ? "border-primary/35 bg-gradient-to-r from-primary/12 via-emerald-500/8 to-voyage-sky/8 shadow-sm shadow-primary/10"
                          : "border-transparent hover:border-voyage-sky/25 hover:bg-voyage-sky/8"
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-gradient-to-b from-primary via-voyage-teal to-voyage-sky"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className={cn("min-w-0 flex-1 text-left", active && "pl-2")}
                      >
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            active ? "text-primary" : "text-foreground group-hover:text-primary/90"
                          )}
                        >
                          {c.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatRelativeTime(c.updatedAt)}
                          {c.messageCount != null && c.messageCount > 0 ? ` · ${c.messageCount} 条消息` : ""}
                        </p>
                      </button>
                      <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="重命名"
                          onClick={() => startRename(c)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="删除"
                          onClick={() => {
                            if (window.confirm(`确定删除「${c.title}」？`)) onDelete(c.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
