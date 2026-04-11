"use client";

import type { ReasoningEvent } from "@/lib/agent/contracts";

export function TracePanel({ events }: { events: ReasoningEvent[] })
{
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
        backgroundColor: "#1e293b",
        color: "#f1f5f9",
      }}
    >
      {events.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>暂无事件，点击运行生成轨迹。</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {events.map((e) => (
            <li key={e.seq} style={{ marginBottom: "0.5rem" }}>
              <span style={{ color: "#7dd3fc", fontWeight: 600 }}>
                [{e.type}]
              </span>{" "}
              seq={e.seq}{" "}
              <span style={{ color: "#94a3b8" }}>
                {JSON.stringify(e.payload || {}, null, 2).slice(0, 300)}
                {(e.payload && JSON.stringify(e.payload).length > 300) ? "..." : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}