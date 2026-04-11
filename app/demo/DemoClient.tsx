"use client";

import { useState } from "react";
import { TracePanel } from "@/components/agent/TracePanel";
import type { ReasoningEvent } from "@/lib/agent/contracts";

export function DemoClient() {
  const [events, setEvents] = useState<ReasoningEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setEvents([]);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: `demo_${Date.now()}`,
          goal: {
            rawText: "下周末从南京去杭州三日游，避开已有会议",
            slots: {
              originCity: "南京",
              destination: "杭州",
              startDateIso: new Date(Date.now() + 86400000 * 5).toISOString(),
              endDateIso: new Date(Date.now() + 86400000 * 8).toISOString(),
            },
          },
          context: {
            userId: "demo-user",
            preferences: {},
            calendarBusyWindows: [
              {
                start: Date.now() + 86400000 * 6,
                end: Date.now() + 86400000 * 6 + 3600000,
                label: "组会",
              },
            ],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "请求失败");
      setEvents(data.events ?? []);
    } catch (e) {
      console.error("Agent 运行失败：", e);
      alert(`运行失败：\n${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem" }}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        style={{
          padding: "0.6rem 1.2rem",
          marginBottom: "1rem",
          backgroundColor: "#38bdf8",
          color: "#0f172a",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          transition: "opacity 0.2s",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "🚀 运行中…" : "▶️ 运行示例 Agent"}
      </button>
      <TracePanel events={events} />
    </div>
  );
}