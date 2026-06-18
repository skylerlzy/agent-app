"use client";

import { SignInButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StructuredTripPlanView } from "@/components/agent/tripPlan/StructuredTripPlanView";
import { ChatMessageList } from "@/components/agent/ChatMessageList";
import { ConversationList } from "@/components/agent/ConversationList";
import { ChatComposerActions } from "@/components/agent/ChatComposerActions";
import { TripSetupPanel, formatTripDateRange, formatTripRoute, isTripSetupComplete, tripCoreFieldsChanged } from "@/components/agent/TripSetupPanel";
import { TripInfoEditModal } from "@/components/agent/TripInfoEditModal";
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
  defaultPreferences,
  type ConversationPreferences,
  type MessageStatus,
  type StoredChatMessage,
} from "@/lib/conversationStorage";
import { tripPlanFromRunDone, tripPlanFromStorageJson } from "@/lib/agent/context/tripPlanMemory";
import { CHAT_PANEL_STYLES } from "@/lib/voyageTheme";
import { useDebouncedCallback } from "@/lib/useDebouncedCallback";
import { cn } from "@/lib/utils";
import { CalendarRange, MapPin, Send, Rocket } from "lucide-react";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_SKILL_IDS: string[] = [];
const EMPTY_TOOL_NAMES: ToolName[] = [];

function parseLocalNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00`);
}

function validatePreferences(prefs: ConversationPreferences): string | null {
  const origin = prefs.origin.trim();
  const dest = prefs.destination.trim();
  if (!origin) return "请先确认出发地。";
  if (!dest) return "请先确认目的地。";
  const { tripStart, tripEnd } = prefs;
  const ts = tripStart.trim();
  const te = tripEnd.trim();
  if (!ts || !te) return "请先确认旅行开始与结束日期。";
  if (!ISO_DAY.test(ts)) return "旅行开始日期格式须为 YYYY-MM-DD。";
  if (!ISO_DAY.test(te)) return "旅行结束日期格式须为 YYYY-MM-DD。";
  if (parseLocalNoon(ts) > parseLocalNoon(te)) {
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

export function AgentWorkspace() {
  const [activeId, setActiveId] = useState<Id<"conversations"> | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const creatingRef = useRef(false);
  /** 新建/删除后等待 Convex 列表刷新，避免 useEffect 把 activeId 抢回旧对话 */
  const pendingSelectIdRef = useRef<Id<"conversations"> | null>(null);
  const finishedSessionsRef = useRef<Set<string>>(new Set());
  const [draftPreferences, setDraftPreferences] = useState<ConversationPreferences>(() =>
    defaultPreferences()
  );
  const [tripSetupConfirmed, setTripSetupConfirmed] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [tripEditOpen, setTripEditOpen] = useState(false);
  const [tripEditDraft, setTripEditDraft] = useState<ConversationPreferences>(() => defaultPreferences());
  const [tripEditError, setTripEditError] = useState<string | null>(null);
  const savedTripCoreRef = useRef<Pick<ConversationPreferences, "origin" | "destination" | "tripStart" | "tripEnd">>({
    origin: "",
    destination: "",
    tripStart: "",
    tripEnd: "",
  });

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

  /** 切换对话时同步偏好与出行确认状态 */
  useEffect(() => {
    if (!activeId || conversations === undefined) return;
    const conv = conversations.find((c) => c._id === activeId);
    if (!conv) return;
    const parsed = parsePreferencesJson(conv.preferencesJson);
    setDraftPreferences(parsed);
    savedTripCoreRef.current = {
      origin: parsed.origin,
      destination: parsed.destination,
      tripStart: parsed.tripStart,
      tripEnd: parsed.tripEnd,
    };
    setTripSetupConfirmed(conv.messageCount > 0 || isTripSetupComplete(parsed));
    setSetupError(null);
  }, [activeId, conversations]);

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
        .then((id) => {
          pendingSelectIdRef.current = id;
          setActiveId(id);
        })
        .finally(() => {
          creatingRef.current = false;
        });
      return;
    }

    const pending = pendingSelectIdRef.current;
    if (pending) {
      if (conversations.some((c) => c._id === pending)) {
        pendingSelectIdRef.current = null;
        return;
      }
      if (activeId !== pending) setActiveId(pending);
      return;
    }

    if (activeId && conversations.some((c) => c._id === activeId)) {
      return;
    }

    setActiveId(conversations[0]._id);
  }, [conversations, activeId, createConversation]);

  const summaryEvents = useMemo(() => liveEvents ?? [], [liveEvents]);

  const masterTripPlan = useMemo(() => {
    const stored = tripPlanFromStorageJson(activeConversation?.tripPlanStructuredJson);
    const runDone = [...(liveEvents ?? [])].reverse().find((e) => e.type === "run_done");
    if (runDone?.type === "run_done") {
      const live = tripPlanFromRunDone(runDone.payload);
      if (live) return live;
    }
    return stored;
  }, [activeConversation?.tripPlanStructuredJson, liveEvents]);

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
    try {
      const id = await createConversation({});
      pendingSelectIdRef.current = id;
      setActiveId(id);
      setDraft("");
      setRunError(null);
      setTripSetupConfirmed(false);
      setSetupError(null);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }, [createConversation]);

  const handleRename = useCallback(
    async (id: string, title: string) => {
      try {
        await updateTitle({ conversationId: id as Id<"conversations">, title });
      } catch (e) {
        setRunError(e instanceof Error ? e.message : String(e));
      }
    },
    [updateTitle]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteConversation({ conversationId: id as Id<"conversations"> });
        if (activeId != null && String(activeId) === String(id)) {
          const remaining = conversations?.filter((c) => String(c._id) !== String(id)) ?? [];
          if (remaining.length > 0) {
            pendingSelectIdRef.current = null;
            setActiveId(remaining[0]._id);
          } else {
            const fresh = await createConversation({});
            pendingSelectIdRef.current = fresh;
            setActiveId(fresh);
          }
        }
      } catch (e) {
        setRunError(e instanceof Error ? e.message : String(e));
      }
    },
    [activeId, conversations, createConversation, deleteConversation]
  );

  const persistConversationMeta = useCallback(
    async (
      prefs: ConversationPreferences,
      skillIds: string[],
      toolNames: ToolName[],
      sharedEnabled = sharedKnowledgeEnabled,
      prefsOnly = false
    ) => {
      if (!activeId) return;
      await updatePreferencesMut({
        conversationId: activeId,
        preferencesJson: serializePreferencesJson(prefs),
        ...(prefsOnly
          ? {}
          : {
              activeSkillIds: skillIds,
              enabledToolNames: toolNames,
              sharedKnowledgeEnabled: sharedEnabled,
            }),
      });
    },
    [activeId, sharedKnowledgeEnabled, updatePreferencesMut]
  );

  const debouncedPersistPreferences = useDebouncedCallback(
    (prefs: ConversationPreferences) => {
      void persistConversationMeta(prefs, activeSkillIds, enabledToolNames, sharedKnowledgeEnabled, true).catch(
        (e) => {
          setRunError(e instanceof Error ? e.message : String(e));
        }
      );
    },
    450
  );

  const handlePreferencesChange = useCallback(
    (prefs: ConversationPreferences) => {
      setDraftPreferences(prefs);
      debouncedPersistPreferences(prefs);
    },
    [debouncedPersistPreferences]
  );

  const handleSkillIdsChange = useCallback(
    (skillIds: string[]) => {
      void persistConversationMeta(draftPreferences, skillIds, enabledToolNames).catch((e) => {
        setRunError(e instanceof Error ? e.message : String(e));
      });
    },
    [draftPreferences, enabledToolNames, persistConversationMeta]
  );

  const handleToolNamesChange = useCallback(
    (toolNames: ToolName[]) => {
      void persistConversationMeta(draftPreferences, activeSkillIds, toolNames).catch((e) => {
        setRunError(e instanceof Error ? e.message : String(e));
      });
    },
    [activeSkillIds, draftPreferences, persistConversationMeta]
  );

  const handleSharedKnowledgeChange = useCallback(
    (enabled: boolean) => {
      void persistConversationMeta(draftPreferences, activeSkillIds, enabledToolNames, enabled).catch(
        (e) => {
          setRunError(e instanceof Error ? e.message : String(e));
        }
      );
    },
    [activeSkillIds, draftPreferences, enabledToolNames, persistConversationMeta]
  );

  const handleSelectConversation = useCallback((id: string) => {
    pendingSelectIdRef.current = null;
    setActiveId(id as Id<"conversations">);
  }, []);

  const handleConfirmTripSetup = useCallback(() => {
    const err = validatePreferences(draftPreferences);
    if (err) {
      setSetupError(err);
      return;
    }
    setSetupError(null);
    setTripSetupConfirmed(true);
    savedTripCoreRef.current = {
      origin: draftPreferences.origin,
      destination: draftPreferences.destination,
      tripStart: draftPreferences.tripStart,
      tripEnd: draftPreferences.tripEnd,
    };
    void persistConversationMeta(draftPreferences, activeSkillIds, enabledToolNames, sharedKnowledgeEnabled, true);
  }, [
    draftPreferences,
    activeSkillIds,
    enabledToolNames,
    sharedKnowledgeEnabled,
    persistConversationMeta,
  ]);

  const canChat = tripSetupConfirmed && isTripSetupComplete(draftPreferences);

  const hasExistingPlan = Boolean(masterTripPlan || uiMessages.length > 0);

  const openTripEdit = useCallback(() => {
    setTripEditDraft({ ...draftPreferences });
    setTripEditError(null);
    setTripEditOpen(true);
  }, [draftPreferences]);

  const triggerFullPlanRegenerate = useCallback(
    async (prefs: ConversationPreferences) => {
      if (!activeId) return;
      const route = formatTripRoute(prefs.origin, prefs.destination);
      const dates = formatTripDateRange(prefs.tripStart, prefs.tripEnd);
      const text = `请根据更新后的出行信息（${route}，${dates}）重新生成完整旅行方案。`;

      setLoading(true);
      setRunError(null);
      try {
        const { sessionId } = await sendUserMessage({
          conversationId: activeId,
          content: text,
          preferences: toTripPreferences(prefs),
          activeSkillIds,
          enabledToolNames: enabledToolNames.length > 0 ? enabledToolNames : undefined,
          runMode: "full_plan_execute",
        });
        finishedSessionsRef.current.delete(sessionId);
        setActiveSessionId(sessionId);
      } catch (e) {
        setRunError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    },
    [activeId, activeSkillIds, enabledToolNames, sendUserMessage]
  );

  const handleSaveTripEdit = useCallback(async () => {
    const err = validatePreferences(tripEditDraft);
    if (err) {
      setTripEditError(err);
      return;
    }

    const coreChanged = tripCoreFieldsChanged(savedTripCoreRef.current, tripEditDraft);
    const needsRegenerate = coreChanged && hasExistingPlan;

    if (needsRegenerate) {
      const ok = window.confirm(
        "修改出发地、目的地或旅行日期将重新生成全部旅行方案，右侧现有行程会被覆盖。是否继续？"
      );
      if (!ok) return;
    }

    setTripEditError(null);
    setDraftPreferences(tripEditDraft);
    savedTripCoreRef.current = {
      origin: tripEditDraft.origin,
      destination: tripEditDraft.destination,
      tripStart: tripEditDraft.tripStart,
      tripEnd: tripEditDraft.tripEnd,
    };
    setTripEditOpen(false);

    try {
      await persistConversationMeta(
        tripEditDraft,
        activeSkillIds,
        enabledToolNames,
        sharedKnowledgeEnabled,
        true
      );
      if (needsRegenerate) {
        await triggerFullPlanRegenerate(tripEditDraft);
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }, [
    tripEditDraft,
    hasExistingPlan,
    persistConversationMeta,
    activeSkillIds,
    enabledToolNames,
    sharedKnowledgeEnabled,
    triggerFullPlanRegenerate,
  ]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeId) {
      setRunError("请输入出行目标。");
      return;
    }

    if (!canChat) {
      setRunError("请先确认出发地、目的地与旅行时间。");
      return;
    }

    const prefErr = validatePreferences(draftPreferences);
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
        preferences: toTripPreferences(draftPreferences),
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
  }, [draft, activeId, draftPreferences, activeSkillIds, enabledToolNames, sendUserMessage, canChat]);

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
        onSelect={handleSelectConversation}
        onNew={() => void handleNew()}
        onRename={(id, title) => void handleRename(id, title)}
        onDelete={(id) => void handleDelete(id)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(11rem,13rem)_minmax(460px,34rem)_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[14rem_500px_1fr]">
        <ConversationList
          className="hidden min-h-0 lg:flex"
          conversations={listItems}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onNew={() => void handleNew()}
          onRename={(id, title) => void handleRename(id, title)}
          onDelete={(id) => void handleDelete(id)}
        />

        <section className={CHAT_PANEL_STYLES.shell}>
          <div className={CHAT_PANEL_STYLES.topStripe} aria-hidden />
          <header
            className={cn(
              CHAT_PANEL_STYLES.header,
              "relative z-[2] flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            )}
          >
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {activeConversation?.title ?? "对话"}
              </h2>
              <p className="text-[11px] text-muted-foreground">多轮对话 · Plan-Execute · ReAct</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canChat && (draftPreferences.origin.trim() || draftPreferences.destination.trim()) ? (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={openTripEdit}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-900 transition hover:border-violet-500/50 hover:bg-violet-500/15 disabled:opacity-50"
                    title="点击修改出发地、目的地与日期"
                  >
                    <MapPin className="h-3 w-3" />
                    {formatTripRoute(draftPreferences.origin, draftPreferences.destination)}
                  </button>
                  {formatTripDateRange(draftPreferences.tripStart, draftPreferences.tripEnd) ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={openTripEdit}
                      className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-900 transition hover:border-sky-500/50 hover:bg-sky-500/15 disabled:opacity-50"
                      title="点击修改旅行日期"
                    >
                      <CalendarRange className="h-3 w-3" />
                      {formatTripDateRange(draftPreferences.tripStart, draftPreferences.tripEnd)}
                    </button>
                  ) : null}
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs lg:hidden"
                onClick={() => void handleNew()}
              >
                新建
              </Button>
            </div>
          </header>

          <ChatMessageList
            messages={uiMessages}
            activeSessionId={activeSessionId}
            liveEvents={liveEvents ?? undefined}
            isRunning={loading}
            emptyContent={
              !tripSetupConfirmed ? (
                <TripSetupPanel
                  preferences={draftPreferences}
                  onChange={(prefs) => {
                    setDraftPreferences(prefs);
                    debouncedPersistPreferences(prefs);
                  }}
                  onConfirm={handleConfirmTripSetup}
                  error={setupError}
                  disabled={loading}
                />
              ) : null
            }
          />

          <div className={cn(CHAT_PANEL_STYLES.footer, "z-10 space-y-3 p-3 sm:p-4")}>
            {activeConversation ? (
              <ChatComposerActions
                sharedKnowledgeEnabled={sharedKnowledgeEnabled}
                onSharedKnowledgeChange={handleSharedKnowledgeChange}
                activeSkillIds={activeSkillIds}
                onSkillIdsChange={handleSkillIdsChange}
                enabledToolNames={enabledToolNames}
                onToolNamesChange={handleToolNamesChange}
                preferences={draftPreferences}
                onPreferencesChange={handlePreferencesChange}
                disabled={loading}
              />
            ) : null}

            {runError ? (
              <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {runError}
              </p>
            ) : null}

            <div className="flex gap-2 rounded-2xl border border-voyage-sky/20 bg-background/85 p-2 shadow-inner shadow-voyage-sky/5">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  canChat
                    ? "例：帮我安排每日景点与交通；追问：第二天改成慢节奏…"
                    : "请先确认上方出行信息后再开始对话"
                }
                className="min-h-[44px] max-h-32 flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                disabled={loading || !canChat}
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
                disabled={loading || !draft.trim() || !activeId || !canChat}
                className="h-auto shrink-0 gap-1.5 rounded-xl px-4 shadow-md shadow-primary/20"
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

        <aside className="hidden min-h-0 min-w-0 flex-col overflow-hidden lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <StructuredTripPlanView
              plan={masterTripPlan}
              events={summaryEvents}
              isUpdating={isUpdatingMasterPlan}
            />
          </div>
        </aside>
      </div>

      {masterTripPlan || isUpdatingMasterPlan ? (
        <div className="max-h-[42vh] shrink-0 overflow-y-auto lg:hidden">
          <StructuredTripPlanView
            plan={masterTripPlan}
            events={summaryEvents}
            isUpdating={isUpdatingMasterPlan}
          />
        </div>
      ) : null}

      <TripInfoEditModal
        open={tripEditOpen}
        preferences={tripEditDraft}
        onChange={setTripEditDraft}
        onSave={() => void handleSaveTripEdit()}
        onClose={() => setTripEditOpen(false)}
        error={tripEditError}
        disabled={loading}
        showRegenerateWarning={hasExistingPlan}
      />
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
