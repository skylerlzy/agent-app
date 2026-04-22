/**
 * 主题工具占位定义（框架层）。
 * 真实 HTTP/SDK 调用由成员3 在各工具文件中实现，并注册进 ToolRegistry。
 */
import { z } from "zod";
import type { ToolContext, ToolDefinition, ToolResult } from "../contracts";

/** 成员4：本地联调 Reflexion 时可通过 AGENT_REFLEXION_DEMO 注入失败（勿用于生产） */
let reflexionDemoWeatherAttempt = 0;

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
  description: "查询目的地天气（已接入真实 API）",
  argsSchema: weatherArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<any>> {
    const demo = process.env.AGENT_REFLEXION_DEMO;
    if (demo === "retry_success") {
      reflexionDemoWeatherAttempt += 1;
      if (reflexionDemoWeatherAttempt === 1) {
        return {
          ok: false,
          error: {
            code: "TRANSIENT",
            message: "上游天气服务暂时不可用（演示：第一次失败，重试应成功）",
            retryable: true,
          },
        };
      }
    }
    if (demo === "skip") {
      return {
        ok: false,
        error: {
          code: "NO_DATA",
          message: "无法解析该城市天气（演示：不可重试，应跳过本步）",
          retryable: false,
        },
      };
    }
    if (demo === "abort") {
      return {
        ok: false,
        error: {
          code: "AGENT_ABORT",
          message: "认证或配额失败（演示：应终止运行）",
          retryable: false,
        },
      };
    }

    try {
      const apiKey = process.env.OPEN_WEATHER_MAP_API_KEY;
      if (!apiKey) {
        return {
          ok: false,
          error: {
            code: "NO_API_KEY",
            message: "缺少天气 API Key",
            retryable: false,
          },
        };
      }

      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
          args.city
      )}&appid=${apiKey}&units=metric`;

      const res = await fetch(url);
      if (!res.ok) {
        return {
          ok: false,
          error: {
            code: "HTTP_ERROR",
            message: `天气接口错误: ${res.status}`,
            retryable: res.status >= 500,
          },
        };
      }

      const data = await res.json();

      return {
        ok: true,
        data: {
          city: data.name,
          temperature: data.main.temp,
          weather: data.weather?.[0]?.description,
        },
      };
    } catch (e: any) {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: e.message,
          retryable: true,
        },
      };
    }
  },
};

export const mapsRouteToolStub: ToolDefinition<z.infer<typeof routeArgs>, { note: string }> = {
  name: "maps_route_estimate",
  description: "估计路程与耗时（使用高德地图 API）",
  argsSchema: routeArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const key = process.env.AMAP_WEBSERVICE_KEY;
      if (!key) {
        return {
          ok: false,
          error: {
            code: "NO_API_KEY",
            message: "缺少地图 API Key",
            retryable: false,
          },
        };
      }

      // 关键字查询（可升级为坐标）
      const url = `https://restapi.amap.com/v3/direction/driving?origin=${encodeURIComponent(
          args.origin
      )}&destination=${encodeURIComponent(args.destination)}&key=${key}`;

      const res = await fetch(url);
      if (!res.ok) {
        return {
          ok: false,
          error: {
            code: "HTTP_ERROR",
            message: `地图接口错误: ${res.status}`,
            retryable: res.status >= 500,
          },
        };
      }

      const data = await res.json();

      const route = data.route?.paths?.[0];

      return {
        ok: true,
        data: {
          distance: route?.distance,
          duration: route?.duration,
        },
      };
    } catch (e: any) {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: e.message,
          retryable: true,
        },
      };
    }
  },
};

export const calendarToolStub: ToolDefinition<z.infer<typeof calendarArgs>, { note: string }> = {
  name: "calendar_conflict_check",
  description: "检测时间是否与已有日程冲突（本地实现）",
  argsSchema: calendarArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const busy = _ctx.userContext?.calendarBusyWindows || [];

      const conflict = busy.find(
          (b) =>
              !(args.proposedEnd <= b.start || args.proposedStart >= b.end)
      );

      if (conflict) {
        return {
          ok: true,
          data: {
            conflict: true,
            conflictWith: conflict.label || "已有安排",
          },
        };
      }

      return {
        ok: true,
        data: {
          conflict: false,
        },
      };
    } catch (e: any) {
      return {
        ok: false,
        error: {
          code: "CALENDAR_ERROR",
          message: e.message,
          retryable: false,
        },
      };
    }
  },
};
