"use client";

import { SignInButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AgentRunSummary } from "@/components/agent/AgentRunSummary";
import { ChatMessageList } from "@/components/agent/ChatMessageList";
import { ConversationList } from "@/components/agent/ConversationList";
import { TripPreferencesPanel } from "@/components/agent/TripPreferencesPanel";
import { SkillPicker } from "@/components/agent/SkillPicker";
import { ToolPicker } from "@/components/agent/ToolPicker";
import type { ToolName } from "@/lib/agent/contracts";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import {
  extractSummaryFromEvents,
  parsePreferencesJson,
  serializePreferencesJson,
  toTripPreferences,
  type ConversationPreferences,
  type MessageStatus,
  type StoredChatMessage,
} from "@/lib/conversationStorage";
import { extractTripPlanFromHistory } from "@/lib/agent/context/tripPlanMemory";
import { cn } from "@/lib/utils";
import { Brain, Send, Rocket } from "lucide-react";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_SKILL_IDS: string[] = [];
const EMPTY_TOOL_NAMES: ToolName[] = [];

function parseLocalNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00`);
}

function validatePreferences(prefs: ConversationPreferences): string | null {
  const { tripStart, tripEnd } = prefs;
  const ts = tripStart.trim();
  const te = tripEnd.trim();
  if (ts && !ISO_DAY.test(ts)) return "旅行开始日期格式须为 YYYY-MM-DD。";
  if (te && !ISO_DAY.test(te)) return "旅行结束日期格式须为 YYYY-MM-DD。";
  if (ts && te && parseLocalNoon(ts) > parseLocalNoon(te)) {
    return "旅行结束日期须不早于开始日期。";
  }
  return null;
}

type MessageRow = {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system";
  content: string;
  runSessionId?: string;
  createdAt: number;
  sessionStatus?: "running" | "done" | "error";
};

function mapToStoredMessage(row: MessageRow, activeSessionId: string | null): StoredChatMessage {
  let status: MessageStatus | undefined;
  if (row.role === "assistant") {
    if (row.runSessionId === activeSessionId || row.sessionStatus === "running") {
      status = row.content ? "done" : "running";
    } else if (row.sessionStatus === "error") {
      status = "error";
    } else if (row.sessionStatus === "done" || row.content) {
      status = "done";
    } else if (row.runSessionId) {
      status = "running";
    }
  }
  return {
    id: row._id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    sessionId: row.runSessionId,
    status,
    createdAt: row.createdAt,
  };
}

function SharedKnowledgeToggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Brain className="h-4 w-4 text-primary" strokeWidth={1.75} />
          共享长期记忆
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {enabled ? "本对话会读取其他对话沉淀的偏好与约束" : "仅使用本对话抽取的记忆"}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={enabled}
        aria-label={enabled ? "关闭共享长期记忆" : "开启共享长期记忆"}
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          enabled ? "border-primary/50 bg-primary/80" : "border-border bg-muted/60",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
            enabled ? "left-[1.35rem]" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function AgentWorkspace() {
  const [activeId, setActiveId] = useState<Id<"conversations"> | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const finishedSessionsRef = useRef<Set<string>>(new Set());

  const conversations = useQuery(api.conversations.listByUser);
  const messageRows = useQuery(
    api.messages.listByConversation,
    activeId ? { conversationId: activeId } : "skip"
  );
  const liveEvents = useQuery(api.agent.listTraceEvents, activeSessionId ? { sessionId: activeSessionId } : "skip");

  const createConversation = useMutation(api.conversations.create);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const deleteConversation = useMutation(api.conversations.deleteConversation);
  const updatePreferencesMut = useMutation(api.conversations.updatePreferences);
  const sendUserMessage = useMutation(api.messages.sendUserMessage);

  const activeConversation = useMemo(
    () => conversations?.find((c) => c._id === activeId) ?? null,
    [conversations, activeId]
  );

  const preferences = useMemo(
    () => parsePreferencesJson(activeConversation?.preferencesJson),
    [activeConversation?.preferencesJson]
  );

  const activeSkillIds = useMemo(
    () => activeConversation?.activeSkillIds ?? EMPTY_SKILL_IDS,
    [activeConversation?.activeSkillIds]
  );
  const enabledToolNames = useMemo(
    () => (activeConversation?.enabledToolNames ?? EMPTY_TOOL_NAMES) as ToolName[],
    [activeConversation?.enabledToolNames]
  );
  const sharedKnowledgeEnabled = activeConversation?.sharedKnowledgeEnabled ?? true;

  const uiMessages = useMemo(() => {
    if (!messageRows) return [];
    return (messageRows as MessageRow[]).map((row) => mapToStoredMessage(row, activeSessionId));
  }, [messageRows, activeSessionId]);

  const listItems = useMemo(
    () =>
      (conversations ?? []).map((c) => ({
        id: c._id,
        title: c.title,
        updatedAt: c.updatedAt,
        messageCount: c.messageCount,
      })),
    [conversations]
  );

  /** 首次进入：选中最新对话，若无则创建 */
  useEffect(() => {
    if (conversations === undefined) return;
    if (conversations.length === 0) {
      if (creatingRef.current) return;
      creatingRef.current = true;
      void createConversation({})
        .then((id) => setActiveId(id))
        .finally(() => {
          creatingRef.current = false;
        });
      return;
    }
    if (!activeId || !conversations.some((c) => c._id === activeId)) {
      setActiveId(conversations[0]._id);
    }
  }, [conversations, activeId, createConversation]);

  const summaryEvents = useMemo(() => liveEvents ?? [], [liveEvents]);

  const masterTripPlan = useMemo(() => {
    if (activeConversation?.tripPlanMarkdown?.trim()) {
      return activeConversation.tripPlanMarkdown.trim();
    }
    const hist = uiMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return extractTripPlanFromHistory(hist) ?? "";
  }, [activeConversation?.tripPlanMarkdown, uiMessages]);

  const isUpdatingMasterPlan = useMemo(() => {
    if (!loading || !liveEvents?.length) return false;
    const modeEv = liveEvents.find((e) => e.type === "run_mode");
    if (modeEv && modeEv.type === "run_mode") {
      return modeEv.payload.mode !== "quick_reply";
    }
    return true;
  }, [loading, liveEvents]);

  /** 运行结束：由 trace 的 run_done / run_error 驱动 UI 状态 */
  useEffect(() => {
    if (!activeSessionId || !liveEvents?.length) return;
    if (finishedSessionsRef.current.has(activeSessionId)) return;

    const last = liveEvents[liveEvents.length - 1];
    const finished = last.type === "run_done" || last.type === "run_error";
    if (!finished) return;

    finishedSessionsRef.current.add(activeSessionId);
    const summary = extractSummaryFromEvents(liveEvents);
    setLoading(false);
    setRunError(last.type === "run_error" ? summary : null);
    setActiveSessionId(null);
  }, [liveEvents, activeSessionId]);

  const handleNew = useCallback(async () => {
    const id = await createConversation({});
    setActiveId(id);
    setDraft("");
    setRunError(null);
  }, [createConversation]);

  const handleRename = useCallback(
    async (id: string, title: string) => {
      await updateTitle({ conversationId: id as Id<"conversations">, title });
    },
    [updateTitle]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteConversation({ conversationId: id as Id<"conversations"> });
      if (activeId === id) {
        const remaining = conversations?.filter((c) => c._id !== id) ?? [];
        if (remaining.length > 0) {
          setActiveId(remaining[0]._id);
        } else {
          const fresh = await createConversation({});
          setActiveId(fresh);
        }
      }
    },
    [activeId, conversations, createConversation, deleteConversation]
  );

  const persistConversationMeta = useCallback(
    async (
      prefs: ConversationPreferences,
      skillIds: string[],
      toolNames: ToolName[],
      sharedEnabled = sharedKnowledgeEnabled
    ) => {
      if (!activeId) return;
      await updatePreferencesMut({
        conversationId: activeId,
        preferencesJson: serializePreferencesJson(prefs),
        activeSkillIds: skillIds,
        enabledToolNames: toolNames,
        sharedKnowledgeEnabled: sharedEnabled,
      });
    },
    [activeId, sharedKnowledgeEnabled, updatePreferencesMut]
  );

  const handlePreferencesChange = useCallback(
    (prefs: ConversationPreferences) => {
      void persistConversationMeta(prefs, activeSkillIds, enabledToolNames);
    },
    [activeSkillIds, enabledToolNames, persistConversationMeta]
  );

  const handleSkillIdsChange = useCallback(
    (skillIds: string[]) => {
      void persistConversationMeta(preferences, skillIds, enabledToolNames);
    },
    [enabledToolNames, preferences, persistConversationMeta]
  );

  const handleToolNamesChange = useCallback(
    (toolNames: ToolName[]) => {
      void persistConversationMeta(preferences, activeSkillIds, toolNames);
    },
    [activeSkillIds, preferences, persistConversationMeta]
  );

  const handleSharedKnowledgeChange = useCallback(
    (enabled: boolean) => {
      void persistConversationMeta(preferences, activeSkillIds, enabledToolNames, enabled);
    },
    [activeSkillIds, enabledToolNames, preferences, persistConversationMeta]
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeId) {
      setRunError("请输入出行目标。");
      return;
    }

    const prefErr = validatePreferences(preferences);
    if (prefErr) {
      setRunError(prefErr);
      return;
    }

    setRunError(null);
    setDraft("");
    setLoading(true);

    try {
      const { sessionId } = await sendUserMessage({
        conversationId: activeId,
        content: text,
        preferences: toTripPreferences(preferences),
        activeSkillIds,
        enabledToolNames: enabledToolNames.length > 0 ? enabledToolNames : undefined,
      });
      finishedSessionsRef.current.delete(sessionId);
      setActiveSessionId(sessionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(msg);
      setLoading(false);
    }
  }, [draft, activeId, preferences, activeSkillIds, enabledToolNames, sendUserMessage]);

  if (conversations === undefined) {
    return (
      <div className="flex h-[min(70vh,720px)] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20">
        <p className="text-sm text-muted-foreground">加载对话…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[min(calc(100vh-8rem),820px)] min-h-[520px] flex-col gap-3 lg:gap-4">
      <ConversationList
        className="max-h-44 shrink-0 lg:hidden"
        conversations={listItems}
        activeId={activeId}
        onSelect={(id) => setActiveId(id as Id<"conversations">)}
        onNew={() => void handleNew()}
        onRename={(id, title) => void handleRename(id, title)}
        onDelete={(id) => void handleDelete(id)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(11rem,14rem)_1fr_minmax(16rem,22rem)] lg:gap-4 xl:grid-cols-[15rem_1fr_24rem]">
        <ConversationList
          className="hidden min-h-0 lg:flex"
          conversations={listItems}
          activeId={activeId}
          onSelect={(id) => setActiveId(id as Id<"conversations">)}
          onNew={() => void handleNew()}
          onRename={(id, title) => void handleRename(id, title)}
          onDelete={(id) => void handleDelete(id)}
        />

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm ring-1 ring-primary/5">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {activeConversation?.title ?? "对话"}
              </h2>
              <p className="text-[11px] text-muted-foreground">多轮对话 · Plan-Execute · ReAct</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs lg:hidden" onClick={() => void handleNew()}>
              新建
            </Button>
          </header>

          <ChatMessageList
            messages={uiMessages}
            activeSessionId={activeSessionId}
            liveEvents={liveEvents ?? undefined}
            isRunning={loading}
          />

          <div className="shrink-0 space-y-3 border-t border-border/60 bg-muted/10 p-3 sm:p-4">
            {activeConversation ? (
              <>
                <SharedKnowledgeToggle
                  enabled={sharedKnowledgeEnabled}
                  disabled={loading}
                  onChange={handleSharedKnowledgeChange}
                />
                <SkillPicker selectedIds={activeSkillIds} onChange={handleSkillIdsChange} disabled={loading} />
                <ToolPicker
                  selectedNames={enabledToolNames}
                  onChange={handleToolNamesChange}
                  disabled={loading}
                />
                <TripPreferencesPanel preferences={preferences} onChange={handlePreferencesChange} disabled={loading} />
              </>
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
                placeholder="例：规划南京 3 日游，预算 3000；追问：第二天改成慢节奏…"
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
                disabled={loading || !draft.trim() || !activeId}
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

        <aside className="hidden min-h-0 flex-col overflow-hidden lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {masterTripPlan || isUpdatingMasterPlan ? (
              <AgentRunSummary
                markdown={masterTripPlan}
                events={summaryEvents}
                isUpdating={isUpdatingMasterPlan}
                className="sticky top-0"
              />
            ) : (
              <GlassCard className="cursor-default border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">全程出行方案</CardTitle>
                  <CardDescription className="text-xs">
                    首次规划完成后，完整多日行程将固定显示在此，不会因复述类问题而刷新。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    同一会话内可连续追问修订；景点与日程供参考，铁路以 12306 为准。
                  </p>
                </CardContent>
              </GlassCard>
            )}
          </div>
        </aside>
      </div>

      {masterTripPlan || isUpdatingMasterPlan ? (
        <div className="max-h-[38vh] shrink-0 overflow-y-auto lg:hidden">
          <AgentRunSummary
            markdown={masterTripPlan}
            events={summaryEvents}
            isUpdating={isUpdatingMasterPlan}
          />
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
