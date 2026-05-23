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
import { SkillRegistry, resolveSkillSystemSection } from "../lib/agent/skills/SkillRegistry";

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
  activeSkillIds?: string[];
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
    activeSkillIds: args.activeSkillIds ?? [],
  };
}

async function enrichInputWithSkills(
  ctx: GenericActionCtx<DataModel>,
  input: AgentRunInput,
  userId: string
): Promise<AgentRunInput> {
  const skillIds = input.activeSkillIds ?? [];
  if (!skillIds.length) return input;

  const catalog = await ctx.runQuery(internal.skills.listForUserInternal, { userId });
  const registry = SkillRegistry.fromSkills(catalog);
  const skillSystemSection = await resolveSkillSystemSection(registry, skillIds);
  return { ...input, skillSystemSection };
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
    pipeline = createAutonomousAgentPipeline(traceSink, {});
  } catch (e) {
    if (e instanceof ConvexError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new ConvexError(
      `无法初始化 Agent（Convex Dashboard 须配置 DASHSCOPE_API_KEY 等，与 Next 部署无关）: ${message}`
    );
  }

  await ctx.runMutation(internal.agent.createSession, {
    sessionId: input.sessionId,
    userId,
    goalText: goalRaw,
  });

  const enrichedInput = await enrichInputWithSkills(ctx, input, userId);

  try {
    for await (const _ of pipeline.run(enrichedInput)) {
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

const activeSkillIdsValidator = v.optional(v.array(v.string()));

export const runAgent = action({
  args: {
    sessionId: v.string(),
    goalRaw: v.string(),
    slots: runSlotsValidator,
    preferences: runPreferencesValidator,
    activeSkillIds: activeSkillIdsValidator,
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

function convexEvalPublicMode(): boolean {
  const v = process.env.EVAL_PUBLIC_EVAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 去掉 CR、BOM、首尾空白；若整段被一对引号包住则剥掉（Dashboard 误粘贴常带引号） */
function rawCleanEvalSecret(s: string): string {
  let t = (s ?? "").replace(/\r/g, "").replace(/^\uFEFF/, "").trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function normEvalSecret(s: string): string {
  return rawCleanEvalSecret(s).normalize("NFKC");
}

const EVAL_PUBLIC_PLACEHOLDER = "__eval_public__";

/**
 * 供评测平台（HTTP 网关）在无 Clerk 会话下触发一次完整运行。
 * 默认需在 Convex 配置 EVAL_SERVER_SECRET；EVAL_PUBLIC_EVAL=true 时改为占位密钥联调（勿用于公网）。
 */
export const runAgentEval = action({
  args: {
    evalSecret: v.string(),
    sessionId: v.string(),
    goalRaw: v.string(),
    slots: runSlotsValidator,
    preferences: runPreferencesValidator,
    activeSkillIds: activeSkillIdsValidator,
  },
  handler: async (ctx, args) => {
    if (convexEvalPublicMode()) {
      if (args.evalSecret !== EVAL_PUBLIC_PLACEHOLDER) {
        throw new ConvexError(
          "已开启 EVAL_PUBLIC_EVAL：evalSecret 须为固定值 __eval_public__（由 Next /api/eval/run 注入）。"
        );
      }
    } else {
      const expected = normEvalSecret(process.env.EVAL_SERVER_SECRET ?? "");
      if (!expected || expected.length < 8) {
        throw new ConvexError(
          "Convex 未配置有效的 EVAL_SERVER_SECRET（长度至少 8）。请在 Convex Dashboard → Environment Variables 添加；或在内网联调时设置 EVAL_PUBLIC_EVAL=true。"
        );
      }
      const got = normEvalSecret(args.evalSecret);
      if (got !== expected) {
        throw new ConvexError(
          `评测密钥无效（规范化后比对）：Convex 侧长度=${expected.length}，请求侧长度=${got.length}。`
              + (expected.length !== got.length
                  ? " 两侧长度不同，说明三处未使用同一段密钥。"
                  : " 长度相同但内容不同，或 Convex 与 Next 指向了不同部署。")
              + " 请在 agent-app 目录执行 npx convex env get EVAL_SERVER_SECRET --prod（或省略 --prod）"
              + " 与 Next / Java 评测侧环境变量逐字对照；Dashboard 勿给整段加引号。改完后务必 npx convex deploy。"
        );
      }
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
