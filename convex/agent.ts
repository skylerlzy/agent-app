import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { createAutonomousAgentPipeline } from "../lib/agent/orchestrator/factory";
import type { AgentRunInput, ITraceSink, ReasoningEvent, UserGoal } from "../lib/agent/contracts";

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
    slots: v.optional(
      v.object({
        originCity: v.optional(v.string()),
        destination: v.optional(v.string()),
        startDateIso: v.optional(v.string()),
        endDateIso: v.optional(v.string()),
        budgetCny: v.optional(v.number()),
        pace: v.optional(v.union(v.literal("slow"), v.literal("balanced"), v.literal("fast"))),
      })
    ),
    preferences: v.optional(
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
    ),
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

    const input: AgentRunInput = {
      sessionId: args.sessionId,
      goal: {
        rawText: args.goalRaw,
        slots: slotsOut,
      },
      context: {
        userId: identity.subject,
        preferences: pref,
      },
    };

    let pipeline;
    try {
      pipeline = createAutonomousAgentPipeline(traceSink);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`无法初始化 Agent（请检查 DASHSCOPE_API_KEY 等环境变量）: ${message}`);
    }

    await ctx.runMutation(internal.agent.createSession, {
      sessionId: args.sessionId,
      userId: identity.subject,
      goalText: args.goalRaw,
    });

    try {
      for await (const _ of pipeline.run(input)) {
        /* 事件已通过 traceSink 写入 Convex */
      }
      await ctx.runMutation(internal.agent.setSessionStatus, {
        sessionId: args.sessionId,
        status: "done",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.agent.setSessionStatus, {
        sessionId: args.sessionId,
        status: "error",
      });
      throw new Error(message);
    }

    return { sessionId: args.sessionId };
  },
});
