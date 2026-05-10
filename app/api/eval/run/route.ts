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

function evalPublicMode(): boolean {
  const v = process.env.EVAL_PUBLIC_EVAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 与 Convex 公开评测约定一致；勿在生产公网暴露且无其它防护时开启 */
const EVAL_PUBLIC_PLACEHOLDER = "__eval_public__";

/**
 * 评测平台调用：默认 Bearer + EVAL_SERVER_SECRET；
 * 设置 EVAL_PUBLIC_EVAL=true 时关闭 HTTP 鉴权（仅建议本机/内网），Convex 须同步该变量。
 */
export async function POST(req: NextRequest) {
  const publicEval = evalPublicMode();
  const secret = process.env.EVAL_SERVER_SECRET ?? "";

  if (!publicEval) {
    if (!secret || secret.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          error: "server_misconfigured",
          detail:
              "EVAL_SERVER_SECRET 未配置或长度不足 8；或设置 EVAL_PUBLIC_EVAL=true 以关闭 Bearer（须与 Convex 同步，仅内网使用）。",
        },
        { status: 503 }
      );
    }
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return unauthorized();
    }
  }

  const evalSecretForConvex = publicEval ? EVAL_PUBLIC_PLACEHOLDER : secret;

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
      evalSecret: evalSecretForConvex,
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
