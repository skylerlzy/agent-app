"use client";

import { useState } from "react";
import { TracePanel } from "@/components/agent/TracePanel";
import type { ReasoningEvent } from "@/lib/agent/contracts";

export function DemoClient() {
  const [events, setEvents] = useState<ReasoningEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [userInput, setUserInput] = useState("");

  const run = async () => {
    if (!userInput.trim()) {
      alert("请输入您的需求！");
      return;
    }
    setLoading(true);
    setEvents([]);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: `demo_${Date.now()}`,
          goal: {
            rawText: userInput,
            slots: {}, // 可以根据需要解析或留空
          },
          context: {
            userId: "demo-user",
            preferences: {},
            calendarBusyWindows: [], // 可以添加默认或用户输入
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error ?? "请求失败");
      }

      // 使用 EventSource 来处理 SSE
      const eventSource = new EventSource(`/api/agent/run?sessionId=demo_${Date.now()}`);
      // 实际上，SSE 需要 GET 请求，但我们用 POST 发送数据。
      // 为了简单，我们可以修改 API 为 GET，但为了保持 POST，我们可以存储 session 并用 GET 监听。
      // 或者，直接用 fetch 的 response.body 来读取流。

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // 保留不完整的行

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              break;
            }
            try {
              const event: ReasoningEvent | { type: "error"; message: string } = JSON.parse(data);
              if (event.type === "error") {
                throw new Error(event.message);
              }
              setEvents(prev => [...prev, event as ReasoningEvent]);
            } catch (e) {
              console.error("解析 event 失败:", e);
            }
          }
        }
      }
    } catch (e) {
      console.error("Agent 运行失败：", e);
      alert(`运行失败：\n${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem", display: "flex", gap: "2rem" }}>
      {/* 用户输入界面 */}
      <div style={{ flex: 1, maxWidth: "400px" }}>
        <h2 style={{ color: "#f1f5f9", marginBottom: "1rem" }}>输入您的需求</h2>
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="例如：下周末从南京去杭州三日游，避开已有会议"
          style={{
            width: "100%",
            height: "150px",
            padding: "0.5rem",
            border: "1px solid #334155",
            borderRadius: "8px",
            backgroundColor: "#1e293b",
            color: "#f1f5f9",
            fontFamily: "system-ui, sans-serif",
            resize: "vertical",
          }}
        />
        <button
          type="button"
          onClick={run}
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.6rem 1.2rem",
            marginTop: "1rem",
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
          {loading ? "🚀 运行中…" : "▶️ 运行 Agent"}
        </button>
      </div>

      {/* Agent 内部可视化 */}
      <div style={{ flex: 2 }}>
        <h2 style={{ color: "#f1f5f9", marginBottom: "1rem" }}>Agent 内部状态轨迹</h2>
        <TracePanel events={events} />
      </div>
    </div>
  );
}