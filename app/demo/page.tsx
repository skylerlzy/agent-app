import { DemoClient } from "./DemoClient";

export default function DemoPage() {
  return (
    <main 
      style={{ 
        padding: "2rem", 
        maxWidth: "1000px", 
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <h1 style={{ 
        fontSize: "1.5rem", 
        marginBottom: "0.5rem",
        color: "#f1f5f9"
      }}>
        🤖 Agent 内部状态轨迹
      </h1>
      
      <p style={{ 
        color: "#94a3b8", 
        marginBottom: "1.5rem",
        lineHeight: 1.5
      }}>
        展示 session_start → plan → ReAct（thought / tool_call / tool_result / reflexion）→ run_done。
      </p>
      
      <DemoClient />
    </main>
  );
}