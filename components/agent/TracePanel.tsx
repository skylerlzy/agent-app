"use client";

import type { ReasoningEvent } from "@/lib/agent/contracts";

export function TracePanel({ events }: { events: ReasoningEvent[] }) {
  const renderEvent = (e: ReasoningEvent) => {
    const baseStyle = {
      marginBottom: "0.5rem",
      padding: "0.5rem",
      borderRadius: 4,
      border: "1px solid #334155",
    };

    switch (e.type) {
      case "session_start":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#0f172a" }}>
            <strong style={{ color: "#7dd3fc" }}>[{e.type}]</strong> seq={e.seq}
            <div>Goal: {e.payload.goal}</div>
          </div>
        );
      case "plan_draft":
      case "plan_final":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#1e293b" }}>
            <strong style={{ color: "#fbbf24" }}>[{e.type}]</strong> seq={e.seq}
            <details>
              <summary>Plan Details</summary>
              <pre style={{ fontSize: 10 }}>{JSON.stringify(e.payload.plan, null, 2)}</pre>
            </details>
          </div>
        );
      case "react_thought":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#065f46", border: "2px solid #10b981" }}>
            <strong style={{ color: "#10b981" }}>[{e.type}]</strong> seq={e.seq}
            <div>Thought: {e.payload.thought}</div>
            <div>Tool: {e.payload.toolName}</div>
          </div>
        );
      case "tool_call":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#7c2d12", border: "2px solid #f97316" }}>
            <strong style={{ color: "#f97316" }}>[{e.type}]</strong> seq={e.seq}
            <div>Step: {e.payload.stepId}, Tool: {e.payload.toolName}</div>
            <pre style={{ fontSize: 10 }}>{JSON.stringify(e.payload.args, null, 2)}</pre>
          </div>
        );
      case "tool_result":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#1e3a8a" }}>
            <strong style={{ color: "#3b82f6" }}>[{e.type}]</strong> seq={e.seq}
            <div>Step: {e.payload.stepId}, Tool: {e.payload.toolName}</div>
            <div>Summary: {e.payload.summary}</div>
          </div>
        );
      case "tool_error":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#7f1d1d" }}>
            <strong style={{ color: "#ef4444" }}>[{e.type}]</strong> seq={e.seq}
            <div>Step: {e.payload.stepId}, Tool: {e.payload.toolName}</div>
            <div>Error: {e.payload.error.message}</div>
          </div>
        );
      case "reflexion":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#581c87", border: "2px solid #a855f7" }}>
            <strong style={{ color: "#a855f7" }}>[{e.type}]</strong> seq={e.seq}
            <div>Step: {e.payload.stepId}</div>
            <div>Diagnosis: {e.payload.diagnosis}</div>
            <div>Next Action: {e.payload.nextAction}</div>
          </div>
        );
      case "step_done":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#14532d" }}>
            <strong style={{ color: "#22c55e" }}>[{e.type}]</strong> seq={e.seq}
            <div>Step: {e.payload.stepId} completed</div>
          </div>
        );
      case "run_done":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#0f172a" }}>
            <strong style={{ color: "#10b981" }}>[{e.type}]</strong> seq={e.seq}
            <div>Summary: {e.payload.summary}</div>
          </div>
        );
      case "run_error":
        return (
          <div key={e.seq} style={{ ...baseStyle, backgroundColor: "#7f1d1d" }}>
            <strong style={{ color: "#ef4444" }}>[{e.type}]</strong> seq={e.seq}
            <div>Error: {e.payload.message}</div>
          </div>
        );
      default:
        const event = e as ReasoningEvent;
        return (
          <div key={event.seq} style={{ ...baseStyle }}>
            <strong style={{ color: "#7dd3fc" }}>[{event.type}]</strong> seq={event.seq}
            <span style={{ color: "#94a3b8" }}>
              {JSON.stringify(event.payload || {}, null, 2).slice(0, 300)}
              {(event.payload && JSON.stringify(event.payload).length > 300) ? "..." : ""}
            </span>
          </div>
        );
    }
  };

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
        <div>
          {events.map(renderEvent)}
        </div>
      )}
    </div>
  );
}