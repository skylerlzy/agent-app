/**
 * 主题工具占位定义（框架层）。
 * 真实 HTTP/SDK 调用由成员3 在各工具文件中实现，并注册进 ToolRegistry。
 */
import { z } from "zod";
import type { ToolContext, ToolDefinition, ToolResult } from "../contracts";

const weatherArgs = z.object({ city: z.string().min(1), dateIso: z.string().optional() });
const routeArgs = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  mode: z.enum(["transit", "driving", "walking"]),
});
const calendarArgs = z.object({
  proposedStart: z.number(),
  proposedEnd: z.number(),
  label: z.string().optional(),
});

export const weatherToolStub: ToolDefinition<z.infer<typeof weatherArgs>, { note: string }> = {
  name: "weather_forecast",
  description: "查询目的地天气（占位，待接入真实服务）",
  argsSchema: weatherArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<{ note: string }>> {
    return { ok: true, data: { note: `weather stub: ${args.city}` } };
  },
};

export const mapsRouteToolStub: ToolDefinition<z.infer<typeof routeArgs>, { note: string }> = {
  name: "maps_route_estimate",
  description: "估计路程与耗时（占位，待接入真实服务）",
  argsSchema: routeArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<{ note: string }>> {
    return { ok: true, data: { note: `route stub: ${args.origin}→${args.destination}` } };
  },
};

export const calendarToolStub: ToolDefinition<z.infer<typeof calendarArgs>, { note: string }> = {
  name: "calendar_conflict_check",
  description: "日程冲突检测（占位，待接入真实日历/适配器）",
  argsSchema: calendarArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<{ note: string }>> {
    return { ok: true, data: { note: `calendar stub: ${args.proposedStart}-${args.proposedEnd}` } };
  },
};
