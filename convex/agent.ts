import { ConvexError, v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { createAutonomousAgentPipeline } from "../lib/agent/orchestrator/factory";
import type { AgentRunInput, ITraceSink, ReasoningEvent, UserGoal } from "../lib/agent/contracts";

const runSlotsValidator = v.optional(
  v.object({
    originCity: v.optional(v.string()),
    destination: v.optional(v.string()),
    startDateIso: v.optional(v.string()),
    endDateIso: v.optional(v.string()),
    budgetCny: v.optional(v.number()),
    pace: v.optional(v.union(v.literal("slow"), v.literal("balanced"), v.literal("fast"))),
  })
);

const runPreferencesValidator = v.optional(
  v.object({
    tripStartDateIso: v.optional(v.string()),
    tripEndDateIso: v.optional(v.string()),
    dietaryNotes: v.optional(v.string()),
    dietaryPreset: v.optional(
      v.union(v.literal("none"), v.literal("vegetarian"), v.literal("halal"), v.literal("local"))
    ),
    pace: v.optional(v.union(v.literal("slow"), v.literal("balanced"), v.literal("fast"))),
    accommodationType: v.optional(
      v.union(v.literal("hotel"), v.literal("airbnb"), v.literal("hostel"), v.literal("camping"))
    ),
    travelThemes: v.optional(v.array(v.string())),
    transportPreferences: v.optional(v.array(v.string())),
    budgetCny: v.optional(v.number()),
    additionalNotes: v.optional(v.string()),
    travelParty: v.optional(
      v.union(v.literal("solo"), v.literal("couple"), v.literal("family"), v.literal("group"))
    ),
  })
);

type RunBody = {
  sessionId: string;
  goalRaw: string;
  slots?: UserGoal["slots"];
  preferences?: AgentRunInput["context"]["preferences"];
};

function buildAgentInput(args: RunBody, userId: string): AgentRunInput {
  const pref = args.preferences ?? {};
  const baseSlots = args.slots ?? {};
  const mergedSlots = {
    ...baseSlots,
    startDateIso: pref.tripStartDateIso ?? baseSlots.startDateIso,
    endDateIso: pref.tripEndDateIso ?? baseSlots.endDateIso,
    pace: pref.pace ?? baseSlots.pace,
    budgetCny: pref.budgetCny ?? baseSlots.budgetCny,
  };
  const goalSlots = Object.fromEntries(
    Object.entries(mergedSlots).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const slotsOut =
    Object.keys(goalSlots).length > 0 ? (goalSlots as UserGoal["slots"]) : undefined;

  return {
    sessionId: args.sessionId,
    goal: {
      rawText: args.goalRaw,
      slots: slotsOut,
    },
    context: {
      userId,
      preferences: pref,
    },
  };
}

async function executeAgentPipeline(
  ctx: GenericActionCtx<DataModel>,
  input: AgentRunInput,
  goalRaw: string,
  userId: string,
  traceSink: ITraceSink
): Promise<void> {
  let pipeline;
  try {
    pipeline = createAutonomousAgentPipeline(traceSink);
  } catch (e) {
    if (e instanceof ConvexError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new ConvexError(
      `无法初始化 Agent（Convex Dashboard 须配置 DASHSCOPE_API_KEY 等，与 Next/Render 无关）: ${message}`
    );
  }

  await ctx.runMutation(internal.agent.createSession, {
    sessionId: input.sessionId,
    userId,
    goalText: goalRaw,
  });

  try {
    for await (const _ of pipeline.run(input)) {
      /* 事件已通过 traceSink */
    }
    await ctx.runMutation(internal.agent.setSessionStatus, {
      sessionId: input.sessionId,
      status: "done",
    });
  } catch (e) {
    await ctx.runMutation(internal.agent.setSessionStatus, {
      sessionId: input.sessionId,
      status: "error",
    });
    if (e instanceof ConvexError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new ConvexError(message);
  }
}

function summarizeFromEvents(events: ReasoningEvent[]): string {
  const err = [...events].reverse().find((e) => e.type === "run_error");
  if (err && err.type === "run_error") {
    return `运行失败: ${err.payload.message}`;
  }
  const done = [...events].reverse().find((e) => e.type === "run_done");
  if (done && done.type === "run_done") {
    return done.payload.summary;
  }
  return "";
}

export const getSessionById = internalQuery({
  args: { sessionId: v.string() },
  async handler(ctx, { sessionId }) {
    return await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
  },
});

export const createSession = internalMutation({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    goalText: v.string(),
  },
  async handler(ctx, { sessionId, userId, goalText }) {
    await ctx.db.insert("agentSessions", {
      sessionId,
      userId,
      status: "running",
      goalText,
      createdAt: Date.now(),
    });
  },
});

export const appendTraceEvent = internalMutation({
  args: {
    sessionId: v.string(),
    eventJson: v.string(),
  },
  async handler(ctx, { sessionId, eventJson }) {
    const event = JSON.parse(eventJson) as ReasoningEvent;
    await ctx.db.insert("agentTraceEvents", {
      sessionId,
      seq: event.seq,
      eventJson,
    });
  },
});

export const setSessionStatus = internalMutation({
  args: {
    sessionId: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
  },
  async handler(ctx, { sessionId, status }) {
    const row = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, { status });
  },
});

export const listTraceEvents = query({
  args: { sessionId: v.string() },
  async handler(ctx, { sessionId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const session = await ctx.db
      .query("agentSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!session || session.userId !== identity.subject) {
      return [];
    }
    const rows = await ctx.db
      .query("agentTraceEvents")
      .withIndex("by_session_seq", (q) => q.eq("sessionId", sessionId))
      .collect();
    rows.sort((a, b) => a.seq - b.seq);
    return rows.map((r) => JSON.parse(r.eventJson) as ReasoningEvent);
  },
});

export const runAgent = action({
  args: {
    sessionId: v.string(),
    goalRaw: v.string(),
    slots: runSlotsValidator,
    preferences: runPreferencesValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("未登录：请先通过 Clerk 登录后再运行 Agent。");
    }

    const existing = await ctx.runQuery(internal.agent.getSessionById, {
      sessionId: args.sessionId,
    });
    if (existing) {
      throw new Error("该 sessionId 已存在，请刷新页面后重试。");
    }

    const traceSink: ITraceSink = {
      emit: async (event: ReasoningEvent) => {
        await ctx.runMutation(internal.agent.appendTraceEvent, {
          sessionId: args.sessionId,
          eventJson: JSON.stringify(event),
        });
      },
    };

    const input = buildAgentInput(args, identity.subject);
    await executeAgentPipeline(ctx, input, args.goalRaw, identity.subject, traceSink);

    return { sessionId: args.sessionId };
  },
});

/**
 * 供评测平台（HTTP 网关）在无 Clerk 会话下触发一次完整运行。
 * 需在 Convex Dashboard 配置 EVAL_SERVER_SECRET，与 Next 路由中的同名变量一致。
 */
export const runAgentEval = action({
  args: {
    evalSecret: v.string(),
    sessionId: v.string(),
    goalRaw: v.string(),
    slots: runSlotsValidator,
    preferences: runPreferencesValidator,
  },
  handler: async (ctx, args) => {
    const expected = process.env.EVAL_SERVER_SECRET;
    if (!expected || expected.length < 8) {
      throw new ConvexError(
        "Convex 未配置有效的 EVAL_SERVER_SECRET（长度至少 8）。请在 Convex Dashboard → Settings → Environment Variables 添加，与 Next/Render/Java 一致；仅配置 Render 无效。"
      );
    }
    if (args.evalSecret !== expected) {
      throw new ConvexError("评测密钥无效：EVAL_SERVER_SECRET 须在 Convex、Next（Render）、Java 三端完全一致。");
    }

    const existing = await ctx.runQuery(internal.agent.getSessionById, {
      sessionId: args.sessionId,
    });
    if (existing) {
      throw new ConvexError("该 sessionId 已存在，请更换 sessionId 后重试。");
    }

    const collected: ReasoningEvent[] = [];
    const traceSink: ITraceSink = {
      emit: async (event: ReasoningEvent) => {
        collected.push(event);
        await ctx.runMutation(internal.agent.appendTraceEvent, {
          sessionId: args.sessionId,
          eventJson: JSON.stringify(event),
        });
      },
    };

    const evalUserId = "eval-platform";
    const input = buildAgentInput(args, evalUserId);
    const t0 = Date.now();
    await executeAgentPipeline(ctx, input, args.goalRaw, evalUserId, traceSink);
    const latencyMs = Date.now() - t0;

    const blob = JSON.stringify(collected);
    const tokenEstimate = Math.max(1, Math.round((args.goalRaw.length + blob.length) / 4));

    return {
      sessionId: args.sessionId,
      output: summarizeFromEvents(collected),
      trace_json: blob,
      latency_ms: latencyMs,
      token_estimate: tokenEstimate,
    };
  },
});
