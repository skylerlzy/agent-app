import type { ToolArguments, ToolError, ToolName } from "../contracts";

const VAGUE_POI =
  /(?:^|[\s，,])(?:[\u4e00-\u9fff]{1,6}区域|[\u4e00-\u9fff]{0,4}青旅|[\u4e00-\u9fff]{0,4}旅舍)(?:$|[\s，,])/;

const HSR_OR_HUB = /(?:高铁)?(?:南|北|东|西)?站|虹桥|南站|北站|东站|西站/;

/** 从地址串推断城市（供静态校验） */
export function inferCityFromText(text: string): string | undefined {
  const t = text.trim();
  const m = t.match(/([\u4e00-\u9fff]{2,8}市)/);
  if (m) return m[1];
  for (const c of ["北京", "上海", "天津", "重庆"]) {
    if (t.includes(c)) return `${c}市`;
  }
  return undefined;
}

function isLikelyCrossCityHubTransit(origin: string, dest: string): boolean {
  if (!HSR_OR_HUB.test(origin) && !HSR_OR_HUB.test(dest)) return false;
  const oc = inferCityFromText(origin);
  const dc = inferCityFromText(dest);
  if (oc && dc && oc !== dc) return true;
  // 无城市前缀但明显不同枢纽对（南京南 / 上海虹桥）
  const oHead = origin.replace(/站.*$/u, "").slice(0, 2);
  const dHead = dest.replace(/站.*$/u, "").slice(0, 2);
  return oHead.length >= 2 && dHead.length >= 2 && oHead !== dHead;
}

function isVaguePoi(text: string): boolean {
  const t = text.trim();
  if (inferCityFromText(t)) return false;
  if (VAGUE_POI.test(t)) return true;
  if (/^[\u4e00-\u9fff]{2,4}青旅$/u.test(t)) return true;
  if (/^海上世界站$/u.test(t) && !t.includes("深圳")) return true;
  return false;
}

export function validateToolArguments(
  name: ToolName,
  args: ToolArguments
): { ok: true; normalized: ToolArguments } | { ok: false; error: ToolError } {
  if (name === "weather_forecast") {
    const city = typeof args.city === "string" ? args.city.trim() : "";
    if (!city) {
      return {
        ok: false,
        error: {
          code: "WEATHER_CITY_REQUIRED",
          message: "weather_forecast 需要非空 city（如「南京」「深圳市」）。",
          retryable: true,
        },
      };
    }
    return { ok: true, normalized: { ...args, city } };
  }

  if (name === "maps_route_estimate") {
    const origin = typeof args.origin === "string" ? args.origin.trim() : "";
    const destination = typeof args.destination === "string" ? args.destination.trim() : "";
    const mode = args.mode;

    if (!origin || !destination) {
      return {
        ok: false,
        error: {
          code: "MAPS_OD_REQUIRED",
          message: "maps_route_estimate 需要非空 origin 与 destination。",
          retryable: true,
        },
      };
    }

    if (origin === destination) {
      return {
        ok: false,
        error: {
          code: "MAPS_SAME_OD",
          message: "起终点相同无法规划路径；站内换乘/同站信息请用文字说明，勿调用 maps。",
          retryable: false,
        },
      };
    }

    if (mode === "transit" && isLikelyCrossCityHubTransit(origin, destination)) {
      return {
        ok: false,
        error: {
          code: "MAPS_TRANSIT_CROSS_CITY",
          message: `跨城/高铁枢纽间（${origin}→${destination}）禁止使用 mode=transit。铁路时刻与换乘请文字说明并提示 12306；勿调用 maps。`,
          retryable: false,
        },
      };
    }

    for (const [label, val] of [
      ["origin", origin],
      ["destination", destination],
    ] as const) {
      if (isVaguePoi(val)) {
        return {
          ok: false,
          error: {
            code: "MAPS_VAGUE_POI",
            message: `${label}「${val}」过于模糊，请改为「城市+具体 POI」格式，如「深圳市南山区深圳湾公园南门」「深圳市深圳北站」。`,
            retryable: true,
          },
        };
      }
    }

    return { ok: true, normalized: { ...args, origin, destination } };
  }

  return { ok: true, normalized: args };
}
