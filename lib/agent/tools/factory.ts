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

function enabledNamesFromUserSettings(settings: UserToolSetting[]): ToolName[] | "all-disabled" | undefined {
  if (!settings.length) return undefined;
  const enabled = settings.filter((s) => s.enabled).map((s) => s.toolName);
  return enabled.length > 0 ? enabled : "all-disabled";
}

export function createConfigurableToolRegistry(opts?: {
  userSettings?: UserToolSetting[];
  /** 对话级覆盖；非空时作为白名单；undefined 表示跟随用户全局设置 */
  enabledToolNames?: ToolName[];
}): ToolRegistry {
  const full = createFullToolRegistry();

  if (opts?.enabledToolNames !== undefined && opts.enabledToolNames.length > 0) {
    return full.filterByNames(opts.enabledToolNames);
  }

  const fromUser = enabledNamesFromUserSettings(opts?.userSettings ?? []);
  if (fromUser === "all-disabled") {
    return ToolRegistry.fromDefinitions([]);
  }
  if (fromUser !== undefined) {
    return full.filterByNames(fromUser);
  }

  return full;
}
