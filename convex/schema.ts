import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Agent 会话与推理事件持久化（供前端订阅 / 历史回放；与 lib/agent/contracts 中事件类型对齐）。
 */
export default defineSchema({
  agentSessions: defineTable({
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    goalText: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  agentTraceEvents: defineTable({
    sessionId: v.string(),
    seq: v.number(),
    type: v.string(),
    payloadJson: v.string(),
    ts: v.number(),
  }).index("by_session_seq", ["sessionId", "seq"]),
});
