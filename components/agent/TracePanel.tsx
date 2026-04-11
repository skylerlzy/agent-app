"use client";

import type { ReasoningEvent } from "@/lib/agent/contracts";

export function TracePanel({ events }: { events: ReasoningEvent[] }) {
  return (
    <div
      style={{
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "1rem",
        maxHeight: 480,
        overflow: "auto",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
      }}
    >
      {events.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>暂无事件，点击运行生成轨迹。</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {events.map((e) => (
            <li key={e.seq} style={{ marginBottom: "0.5rem" }}>
              <span style={{ color: "#7dd3fc" }}>[{e.type}]</span> seq={e.seq}{" "}
              <span style={{ color: "var(--muted)" }}>{JSON.stringify(e.payload).slice(0, 200)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
