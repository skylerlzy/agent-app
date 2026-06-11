import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";
import {
  TOOL_DISPLAY_NAMES,
  TOOL_ENV_REQUIREMENTS,
  TOOL_LLM_DESCRIPTIONS,
} from "../lib/agent/tools/descriptions";
import { TOOL_NAMES, type ToolName, type UserToolSetting } from "../lib/agent/contracts";

function rowToSetting(userId: string, row: {
  toolName: string;
  enabled: boolean;
  configJson?: string;
  updatedAt: number;
}): UserToolSetting {
  return {
    userId,
    toolName: row.toolName as ToolName,
    enabled: row.enabled,
    configJson: row.configJson,
    updatedAt: row.updatedAt,
  };
}

export type ToolCatalogItem = {
  toolName: ToolName;
  displayName: string;
  description: string;
  envKeys: string[];
  envLabel: string;
  enabled: boolean;
  configJson?: string;
};

/** 设置页：工具目录 + 用户开关状态 */
export const list = query({
  args: {},
  async handler(ctx): Promise<ToolCatalogItem[]> {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;

    const rows = userId
      ? await ctx.db
          .query("userToolSettings")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      : [];

    const byName = new Map(rows.map((r) => [r.toolName, r]));

    return TOOL_NAMES.map((toolName) => {
      const meta = TOOL_ENV_REQUIREMENTS[toolName];
      const row = byName.get(toolName);
      return {
        toolName,
        displayName: TOOL_DISPLAY_NAMES[toolName],
        description: TOOL_LLM_DESCRIPTIONS[toolName],
        envKeys: meta.envKeys,
        envLabel: meta.label,
        enabled: row ? row.enabled : true,
        configJson: row?.configJson,
      };
    });
  },
});

export const setEnabled = mutation({
  args: {
    toolName: v.string(),
    enabled: v.boolean(),
    configJson: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const userId = await requireUserId(ctx);
    if (!(TOOL_NAMES as readonly string[]).includes(args.toolName)) {
      throw new Error(`未知工具名：${args.toolName}`);
    }

    const existing = await ctx.db
      .query("userToolSettings")
      .withIndex("by_user_tool", (q) =>
        q.eq("userId", userId).eq("toolName", args.toolName)
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        configJson: args.configJson,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("userToolSettings", {
      userId,
      toolName: args.toolName,
      enabled: args.enabled,
      configJson: args.configJson,
      updatedAt: now,
    });
  },
});

/** action 内加载用户工具偏好 */
export const listForUserInternal = internalQuery({
  args: { userId: v.string() },
  async handler(ctx, { userId }): Promise<UserToolSetting[]> {
    const rows = await ctx.db
      .query("userToolSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => rowToSetting(userId, r));
  },
});

/** 检查 Convex 环境变量是否已配置（供设置页只读展示） */
export const checkEnvStatus = action({
  args: {},
  async handler() {
    const check = (key: string) => Boolean(process.env[key]?.trim());
    return {
      QWEATHER_API_KEY: check("QWEATHER_API_KEY"),
      QWEATHER_API_HOST: check("QWEATHER_API_HOST"),
      AMAP_WEBSERVICE_KEY: check("AMAP_WEBSERVICE_KEY"),
    };
  },
});
