"use client";

import type { ReasoningEvent } from "@/lib/agent/contracts";
import type { StoredChatMessage } from "@/lib/conversationStorage";
import { ReasoningPipeline } from "@/components/agent/ReasoningPipeline";
import { TracePanel } from "@/components/agent/TracePanel";
import { MarkdownTravelBody } from "@/components/agent/MarkdownTravelBody";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, ChevronDown, ChevronUp, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ChatMessageListProps {
  messages: StoredChatMessage[];
  /** 当前正在订阅 trace 的 sessionId */
  activeSessionId?: string | null;
  /** 当前正在订阅的 session 的实时事件（运行中） */
  liveEvents?: ReasoningEvent[];
  isRunning?: boolean;
  className?: string;
}

function AssistantBubble({
  message,
  liveEvents,
  isRunning,
}: {
  message: StoredChatMessage;
  liveEvents?: ReasoningEvent[];
  isRunning?: boolean;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const showRunning = message.status === "running" || message.status === "pending";
  const fetchedTrace = useQuery(
    api.agent.listTraceEvents,
    traceOpen && message.sessionId && !showRunning ? { sessionId: message.sessionId } : "skip"
  );
  const events =
    showRunning && liveEvents?.length
      ? liveEvents
      : message.traceEvents?.length
        ? message.traceEvents
        : fetchedTrace?.length
          ? fetchedTrace
          : liveEvents ?? [];

  const hasTrace = events.length > 0 || showRunning;

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
        <Bot className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-2xl rounded-tl-md border border-border/60 bg-card/90 px-4 py-3 shadow-sm">
          {showRunning ? (
            <div className="space-y-3">
              <ReasoningPipeline
                events={events}
                isRunning={Boolean(isRunning)}
                className="border-0 bg-transparent p-0 shadow-none ring-0"
              />
              {!message.content ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Agent 正在规划与调用工具…</p>
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary/25 [animation-delay:300ms]" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : message.status === "error" ? (
            <p className="text-sm text-destructive">{message.content || "运行失败"}</p>
          ) : message.content.includes("##") ? (
            <div className="prose-sm max-w-none text-sm">
              <MarkdownTravelBody markdown={message.content} />
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{message.content}</p>
          )}
        </div>

        {hasTrace ? (
          <div className="rounded-xl border border-border/50 bg-muted/20">
            <button
              type="button"
              onClick={() => setTraceOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>推理轨迹 {events.length > 0 ? `(${events.length} 事件)` : ""}</span>
              {traceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {traceOpen ? (
              <div className="border-t border-border/40 p-3 pt-0">
                <TracePanel
                  events={events}
                  isAwaitingRun={showRunning && events.length === 0}
                  variant="peek"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex flex-row-reverse gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
        <User className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
        {content}
      </div>
    </div>
  );
}

export function ChatMessageList({
  messages,
  activeSessionId,
  liveEvents,
  isRunning,
  className,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, liveEvents?.length]);

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center",
          className
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Bot className="h-6 w-6 text-primary" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">开始规划你的出行</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            在下方输入目的地与需求，Agent 将调用天气与路线工具，并生成可执行的行程建议。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4", className)}>
      {messages.map((msg) =>
        msg.role === "user" ? (
          <UserBubble key={msg.id} content={msg.content} />
        ) : (
          <AssistantBubble
            key={msg.id}
            message={msg}
            liveEvents={
              msg.sessionId && msg.sessionId === activeSessionId ? liveEvents : undefined
            }
            isRunning={
              Boolean(isRunning && msg.sessionId && msg.sessionId === activeSessionId)
            }
          />
        )
      )}
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}
