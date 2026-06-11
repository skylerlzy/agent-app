import type { ToolName, UserToolSetting } from "../contracts";
import { ToolRegistry } from "./registry";
import {
  mapsRouteToolStub,
  poiSearchTool,
  railScheduleHintTool,
  weatherToolStub,
} from "./stubTools";

export function createFullToolRegistry(): ToolRegistry {
  return ToolRegistry.fromDefinitions([
    weatherToolStub,
    mapsRouteToolStub,
    poiSearchTool,
    railScheduleHintTool,
  ]);
}

/** @deprecated 使用 createFullToolRegistry 或 createConfigurableToolRegistry */
export function createStubToolRegistry(): ToolRegistry {
  return createFullToolRegistry();
}

function enabledNamesFromUserSettings(settings: UserToolSetting[]): ToolName[] | undefined {
  if (!settings.length) return undefined;
  return settings.filter((s) => s.enabled).map((s) => s.toolName);
}

export function createConfigurableToolRegistry(opts?: {
  userSettings?: UserToolSetting[];
  /** 对话级覆盖；有值时优先于用户全局设置 */
  enabledToolNames?: ToolName[];
}): ToolRegistry {
  const full = createFullToolRegistry();

  if (opts?.enabledToolNames !== undefined) {
    return full.filterByNames(opts.enabledToolNames);
  }

  const fromUser = enabledNamesFromUserSettings(opts?.userSettings ?? []);
  if (fromUser !== undefined) {
    return full.filterByNames(fromUser);
  }

  return full;
}
