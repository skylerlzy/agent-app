import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentSessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    goalText: v.string(),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_user", ["userId"]),

  agentTraceEvents: defineTable({
    sessionId: v.string(),
    seq: v.number(),
    eventJson: v.string(),
  }).index("by_session_seq", ["sessionId", "seq"]),

  userSkills: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.string(),
    markdownBody: v.string(),
    tags: v.array(v.string()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),
});
