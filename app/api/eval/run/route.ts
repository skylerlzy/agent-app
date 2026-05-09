import { NextResponse, type NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * 评测平台调用：使用 Authorization: Bearer <EVAL_SERVER_SECRET>，
 * 在服务端触发 Convex `runAgentEval`，无需浏览器 Clerk 会话。
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EVAL_SERVER_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured", detail: "EVAL_SERVER_SECRET not set" },
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
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "agent_failed", detail: message }, { status: 502 });
  }
}
