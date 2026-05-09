import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * ConvexHttpClient 在 status=error 且带 errorData 时会抛 ConvexError：
 * super(errorMessage) 往往是泛化的 "Server Error"，可读内容在 .data（来自 errorData）。
 */
function formatAgentEvalFailure(e: unknown): string {
  if (!(e instanceof ConvexError)) {
    return e instanceof Error ? e.message : String(e);
  }
  const d = e.data;
  if (typeof d === "string" && d.trim().length > 0) {
    return d.trim();
  }
  if (d !== undefined && d !== null) {
    try {
      return JSON.stringify(d);
    } catch {
      /* ignore */
    }
  }
  return e.message;
}

/**
 * 评测平台调用：使用 Authorization: Bearer <EVAL_SERVER_SECRET>，
 * 在服务端触发 Convex `runAgentEval`，无需浏览器 Clerk 会话。
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EVAL_SERVER_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_misconfigured",
        detail:
            "EVAL_SERVER_SECRET 未配置或长度不足 8。请在部署环境设置该变量：Render → 你的 Web Service → Environment → 添加 EVAL_SERVER_SECRET（与 Convex Dashboard、评测平台 Java 中完全一致），保存后重新 Deploy。",
      },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured", detail: "NEXT_PUBLIC_CONVEX_URL missing" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.trim() : "";
  const goalRaw = typeof b.goalRaw === "string" ? b.goalRaw.trim() : "";
  if (!sessionId || !goalRaw) {
    return NextResponse.json(
      { ok: false, error: "validation", detail: "sessionId and goalRaw are required" },
      { status: 422 }
    );
  }

  const client = new ConvexHttpClient(convexUrl);

  try {
    const result = await client.action(api.agent.runAgentEval, {
      evalSecret: secret,
      sessionId,
      goalRaw,
      slots: (b.slots as object | undefined) ?? undefined,
      preferences: (b.preferences as object | undefined) ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    let detail = formatAgentEvalFailure(e);
    if (detail.includes("Server Error") && detail.includes("Request ID")) {
      detail +=
        " 提示：请到 Convex Dashboard → Logs 用上述 Request ID 检索。若 detail 仅有 Server Error，多为云端仍抛普通 Error 或客户端未读到 errorData；请确认已 deploy 含 ConvexError 的 convex/agent.ts，且该部署 Environment 含 DASHSCOPE_API_KEY、EVAL_SERVER_SECRET（须与 Render/Java 一致）。";
    }
    return NextResponse.json({ ok: false, error: "agent_failed", detail }, { status: 502 });
  }
}
