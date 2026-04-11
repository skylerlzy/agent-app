import { DemoClient } from "./DemoClient";

export default function DemoPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 900 }}>
      <h1 style={{ fontSize: "1.25rem" }}>Agent 内部状态轨迹</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        展示 session_start → plan → ReAct（thought / tool_call / tool_result / reflexion）→ run_done。
      </p>
      <DemoClient />
    </main>
  );
}
