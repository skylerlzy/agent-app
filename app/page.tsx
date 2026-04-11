import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>智能出行与日程协调助手（Agent）</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        自治 Agent 框架：Plan-and-Execute + ReAct + Reflexion；工具与规划当前为占位，正式版由 LLM 驱动。
      </p>
      <Link
        href="/demo"
        style={{
          display: "inline-block",
          padding: "0.6rem 1rem",
          background: "var(--accent)",
          color: "#0f172a",
          borderRadius: 8,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        打开推理轨迹演示
      </Link>
    </main>
  );
}
