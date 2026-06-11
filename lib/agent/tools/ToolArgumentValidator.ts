import type {
  IToolArgumentValidator,
  ToolArguments,
  ToolError,
  ToolName,
} from "../contracts";

const VAGUE_POI =
  /(?:^|[\s，,])(?:[\u4e00-\u9fff]{1,6}区域|[\u4e00-\u9fff]{0,4}青旅|[\u4e00-\u9fff]{0,4}旅舍)(?:$|[\s，,])/;

const HSR_OR_HUB = /(?:高铁)?(?:南|北|东|西)?站|虹桥|南站|北站|东站|西站/;

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

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

function validateDateIsoOptional(
  raw: unknown,
  fieldLabel: string
): { ok: true; value?: string } | { ok: false; error: ToolError } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: {
        code: "DATE_ISO_INVALID",
        message: `${fieldLabel} 须为 YYYY-MM-DD 字符串。`,
        retryable: true,
      },
    };
  }
  const trimmed = raw.trim();
  if (!DATE_ISO.test(trimmed)) {
    return {
      ok: false,
      error: {
        code: "DATE_ISO_INVALID",
        message: `${fieldLabel} 格式须为 YYYY-MM-DD，当前为「${trimmed}」。`,
        retryable: true,
      },
    };
  }
  return { ok: true, value: trimmed };
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
    const dateCheck = validateDateIsoOptional(args.dateIso, "dateIso");
    if (!dateCheck.ok) return dateCheck;
    return {
      ok: true,
      normalized: { ...args, city, ...(dateCheck.value ? { dateIso: dateCheck.value } : {}) },
    };
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

  if (name === "poi_search") {
    const keywords = typeof args.keywords === "string" ? args.keywords.trim() : "";
    const city = typeof args.city === "string" ? args.city.trim() : "";
    if (!keywords) {
      return {
        ok: false,
        error: {
          code: "POI_KEYWORDS_REQUIRED",
          message: "poi_search 需要非空 keywords（如「中山陵」「亲子餐厅」）。",
          retryable: true,
        },
      };
    }
    if (!city) {
      return {
        ok: false,
        error: {
          code: "POI_CITY_REQUIRED",
          message: "poi_search 需要非空 city（如「南京」「杭州」）。",
          retryable: true,
        },
      };
    }
    return { ok: true, normalized: { ...args, keywords, city } };
  }

  if (name === "rail_schedule_hint") {
    const originCity = typeof args.originCity === "string" ? args.originCity.trim() : "";
    const destinationCity =
      typeof args.destinationCity === "string" ? args.destinationCity.trim() : "";
    if (!originCity || !destinationCity) {
      return {
        ok: false,
        error: {
          code: "RAIL_CITIES_REQUIRED",
          message: "rail_schedule_hint 需要非空 originCity 与 destinationCity。",
          retryable: true,
        },
      };
    }
    const dateCheck = validateDateIsoOptional(args.dateIso, "dateIso");
    if (!dateCheck.ok) return dateCheck;
    return {
      ok: true,
      normalized: {
        ...args,
        originCity,
        destinationCity,
        ...(dateCheck.value ? { dateIso: dateCheck.value } : {}),
      },
    };
  }

  return { ok: true, normalized: args };
}

export class ToolArgumentValidator implements IToolArgumentValidator {
  validate(
    name: ToolName,
    args: ToolArguments
  ): { ok: true; normalized: ToolArguments } | { ok: false; error: ToolError } {
    return validateToolArguments(name, args);
  }
}
