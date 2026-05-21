"use client";

import { SignInButton } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { AgentRunSummary } from "@/components/agent/AgentRunSummary";
import { ChatMessageList } from "@/components/agent/ChatMessageList";
import { ConversationList } from "@/components/agent/ConversationList";
import { TripPreferencesPanel } from "@/components/agent/TripPreferencesPanel";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import {
  autoTitleFromMessage,
  createConversation,
  extractSummaryFromEvents,
  loadConversations,
  saveConversations,
  toTripPreferences,
  type LocalConversation,
  type StoredChatMessage,
} from "@/lib/conversationStorage";
import type { ReasoningEvent } from "@/lib/agent/contracts";
import { Send, Rocket } from "lucide-react";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00`);
}

function validatePreferences(conversation: LocalConversation): string | null {
  const { tripStart, tripEnd } = conversation.preferences;
  const ts = tripStart.trim();
  const te = tripEnd.trim();
  if (ts && !ISO_DAY.test(ts)) return "旅行开始日期格式须为 YYYY-MM-DD。";
  if (te && !ISO_DAY.test(te)) return "旅行结束日期格式须为 YYYY-MM-DD。";
  if (ts && te && parseLocalNoon(ts) > parseLocalNoon(te)) {
    return "旅行结束日期须不早于开始日期。";
  }
  return null;
}

/** 取当前对话中最后一次成功运行的轨迹（供右侧摘要） */
function latestSummaryEvents(conversation: LocalConversation | null): ReasoningEvent[] {
  if (!conversation) return [];
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i];
    if (m.role === "assistant" && m.traceEvents?.length && m.status === "done") {
      return m.traceEvents;
    }
  }
  return [];
}

export function AgentWorkspace() {
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const conversationsRef = useRef(conversations);
  const activeIdRef = useRef(activeId);
  const finishedSessionsRef = useRef<Set<string>>(new Set());
  conversationsRef.current = conversations;
  activeIdRef.current = activeId;

  const runAgent = useAction(api.agent.runAgent);
  const liveEvents = useQuery(api.agent.listTraceEvents, activeSessionId ? { sessionId: activeSessionId } : "skip");

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const summaryEvents = useMemo(() => {
    if (loading && liveEvents?.length) return liveEvents;
    const cached = latestSummaryEvents(activeConversation);
    if (cached.length) return cached;
    return liveEvents ?? [];
  }, [activeConversation, liveEvents, loading]);

  useEffect(() => {
    const stored = loadConversations();
    if (stored.length > 0) {
      setConversations(stored);
      setActiveId(stored[0].id);
    } else {
      const first = createConversation();
      setConversations([first]);
      setActiveId(first.id);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveConversations(conversations);
  }, [conversations, hydrated]);

  const updateConversation = useCallback(
    (id: string, updater: (c: LocalConversation) => LocalConversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
    },
    []
  );

  const handleNew = useCallback(() => {
    const c = createConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setDraft("");
    setRunError(null);
  }, []);

  const handleRename = useCallback((id: string, title: string) => {
    updateConversation(id, (c) => ({ ...c, title, updatedAt: Date.now() }));
  }, [updateConversation]);

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (next.length === 0) {
          const fresh = createConversation();
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === id) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId]
  );

  const handlePreferencesChange = useCallback(
    (prefs: LocalConversation["preferences"]) => {
      if (!activeId) return;
      updateConversation(activeId, (c) => ({
        ...c,
        preferences: prefs,
        updatedAt: Date.now(),
      }));
    },
    [activeId, updateConversation]
  );

  /** 运行结束后将轨迹与摘要写回对应对话 */
  useEffect(() => {
    if (!activeSessionId || !liveEvents?.length) return;
    if (finishedSessionsRef.current.has(activeSessionId)) return;

    const last = liveEvents[liveEvents.length - 1];
    const finished = last.type === "run_done" || last.type === "run_error";
    if (!finished) return;

    finishedSessionsRef.current.add(activeSessionId);
    const summary = extractSummaryFromEvents(liveEvents);
    const convId = activeIdRef.current;
    if (!convId) return;

    updateConversation(convId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) =>
        m.sessionId === activeSessionId
          ? {
              ...m,
              status: last.type === "run_done" ? ("done" as const) : ("error" as const),
              content: summary || m.content,
              traceEvents: liveEvents as ReasoningEvent[],
            }
          : m
      ),
    }));

    setLoading(false);
    setRunError(last.type === "run_error" ? summary : null);
    setActiveSessionId(null);
  }, [liveEvents, activeSessionId, updateConversation]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeConversation || !activeId) {
      setRunError("请输入出行目标。");
      return;
    }

    const prefErr = validatePreferences(activeConversation);
    if (prefErr) {
      setRunError(prefErr);
      return;
    }

    setRunError(null);
    const sessionId = crypto.randomUUID();
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    const now = Date.now();
    const isFirstUserMsg = activeConversation.messages.filter((m) => m.role === "user").length === 0;

    const userMsg: StoredChatMessage = {
      id: userMsgId,
      role: "user",
      content: text,
      createdAt: now,
    };
    const assistantMsg: StoredChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      sessionId,
      status: "running",
      createdAt: now + 1,
    };

    updateConversation(activeId, (c) => ({
      ...c,
      title: isFirstUserMsg ? autoTitleFromMessage(text) : c.title,
      updatedAt: now,
      messages: [...c.messages, userMsg, assistantMsg],
    }));

    setDraft("");
    setActiveSessionId(sessionId);
    setLoading(true);
    finishedSessionsRef.current.delete(sessionId);

    const preferences = toTripPreferences(activeConversation.preferences);

    /**
     * 不在前端 await 整段 action：长任务可能超过 180s，但 Convex 仍会继续执行并写入 trace。
     * 完成态由 listTraceEvents 订阅的 run_done / run_error 驱动（见上方 useEffect）。
     */
    void runAgent({
      sessionId,
      goalRaw: text,
      slots: undefined,
      preferences,
    }).catch((e) => {
      if (finishedSessionsRef.current.has(sessionId)) return;
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(msg);
      setLoading(false);
      setActiveSessionId(null);
      updateConversation(activeId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, status: "error" as const, content: msg } : m
        ),
      }));
    });
  }, [draft, activeConversation, activeId, runAgent, updateConversation]);

  if (!hydrated) {
    return (
      <div className="flex h-[min(70vh,720px)] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20">
        <p className="text-sm text-muted-foreground">加载对话…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[min(calc(100vh-8rem),820px)] min-h-[520px] flex-col gap-3 lg:gap-4">
      {/* 小屏：对话列表置于顶部 */}
      <ConversationList
        className="max-h-44 shrink-0 lg:hidden"
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNew}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(11rem,14rem)_1fr_minmax(16rem,22rem)] lg:gap-4 xl:grid-cols-[15rem_1fr_24rem]">
        {/* 左侧：历史对话 */}
        <ConversationList
          className="hidden min-h-0 lg:flex"
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
        />

        {/* 中间：聊天 */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm ring-1 ring-primary/5">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {activeConversation?.title ?? "对话"}
              </h2>
              <p className="text-[11px] text-muted-foreground">Plan-Execute · ReAct · 工具调用</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs lg:hidden" onClick={handleNew}>
              新建
            </Button>
          </header>

          <ChatMessageList
            messages={activeConversation?.messages ?? []}
            activeSessionId={activeSessionId}
            liveEvents={liveEvents ?? undefined}
            isRunning={loading}
          />

          <div className="shrink-0 space-y-3 border-t border-border/60 bg-muted/10 p-3 sm:p-4">
            {activeConversation ? (
              <TripPreferencesPanel
                preferences={activeConversation.preferences}
                onChange={handlePreferencesChange}
                disabled={loading}
              />
            ) : null}

            {runError ? (
              <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {runError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="例：下周末从南京到杭州两天一夜，想了解天气与路程耗时…"
                className="min-h-[44px] max-h-32 flex-1 resize-none text-sm"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => void send()}
                disabled={loading || !draft.trim()}
                className="h-auto shrink-0 gap-1.5 px-4"
              >
                {loading ? (
                  "运行中…"
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    发送
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* 右侧：行程摘要 */}
        <aside className="hidden min-h-0 flex-col overflow-hidden lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {summaryEvents.length > 0 ? (
              <AgentRunSummary events={summaryEvents} className="sticky top-0" />
            ) : (
              <GlassCard className="cursor-default border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">出行方案</CardTitle>
                  <CardDescription className="text-xs">
                    发送消息后，Agent 生成的 Markdown 行程摘要将显示在此；运行过程中会实时更新。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    景点与日程供参考，开放时间与票价以官方为准，铁路以 12306 为准。
                  </p>
                </CardContent>
              </GlassCard>
            )}
          </div>
        </aside>
      </div>

      {/* 小屏：摘要折叠在聊天区下方 */}
      {summaryEvents.length > 0 ? (
        <div className="max-h-[38vh] shrink-0 overflow-y-auto lg:hidden">
          <AgentRunSummary events={summaryEvents} />
        </div>
      ) : null}
    </div>
  );
}

export function AgentWorkspaceGate() {
  return (
    <GlassCard className="border-dashed border-primary/25">
      <CardHeader>
        <CardTitle className="text-base">登录解锁完整能力</CardTitle>
        <CardDescription>
          Clerk 身份通过后，可调用云端 Agent 并查看完整事件轨迹。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInButton mode="modal">
          <Button variant="default" className="cursor-pointer gap-2" type="button">
            <Rocket className="h-4 w-4" />
            登录以继续
          </Button>
        </SignInButton>
      </CardContent>
    </GlassCard>
  );
}
