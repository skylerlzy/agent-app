import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    userId: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    sharedKnowledgeEnabled: v.optional(v.boolean()),
    /** JSON：对话级出行偏好（成员3 UI 维护） */
    preferencesJson: v.optional(v.string()),
    /** 本轮对话附加的 Skill id */
    activeSkillIds: v.optional(v.array(v.string())),
    /** 本轮对话启用的工具名（成员6 联调；空表示默认全开） */
    enabledToolNames: v.optional(v.array(v.string())),
    /** 全程 Markdown 行程（右侧固定展示；规划/修订时更新） */
    tripPlanMarkdown: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_title", ["title"]),

  messages: defineTable({
    conversationId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    runSessionId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_createdAt", ["conversationId", "createdAt"]),

  agentSessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    conversationId: v.optional(v.string()),
    runMode: v.optional(
      v.union(v.literal("full_plan_execute"), v.literal("incremental_revise"), v.literal("quick_reply"))
    ),
    messageId: v.optional(v.string()),
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
