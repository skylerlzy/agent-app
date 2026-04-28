import { DemoClient } from "./DemoClient";

export default function DemoPage() {
  return (
    <main 
      style={{ 
        padding: "2rem", 
        maxWidth: "1400px", 
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <h1 style={{ 
        fontSize: "2rem", 
        marginBottom: "0.5rem",
        color: "#f1f5f9"
      }}>
        🤖 Agent 交互演示
      </h1>
      
      <p style={{ 
        color: "#94a3b8", 
        marginBottom: "1.5rem",
        lineHeight: 1.5
      }}>
        输入您的需求，运行Agent，实时查看内部状态轨迹（session_start → plan → ReAct → run_done）。
      </p>
      
      <DemoClient />
    </main>
  );
}