import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { AgentSkill } from "../lib/agent/contracts";
import { getBuiltinSkills } from "../lib/agent/skills/builtinSkills";
import { parseSkillMarkdown } from "../lib/agent/skills/parseSkillMarkdown";

function rowToAgentSkill(row: Doc<"userSkills">): AgentSkill {
  return {
    id: row._id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    markdownBody: row.markdownBody,
    tags: row.tags,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isBuiltin: false,
  };
}

/** 列出当前用户可用 Skill（内置 + 用户上传） */
export const list = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return getBuiltinSkills();

    const rows = await ctx.db
      .query("userSkills")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const userSkills = rows.map(rowToAgentSkill).sort((a, b) => b.updatedAt - a.updatedAt);
    return [...getBuiltinSkills(), ...userSkills];
  },
});

/** action 内加载 Skill 目录（内置 + 指定用户） */
export const listForUserInternal = internalQuery({
  args: { userId: v.string() },
  async handler(ctx, { userId }) {
    const rows = await ctx.db
      .query("userSkills")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const userSkills = rows.map(rowToAgentSkill);
    return [...getBuiltinSkills(), ...userSkills];
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    markdownBody: v.string(),
    tags: v.array(v.string()),
    enabled: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("未登录");

    const existing = await ctx.db
      .query("userSkills")
      .withIndex("by_user_name", (q) => q.eq("userId", identity.subject).eq("name", args.name))
      .unique();
    if (existing) {
      throw new ConvexError(`已存在同名 Skill：${args.name}`);
    }

    const now = Date.now();
    const id = await ctx.db.insert("userSkills", {
      userId: identity.subject,
      name: args.name.trim(),
      description: args.description.trim(),
      markdownBody: args.markdownBody,
      tags: args.tags,
      enabled: args.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const uploadMarkdown = mutation({
  args: {
    markdown: v.string(),
    enabled: v.optional(v.boolean()),
  },
  async handler(ctx, { markdown, enabled }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("未登录");

    const parsed = parseSkillMarkdown(markdown);
    if (!parsed.name.trim()) throw new ConvexError("Skill 缺少有效 name");

    const existing = await ctx.db
      .query("userSkills")
      .withIndex("by_user_name", (q) => q.eq("userId", identity.subject).eq("name", parsed.name))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        description: parsed.description,
        markdownBody: parsed.markdownBody,
        tags: parsed.tags,
        enabled: enabled ?? existing.enabled,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("userSkills", {
      userId: identity.subject,
      name: parsed.name,
      description: parsed.description,
      markdownBody: parsed.markdownBody,
      tags: parsed.tags,
      enabled: enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    skillId: v.id("userSkills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    markdownBody: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    enabled: v.optional(v.boolean()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("未登录");

    const row = await ctx.db.get(args.skillId);
    if (!row || row.userId !== identity.subject) {
      throw new ConvexError("Skill 不存在或无权修改");
    }

    const patch: Partial<Doc<"userSkills">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.markdownBody !== undefined) {
      patch.markdownBody = args.markdownBody;
      const parsed = parseSkillMarkdown(args.markdownBody);
      patch.name = parsed.name;
      patch.description = parsed.description;
      patch.tags = parsed.tags;
    }
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.enabled !== undefined) patch.enabled = args.enabled;

    if (patch.name && patch.name !== row.name) {
      const dup = await ctx.db
        .query("userSkills")
        .withIndex("by_user_name", (q) => q.eq("userId", identity.subject).eq("name", patch.name!))
        .unique();
      if (dup && dup._id !== row._id) {
        throw new ConvexError(`已存在同名 Skill：${patch.name}`);
      }
    }

    await ctx.db.patch(args.skillId, patch);
  },
});

export const remove = mutation({
  args: { skillId: v.id("userSkills") },
  async handler(ctx, { skillId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("未登录");

    const row = await ctx.db.get(skillId);
    if (!row || row.userId !== identity.subject) {
      throw new ConvexError("Skill 不存在或无权删除");
    }
    await ctx.db.delete(skillId);
  },
});
