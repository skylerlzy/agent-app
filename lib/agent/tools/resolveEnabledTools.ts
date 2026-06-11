import { TOOL_NAMES, type ToolName, type UserToolSetting } from "../contracts";

/** 合并对话级与用户级工具开关，得到本轮可用工具名；undefined 表示默认全开 */
export function resolveEnabledToolNames(
  userSettings: UserToolSetting[],
  conversationEnabled?: string[] | null
): ToolName[] | undefined {
  if (conversationEnabled && conversationEnabled.length > 0) {
    return conversationEnabled.filter((n): n is ToolName =>
      (TOOL_NAMES as readonly string[]).includes(n)
    );
  }

  if (userSettings.length > 0) {
    const enabled = userSettings.filter((s) => s.enabled).map((s) => s.toolName);
    return enabled;
  }

  return undefined;
}
