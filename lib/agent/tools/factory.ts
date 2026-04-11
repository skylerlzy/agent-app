import type { ToolDefinition } from "../contracts";
import { ToolRegistry } from "./registry";
import { calendarToolStub, mapsRouteToolStub, weatherToolStub } from "./stubTools";

export function createStubToolRegistry(): ToolRegistry {
  const tools: ToolDefinition[] = [weatherToolStub, mapsRouteToolStub, calendarToolStub];
  return new ToolRegistry(new Map(tools.map((t) => [t.name, t] as const)));
}
