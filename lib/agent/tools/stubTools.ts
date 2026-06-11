/**
 * 主题工具占位定义（框架层）。
 * 外部 API 失败时抛错，由上层 Agent / Convex action 捕获并向用户展示。
 */
import { z } from "zod";
import { fetchWithTimeout } from "../http/fetchWithTimeout";
import type { ToolContext, ToolDefinition, ToolResult } from "../contracts";
import { TOOL_LLM_DESCRIPTIONS } from "./descriptions";
import { inferCityFromText } from "./ToolArgumentValidator";

function toolHttpTimeoutMs(): number {
  const raw = process.env.TOOL_HTTP_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 45_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3_000 ? n : 45_000;
}

/** 与 travel-planner-ai `convex/location.ts` 一致：地理编码得到「经度,纬度」供 direction 接口使用 */
type AmapGeoPoint = { lng: number; lat: number; adcode?: string; formattedAddress?: string };

async function amapGeocodeToPoint(address: string, apiKey: string): Promise<AmapGeoPoint | null> {
  const q = address.trim();
  if (!q) return null;
  const cityHint = inferCityFromText(q);
  const params = new URLSearchParams({
    address: q,
    key: apiKey,
  });
  if (cityHint) params.set("city", cityHint);
  const geoUrl = `https://restapi.amap.com/v3/geocode/geo?${params.toString()}`;

  const geoRes = await fetchWithTimeout(
    geoUrl,
    {},
    toolHttpTimeoutMs(),
    "高德地理编码请求超时",
    "amap:geocode"
  );
  if (!geoRes.ok) {
    return null;
  }
  const geoData = (await geoRes.json()) as {
    status?: string;
    geocodes?: { location?: string; adcode?: string; formatted_address?: string }[];
  };
  if (String(geoData.status) !== "1" || !geoData.geocodes?.length) {
    return null;
  }
  const g0 = geoData.geocodes[0];
  const loc = g0?.location;
  if (!loc || typeof loc !== "string") return null;
  const parts = loc.split(",").map((s) => Number(s.trim()));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }
  const ad = g0?.adcode;
  return {
    lng: parts[0],
    lat: parts[1],
    adcode: typeof ad === "string" && /^\d{6}$/.test(ad) ? ad : undefined,
    formattedAddress: typeof g0?.formatted_address === "string" ? g0.formatted_address : undefined,
  };
}

const MAX_SAME_CITY_OD_KM = 120;

function validateGeocodePair(
  origin: string,
  destination: string,
  originPt: AmapGeoPoint,
  destPt: AmapGeoPoint
): string | null {
  const oc = inferCityFromText(origin);
  const dc = inferCityFromText(destination);
  const distKm = haversineMeters(originPt.lng, originPt.lat, destPt.lng, destPt.lat) / 1000;
  if (oc && dc && oc === dc && distKm > MAX_SAME_CITY_OD_KM) {
    return `起终点均含「${oc}」但地理编码相距约 ${distKm.toFixed(0)} km，疑似 POI 歧义。请改用「${oc}+具体 POI」如「${oc.replace(/市$/u, "")}市南山区深圳湾公园南门」。`;
  }
  if ((oc || dc) && distKm > 500 && oc !== dc) {
    /* 跨城长距离由后续 transit 拒绝或驾车回退处理 */
    return null;
  }
  if (oc && !dc && distKm > MAX_SAME_CITY_OD_KM) {
    return `起点含「${oc}」但与终点相距约 ${distKm.toFixed(0)} km；请为 destination 补全「城市+具体 POI」。`;
  }
  if (dc && !oc && distKm > MAX_SAME_CITY_OD_KM) {
    return `终点含「${dc}」但与起点相距约 ${distKm.toFixed(0)} km；请为 origin 补全「城市+具体 POI」。`;
  }
  return null;
}

/** 取首段并去掉行政区划后缀，便于和风 [GeoAPI 城市搜索](https://dev.qweather.com/docs/api/geoapi/city-lookup) 命中 */
function normalizeCityQuery(raw: string): string {
  const first = raw.split(/[,，\-]/)[0]?.trim() ?? raw.trim();
  return first.replace(/(市|省|自治区|特别行政区)$/u, "").trim();
}

/**
 * 和风 API Host（控制台-设置中的专属域名）。
 * @see https://dev.qweather.com/docs/configuration/api-host/
 */
function qweatherApiBase(): string {
  const raw = process.env.QWEATHER_API_HOST?.trim();
  const host = raw
    ? raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
    : "devapi.qweather.com";
  return `https://${host}`;
}

function qweatherHeaders(apiKey: string): HeadersInit {
  return { "X-QW-Api-Key": apiKey };
}

function buildQweatherUrl(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") params.set(k, v);
  }
  const q = params.toString();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${qweatherApiBase()}${p}${q ? `?${q}` : ""}`;
}

type QwCityRow = { name?: string; id?: string; lat?: string; lon?: string; adm1?: string };

async function qweatherCityLookupOne(
  apiKey: string,
  locationQuery: string,
  debugSuffix: string
): Promise<QwCityRow | null> {
  const q = locationQuery.trim();
  if (!q) return null;
  const hasHan = /[\u4e00-\u9fff]/.test(q);
  const url = buildQweatherUrl("/geo/v2/city/lookup", {
    location: q,
    number: "5",
    lang: "zh",
    ...(hasHan ? { range: "cn" } : {}),
  });
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      { headers: qweatherHeaders(apiKey) },
      toolHttpTimeoutMs(),
      "和风 GeoAPI 请求超时（可调 TOOL_HTTP_TIMEOUT_MS）",
      `qweather:geo:${debugSuffix}`
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: { code?: string; location?: QwCityRow[] };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }
  if (body.code !== "200" || !Array.isArray(body.location) || body.location.length === 0) {
    return null;
  }
  const row = body.location[0];
  if (!row?.id) return null;
  return row;
}

async function resolveQweatherLocation(
  cityRaw: string,
  apiKey: string
): Promise<{ id: string; displayName: string; lat?: string; lon?: string } | null> {
  const trimmed = cityRaw.trim();
  const normalized = normalizeCityQuery(trimmed);
  const candidates = [...new Set([normalized, trimmed].filter((s) => s.length > 0))];

  for (const c of candidates) {
    const row = await qweatherCityLookupOne(apiKey, c, c.slice(0, 20));
    if (row?.id) {
      const displayName = [row.name, row.adm1].filter(Boolean).join(" · ") || row.id;
      return { id: row.id, displayName, lat: row.lat, lon: row.lon };
    }
  }
  return null;
}

function daysFromToday(iso: string): number {
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${iso}T12:00:00`);
  return Math.round((target.getTime() - todayLocal.getTime()) / 86_400_000);
}

function pickForecastPath(daysAhead: number): "/v7/weather/7d" | "/v7/weather/15d" | "/v7/weather/30d" | null {
  if (daysAhead <= 7) return "/v7/weather/7d";
  if (daysAhead <= 15) return "/v7/weather/15d";
  if (daysAhead <= 30) return "/v7/weather/30d";
  return null;
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 与和风 v7/weather/7d daily 项对齐（供 outlook 摘要复用） */
type QwDailyRow = {
  fxDate?: string;
  tempMax?: string;
  tempMin?: string;
  textDay?: string;
  textNight?: string;
  precip?: string;
};

const weatherArgs = z.object({ city: z.string().min(1), dateIso: z.string().optional() });
const routeArgs = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  mode: z.enum(["transit", "driving", "walking"]),
});

function formatOutlookFromDaily(daily: QwDailyRow[], maxDays: number): string {
  const rows = daily.slice(0, maxDays);
  return rows
    .map((d) => {
      const bits = [
        d.fxDate,
        d.textDay && `白天${d.textDay}`,
        d.textNight && `夜间${d.textNight}`,
        d.tempMin != null && d.tempMax != null && `${d.tempMin}~${d.tempMax}℃`,
        d.precip != null && Number(d.precip) > 0 && `降水约${d.precip}mm`,
      ].filter(Boolean) as string[];
      return bits.join(" ");
    })
    .filter((s) => s.length > 0)
    .join("；");
}

function formatDurationHuman(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 60) return `约 ${m} 分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `约 ${h} 小时 ${rm} 分钟` : `约 ${h} 小时`;
}

export const weatherToolStub: ToolDefinition<z.infer<typeof weatherArgs>, { note: string }> = {
  name: "weather_forecast",
  description: TOOL_LLM_DESCRIPTIONS.weather_forecast,
  argsSchema: weatherArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<any>> {
    const apiKey = process.env.QWEATHER_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: "MISSING_CONFIG",
          message:
            "缺少 QWEATHER_API_KEY：请在控制台创建 API KEY 凭据，并写入 Convex Dashboard / .env.local。可选 QWEATHER_API_HOST（控制台-设置中的专属 API Host，不含 https://）。",
          retryable: false,
        },
      };
    }

    let loc: { id: string; displayName: string; lat?: string; lon?: string } | null;
    try {
      loc = await resolveQweatherLocation(args.city, apiKey);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: {
          code: "QWEATHER_NETWORK",
          message,
          retryable: true,
          cause: e,
        },
      };
    }

    if (!loc) {
      return {
        ok: false,
        error: {
          code: "QWEATHER_GEO",
          message: `和风 GeoAPI 无匹配城市：无法解析「${args.city}」。可尝试「深圳」「北京市」或更完整的行政区名称；中文查询会自动加 range=cn。详见 https://dev.qweather.com/docs/api/geoapi/city-lookup`,
          retryable: false,
        },
      };
    }

    const wantDate = args.dateIso?.trim();
    const useForecast = wantDate && DATE_ISO.test(wantDate);

    const fetchJson = async (
      path: string,
      query: Record<string, string | undefined>,
      timeoutLabel: string,
      tag: string
    ): Promise<{ ok: boolean; status: number; body: unknown }> => {
      const url = buildQweatherUrl(path, query);
      const res = await fetchWithTimeout(
        url,
        { headers: qweatherHeaders(apiKey) },
        toolHttpTimeoutMs(),
        timeoutLabel,
        tag
      );
      const status = res.status;
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { ok: res.ok, status, body };
    };

    let summaryNote: string | undefined;
    let doNotRetrySameArgs = false;
    let forecastSource: "7d" | "15d" | "30d" | "now" | undefined;
    let city = loc.displayName;
    let temperature: number | undefined;
    let weather: string | undefined;
    let tempMin: number | undefined;
    let tempMax: number | undefined;
    let precipMm: number | undefined;
    /** 复用同一次 daily 响应生成 weekOutlook，避免重复请求 */
    let cachedDaily: QwDailyRow[] | undefined;

    if (useForecast && wantDate) {
      const daysAhead = daysFromToday(wantDate);
      const forecastPath = pickForecastPath(daysAhead);
      if (forecastPath === null) {
        summaryNote = `请求的 ${wantDate} 超出 30 日预报范围，已改读实时天气；请勿对同参重复调用。`;
        doNotRetrySameArgs = true;
      } else {
        forecastSource = forecastPath.replace("/v7/weather/", "") as "7d" | "15d" | "30d";
        try {
          const r = await fetchJson(
            forecastPath,
            { location: loc.id, lang: "zh", unit: "m" },
            `和风 ${forecastSource} 预报请求超时（可调 TOOL_HTTP_TIMEOUT_MS）`,
            `qweather:${forecastSource}:${loc.id}`
          );
          const body = r.body as { code?: string; daily?: QwDailyRow[] } | null;
          if (r.ok && body?.code === "200" && Array.isArray(body.daily)) {
            cachedDaily = body.daily;
            const day = body.daily.find((d) => d.fxDate === wantDate);
            if (day) {
              tempMax = day.tempMax != null ? Number(day.tempMax) : undefined;
              tempMin = day.tempMin != null ? Number(day.tempMin) : undefined;
              precipMm = day.precip != null ? Number(day.precip) : undefined;
              temperature = tempMax;
              const parts = [
                day.textDay && `白天${day.textDay}`,
                day.textNight && `夜间${day.textNight}`,
                tempMax != null && tempMin != null && `气温 ${tempMin}°C～${tempMax}°C`,
                precipMm != null && !Number.isNaN(precipMm) && `降水量约 ${precipMm} mm`,
              ].filter(Boolean) as string[];
              weather =
                parts.length > 0
                  ? parts.join("；")
                  : [day.textDay, day.textNight].filter(Boolean).join("，") || undefined;
              summaryNote = `预报日 ${wantDate}（和风 weather/${forecastSource}）`;
            } else {
              summaryNote = `请求的 ${wantDate} 不在本次 ${forecastSource} 返回日期内，已改读实时天气。`;
              doNotRetrySameArgs = true;
            }
          } else {
            const code =
              body && typeof body === "object" && "code" in body
                ? String((body as { code: unknown }).code)
                : "?";
            summaryNote = `${forecastSource} 预报不可用（code=${code}），已改读实时天气。`;
            doNotRetrySameArgs = true;
          }
        } catch (e) {
          summaryNote = `${forecastSource ?? "daily"} 预报请求失败：${e instanceof Error ? e.message : String(e)}；已尝试实时天气。`;
          doNotRetrySameArgs = true;
        }
      }
    }

    if (weather === undefined) {
      try {
        const r = await fetchJson(
          "/v7/weather/now",
          { location: loc.id, lang: "zh", unit: "m" },
          "和风实时天气请求超时（可调 TOOL_HTTP_TIMEOUT_MS）",
          `qweather:now:${loc.id}`
        );
        const body = r.body as { code?: string; now?: { temp?: string; text?: string } } | null;
        if (!r.ok || !body || body.code !== "200" || !body.now) {
          const code = body && typeof body === "object" && "code" in body ? String((body as { code: unknown }).code) : "?";
          const textSnippet =
            body && typeof body === "object" ? JSON.stringify(body).slice(0, 180) : `HTTP ${r.status}`;
          return {
            ok: false,
            error: {
              code: "QWEATHER_HTTP",
              message: `和风实时天气失败：code=${code} ${textSnippet}`,
              retryable: r.status >= 500 || r.status === 429,
            },
          };
        }
        temperature = body.now.temp != null ? Number(body.now.temp) : undefined;
        weather = body.now.text;
        if (!summaryNote) {
          summaryNote = "实时天气（和风 weather/now）";
          forecastSource = "now";
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          ok: false,
          error: {
            code: "QWEATHER_NETWORK",
            message,
            retryable: true,
            cause: e,
          },
        };
      }
    }

    let airQualityAqi: number | undefined;
    let airQualityCategory: string | undefined;
    let pm2p5: number | undefined;
    let airQualityAvailable = false;

    const tryAirV1 = async (): Promise<boolean> => {
      if (!loc.lat || !loc.lon) return false;
      try {
        const airR = await fetchJson(
          `/airquality/v1/current/${loc.lat}/${loc.lon}`,
          {},
          "和风 airquality/v1 请求超时",
          `qweather:airv1:${loc.id}`
        );
        const airBody = airR.body as {
          indexes?: { code?: string; aqi?: number; category?: string }[];
          pollutants?: { code?: string; concentration?: { value?: number } }[];
        } | null;
        if (!airR.ok || !airBody?.indexes?.length) return false;
        const cn = airBody.indexes.find((i) => i.code === "cn-mee") ?? airBody.indexes[0];
        if (cn?.aqi != null) airQualityAqi = Number(cn.aqi);
        if (cn?.category) airQualityCategory = cn.category;
        const pm = airBody.pollutants?.find((p) => p.code === "pm2p5");
        if (pm?.concentration?.value != null) pm2p5 = Number(pm.concentration.value);
        return airQualityAqi != null || !!airQualityCategory;
      } catch {
        return false;
      }
    };

    airQualityAvailable = await tryAirV1();
    if (!airQualityAvailable) {
      try {
        const airR = await fetchJson(
          "/v7/air/now",
          { location: loc.id, lang: "zh" },
          "和风 v7/air/now 请求超时",
          `qweather:air:${loc.id}`
        );
        const airBody = airR.body as {
          code?: string;
          now?: { aqi?: string; category?: string; pm2p5?: string };
        } | null;
        if (airR.ok && airBody?.code === "200" && airBody.now) {
          airQualityAqi = airBody.now.aqi != null ? Number(airBody.now.aqi) : undefined;
          airQualityCategory = airBody.now.category;
          pm2p5 = airBody.now.pm2p5 != null ? Number(airBody.now.pm2p5) : undefined;
          airQualityAvailable =
            airQualityAqi != null || !!airQualityCategory || pm2p5 != null;
        }
      } catch {
        /* 空气质量为增强项 */
      }
    }

    if (airQualityAvailable) {
      const airBits = [
        airQualityCategory && `空气质量 ${airQualityCategory}`,
        airQualityAqi != null && !Number.isNaN(airQualityAqi) && `AQI ${airQualityAqi}`,
        pm2p5 != null && !Number.isNaN(pm2p5) && `PM2.5 ${pm2p5}`,
      ].filter(Boolean) as string[];
      if (airBits.length && weather) {
        weather = `${weather}；${airBits.join("，")}`;
      } else if (airBits.length) {
        weather = airBits.join("，");
      }
    }

    let weekOutlookText: string | undefined;
    if (cachedDaily?.length) {
      weekOutlookText = formatOutlookFromDaily(cachedDaily, 7);
    } else {
      try {
        const r7 = await fetchJson(
          "/v7/weather/7d",
          { location: loc.id, lang: "zh", unit: "m" },
          "和风 7 日预报（outlook）请求超时",
          `qweather:7d-outlook:${loc.id}`
        );
        const b7 = r7.body as { code?: string; daily?: QwDailyRow[] } | null;
        if (r7.ok && b7?.code === "200" && Array.isArray(b7.daily) && b7.daily.length > 0) {
          weekOutlookText = formatOutlookFromDaily(b7.daily, 7);
        }
      } catch {
        /* outlook 为增强项 */
      }
    }

    return {
      ok: true,
      data: {
        provider: "qweather",
        locationId: loc.id,
        city,
        temperature,
        tempMin,
        tempMax,
        precipMm,
        weather,
        airQualityAqi,
        airQualityCategory,
        pm2p5,
        airQualityAvailable,
        dateIso: wantDate && DATE_ISO.test(wantDate) ? wantDate : undefined,
        note: summaryNote,
        weekOutlookText,
        forecastSource,
        doNotRetrySameArgs,
        capabilities: {
          dailyForecastMaxDays: 30,
          hasHourlyPrecipProbability: false,
          returnsRealtime: true,
          sameArgsWillNotAddFields: true,
        },
      },
    };
  },
};

/** 大圆距离（米），用于高德 OVER_DIRECTION_RANGE 等无法路网规划时的回退 */
function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isOverDirectionRange(message: string | undefined): boolean {
  return !!message && /OVER_DIRECTION_RANGE|DIRECTION_RANGE|距离过长|超出.*范围/i.test(message);
}

/** 路网不可规划超长 OD 时：粗估尺度 + 耗时，避免 ReAct 反复失败 */
function buildRangeExceededFallback(
  originPt: AmapGeoPoint,
  destPt: AmapGeoPoint
): { distance: string; duration: string; note: string } {
  const straight = haversineMeters(originPt.lng, originPt.lat, destPt.lng, destPt.lat);
  const roadM = Math.max(1000, Math.round(straight * 1.28));
  const avgMps = 80000 / 3600;
  const sec = Math.max(180, Math.round(roadM / avgMps));
  const km = (roadM / 1000).toFixed(0);
  const min = Math.round(sec / 60);
  return {
    distance: String(roadM),
    duration: String(sec),
    note: `高德路径接口返回 **OVER_DIRECTION_RANGE**（起终点间距超出驾车/公交可规划范围或跨海等）。已使用**大圆距离×1.28**粗估道路尺度约 **${km} km**，并按约 **80 km/h** 粗估 **${min} 分钟**（非真实导航路径）。跨省长途请以 **12306 / 民航** 为准；若仅需市内接驳请改短 OD 再调本工具。`,
  };
}

export const mapsRouteToolStub: ToolDefinition<z.infer<typeof routeArgs>, { note: string }> = {
  name: "maps_route_estimate",
  description: TOOL_LLM_DESCRIPTIONS.maps_route_estimate,
  argsSchema: routeArgs,
  async execute(args, _ctx: ToolContext): Promise<ToolResult<any>> {
    const key = process.env.AMAP_WEBSERVICE_KEY;
    if (!key) {
      return {
        ok: false,
        error: {
          code: "MISSING_CONFIG",
          message:
            "缺少 AMAP_WEBSERVICE_KEY：请在 Convex Dashboard 与本地 .env.local 中配置，勿硬编码进仓库。",
          retryable: false,
        },
      };
    }

    const originPt = await amapGeocodeToPoint(args.origin, key);
    const destPt = await amapGeocodeToPoint(args.destination, key);
    if (!originPt || !destPt) {
      return {
        ok: false,
        error: {
          code: "AMAP_GEOCODE",
          message: `无法将起终点解析为坐标。请使用「城市+具体 POI」格式（如「深圳市深圳北站」「深圳市南山区深圳湾公园南门」）。origin=${args.origin} destination=${args.destination}`,
          retryable: true,
        },
      };
    }

    const geocodeMismatch = validateGeocodePair(args.origin, args.destination, originPt, destPt);
    if (geocodeMismatch) {
      return {
        ok: false,
        error: {
          code: "AMAP_GEOCODE_MISMATCH",
          message: geocodeMismatch,
          retryable: true,
        },
      };
    }

    const straightKm =
      haversineMeters(originPt.lng, originPt.lat, destPt.lng, destPt.lat) / 1000;
    const crossCityByAdcode =
      originPt.adcode &&
      destPt.adcode &&
      String(originPt.adcode).slice(0, 4) !== String(destPt.adcode).slice(0, 4);

    if (args.mode === "transit" && (crossCityByAdcode || straightKm > 50)) {
      return {
        ok: false,
        error: {
          code: "AMAP_TRANSIT_CROSS_CITY",
          message: `跨城或 >50km 距离禁止使用 mode=transit（${args.origin}→${args.destination}，直线约 ${straightKm.toFixed(0)} km）。铁路/高铁请文字说明并提示 12306；若仅需驾车尺度参考请改用 mode=driving。`,
          retryable: false,
        },
      };
    }

    const originCoord = `${originPt.lng},${originPt.lat}`;
    const destCoord = `${destPt.lng},${destPt.lat}`;

    const buildDirectionUrl = (mode: "transit" | "driving" | "walking"): string | null => {
      const apiByMode = {
        driving: "driving",
        walking: "walking",
        transit: "transit/integrated",
      } as const;
      const modePath = apiByMode[mode];
      if (mode === "transit") {
        if (!originPt.adcode || !destPt.adcode) return null;
        return `https://restapi.amap.com/v3/direction/${modePath}?origin=${encodeURIComponent(
          originCoord
        )}&destination=${encodeURIComponent(destCoord)}&city=${encodeURIComponent(
          originPt.adcode
        )}&cityd=${encodeURIComponent(destPt.adcode)}&key=${encodeURIComponent(key)}`;
      }
      return `https://restapi.amap.com/v3/direction/${modePath}?origin=${encodeURIComponent(
        originCoord
      )}&destination=${encodeURIComponent(destCoord)}&key=${encodeURIComponent(key)}`;
    };

    const callDirection = async (
      mode: "transit" | "driving" | "walking",
      tag: string
    ): Promise<{
      status?: string | number;
      info?: string;
      route?: { paths?: { distance?: string; duration?: string }[] };
    } | null> => {
      const url = buildDirectionUrl(mode);
      if (!url) return null;
      let res: Response;
      try {
        res = await fetchWithTimeout(
          url,
          {},
          toolHttpTimeoutMs(),
          "高德路径接口请求超时（可调 TOOL_HTTP_TIMEOUT_MS）",
          tag
        );
      } catch {
        return null;
      }
      if (!res.ok) return null;
      try {
        return (await res.json()) as {
          status?: string | number;
          info?: string;
          route?: { paths?: { distance?: string; duration?: string }[] };
        };
      } catch {
        return null;
      }
    };

    const parseOk = (data: {
      status?: string | number;
      info?: string;
      route?: { paths?: { distance?: string; duration?: string }[] };
    } | null): { distance: string | undefined; duration: string | undefined; err?: string } => {
      if (!data || String(data.status) !== "1") {
        const info = data ? String(data.info ?? data.status) : "无响应";
        return { distance: undefined, duration: undefined, err: info };
      }
      const route = data.route?.paths?.[0];
      return { distance: route?.distance, duration: route?.duration };
    };

    if (args.mode === "transit" && (!originPt.adcode || !destPt.adcode)) {
      return {
        ok: false,
        error: {
          code: "AMAP_TRANSIT_PARAMS",
          message:
            "公交路径规划需要起点与终点行政区 adcode，当前地理编码结果未返回 adcode；请改用 driving/walking，或输入更完整地址。",
          retryable: true,
        },
      };
    }

    let usedMode: string = args.mode;
    let noteExtra = "";
    let data = await callDirection(args.mode, `amap:${args.mode}`);
    let parsed = parseOk(data);

    const applyHaversineFallback = (): void => {
      const fb = buildRangeExceededFallback(originPt, destPt);
      parsed = { distance: fb.distance, duration: fb.duration };
      data = {
        status: "1",
        info: "FALLBACK_HAVERSINE",
        route: { paths: [{ distance: fb.distance, duration: fb.duration }] },
      };
      usedMode = "estimated_fallback";
      noteExtra = [noteExtra, fb.note].filter(Boolean).join(" ");
    };

    if (parsed.err && args.mode === "transit") {
      if (isOverDirectionRange(parsed.err)) {
        const driveData = await callDirection("driving", "amap:transit-overrange-driving");
        const d2 = parseOk(driveData);
        if (!d2.err && d2.distance != null && d2.duration != null) {
          data = driveData;
          parsed = d2;
          usedMode = "driving";
          noteExtra =
            "公交路径对该 OD 不可规划（含 OVER_DIRECTION_RANGE）；已改驾车路网。**高铁请以 12306 为准。**";
        } else {
          applyHaversineFallback();
        }
      } else {
        const driveData = await callDirection("driving", "amap:transit-fallback-driving");
        const d2 = parseOk(driveData);
        if (!d2.err && d2.distance != null && d2.duration != null) {
          data = driveData;
          parsed = d2;
          usedMode = "driving";
          noteExtra =
            "高德「公交/地铁」路径主要覆盖同城出行，跨城或枢纽间常无有效 transit 响应；已自动改用 **驾车路网** 给出大致距离与耗时。**高铁直达请以 12306 为准。**";
        } else if (d2.err && isOverDirectionRange(d2.err)) {
          applyHaversineFallback();
        } else {
          return {
            ok: false,
            error: {
              code: "AMAP_STATUS",
              message: `高德公交路径失败: ${parsed.err}；驾车回退仍失败: ${d2.err ?? "无数据"}。`,
              retryable: true,
            },
          };
        }
      }
    }

    if (parsed.err && args.mode !== "transit") {
      if (isOverDirectionRange(parsed.err)) {
        applyHaversineFallback();
      } else {
        const info = parsed.err;
        const keyPlatformMismatch = /USERKEY_PLAT_NOMATCH|INVALID_USER_KEY|USER_KEY_RECYCLED/i.test(info);
        const invalidParams = /INVALID_PARAMS/i.test(info);
        return {
          ok: false,
          error: {
            code: "AMAP_STATUS",
            message: keyPlatformMismatch
              ? `${info} — Key 类型与「Web服务」接口不匹配：请在 https://console.amap.com 创建「Web服务」类型 Key 填入 AMAP_WEBSERVICE_KEY（勿使用仅用于 Android/iOS SDK 的 Key）。`
              : invalidParams
                ? `${info} — 路径接口要求经纬度坐标；本工具已自动地理编码。若仍失败请检查起终点是否过泛，或尝试 mode=driving。`
                : `高德业务状态非成功: ${info}`,
            retryable: !keyPlatformMismatch,
          },
        };
      }
    }

    let distance = parsed.distance != null ? String(parsed.distance) : undefined;
    let duration = parsed.duration != null ? String(parsed.duration) : undefined;

    const crossCity = crossCityByAdcode;

    if (
      args.mode === "transit" &&
      usedMode === "transit" &&
      (distance == null ||
        duration == null ||
        distance === "" ||
        duration === "" ||
        crossCity)
    ) {
      const driveData = await callDirection("driving", "amap:transit-fallback-driving");
      const d2 = parseOk(driveData);
      if (d2.distance != null && d2.duration != null && !d2.err) {
        distance = String(d2.distance);
        duration = String(d2.duration);
        usedMode = "driving";
        noteExtra =
          "高德「公交/地铁」路径主要覆盖同城出行，跨城（尤其高铁枢纽间）常无有效 transit 方案；已自动改用 **驾车路网** 给出大致距离与耗时，供时空尺度参考。**高铁直达时刻请以 12306 为准。**";
      } else if (d2.err && isOverDirectionRange(d2.err)) {
        applyHaversineFallback();
        distance = parsed.distance != null ? String(parsed.distance) : undefined;
        duration = parsed.duration != null ? String(parsed.duration) : undefined;
      }
    }

    if (distance == null || duration == null || distance === "" || duration === "") {
      return {
        ok: false,
        error: {
          code: "AMAP_STATUS",
          message:
            "未解析到有效路径（含公交回退驾车后仍为空）。请检查起终点表述，或显式指定 mode=driving。",
          retryable: true,
        },
      };
    }

    const distanceMeters = Number(distance);
    const durationSeconds = Number(duration);
    const distanceKm =
      Number.isFinite(distanceMeters) && distanceMeters > 0
        ? Math.round((distanceMeters / 1000) * 10) / 10
        : undefined;
    const durationMinutes =
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? Math.round(durationSeconds / 60)
        : undefined;
    const durationHuman = Number.isFinite(durationSeconds) ? formatDurationHuman(durationSeconds) : undefined;

    let tollsYuan: number | undefined;
    try {
      const path0 = (data as { route?: { paths?: Record<string, unknown>[] } })?.route?.paths?.[0];
      const tolls = path0 && typeof path0 === "object" && "tolls" in path0 ? Number((path0 as { tolls?: string }).tolls) : NaN;
      if (Number.isFinite(tolls) && tolls >= 0) tollsYuan = tolls;
    } catch {
      /* tolls 非所有 Key 类型都返回 */
    }

    return {
      ok: true,
      data: {
        mode: args.mode,
        modeUsedForMetrics: usedMode,
        origin: args.origin,
        destination: args.destination,
        originResolved: originCoord,
        destinationResolved: destCoord,
        originFormattedAddress: originPt.formattedAddress,
        destinationFormattedAddress: destPt.formattedAddress,
        distanceMeters,
        durationSeconds,
        distanceKm,
        durationMinutes,
        durationHuman,
        tollsYuan,
        transitAvailable: usedMode === "transit",
        crossCityHint: crossCity
          ? "起终点行政区不同：若为跨城长距离，驾车/路网耗时与高铁直达不同，请以铁路售票为准。"
          : undefined,
        note: noteExtra || "OK",
        doNotRetrySameArgs: false,
      },
    };
  },
};

const poiArgs = z.object({
  keywords: z.string().min(1),
  city: z.string().min(1),
  types: z.string().optional(),
});

type PoiRow = {
  id?: string;
  name?: string;
  type?: string;
  typecode?: string;
  address?: string;
  location?: string;
  tel?: string;
};

export const poiSearchTool: ToolDefinition<
  z.infer<typeof poiArgs>,
  { pois: unknown[]; total: number; note: string }
> = {
  name: "poi_search",
  description: TOOL_LLM_DESCRIPTIONS.poi_search,
  argsSchema: poiArgs,
  async execute(args, _ctx): Promise<ToolResult<any>> {
    const key = process.env.AMAP_WEBSERVICE_KEY?.trim();
    if (!key) {
      return {
        ok: false,
        error: {
          code: "MISSING_CONFIG",
          message: "缺少 AMAP_WEBSERVICE_KEY，无法检索 POI。请在 Convex Dashboard 配置高德 Web 服务 Key。",
          retryable: false,
        },
      };
    }

    const params = new URLSearchParams({
      keywords: args.keywords.trim(),
      city: args.city.trim(),
      offset: "10",
      page: "1",
      extensions: "base",
      key,
    });
    if (args.types?.trim()) params.set("types", args.types.trim());

    const url = `https://restapi.amap.com/v3/place/text?${params.toString()}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {},
        toolHttpTimeoutMs(),
        "高德 POI 检索请求超时",
        "amap:poi_search"
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: {
          code: "AMAP_POI_NETWORK",
          message: `POI 检索网络异常：${message}。可稍后重试或改用更具体的关键词。`,
          retryable: true,
          cause: e,
        },
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "AMAP_POI_HTTP",
          message: `高德 POI 接口 HTTP ${res.status}，请检查 Key 配额或稍后重试。`,
          retryable: res.status >= 500 || res.status === 429,
        },
      };
    }

    let body: { status?: string | number; info?: string; pois?: PoiRow[]; count?: string };
    try {
      body = (await res.json()) as typeof body;
    } catch (e) {
      return {
        ok: false,
        error: {
          code: "AMAP_POI_PARSE",
          message: "POI 响应解析失败，请重试。",
          retryable: true,
          cause: e,
        },
      };
    }

    if (String(body.status) !== "1") {
      const info = String(body.info ?? body.status ?? "未知错误");
      return {
        ok: false,
        error: {
          code: "AMAP_POI_STATUS",
          message: `POI 检索失败：${info}。请检查 city/keywords 是否有效，或缩小关键词范围后重试。`,
          retryable: true,
        },
      };
    }

    const rawPois = Array.isArray(body.pois) ? body.pois : [];
    const pois = rawPois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      typecode: p.typecode,
      address: p.address,
      location: p.location,
      tel: p.tel,
    }));

    return {
      ok: true,
      data: {
        provider: "amap_place_text",
        city: args.city,
        keywords: args.keywords,
        total: Number(body.count ?? pois.length) || pois.length,
        pois,
        note:
          pois.length > 0
            ? `返回 ${pois.length} 条 POI，供行程规划引用。`
            : "未命中 POI，可换关键词或补充 types 后重试。",
        doNotRetrySameArgs: false,
      },
    };
  },
};

const railArgs = z.object({
  originCity: z.string().min(1),
  destinationCity: z.string().min(1),
  dateIso: z.string().optional(),
});

const RAIL_DISCLAIMER =
  "【免责声明】本工具不提供 12306 实时余票、票价或精确时刻表，仅供参考。购票与改签请以中国铁路 12306 官方渠道为准。";

export const railScheduleHintTool: ToolDefinition<
  z.infer<typeof railArgs>,
  { hints: string[]; disclaimer: string }
> = {
  name: "rail_schedule_hint",
  description: TOOL_LLM_DESCRIPTIONS.rail_schedule_hint,
  argsSchema: railArgs,
  async execute(args): Promise<ToolResult<any>> {
    const origin = args.originCity.trim();
    const dest = args.destinationCity.trim();
    const dateNote = args.dateIso?.trim()
      ? `计划出行日 ${args.dateIso}（须以 12306 当日开行方案为准）。`
      : "未指定日期时，请在 12306 选择具体乘车日查询。";

    const sameCity = origin.replace(/市$/u, "") === dest.replace(/市$/u, "");
    const hints: string[] = [
      RAIL_DISCLAIMER,
      `起讫：${origin} → ${dest}。${dateNote}`,
    ];

    if (sameCity) {
      hints.push("起讫同城：市内出行优先地铁/公交；若误用于铁路查询请改用 maps_route_estimate。");
    } else {
      hints.push(
        "跨城高铁/动车：建议在 12306 搜索「车站名」而非仅城市名（如「南京南」「上海虹桥」）。",
        "换乘：关注「同站换乘」与「异站换乘」时间缓冲，大站建议预留 30–45 分钟。",
        "节假日与周五晚高峰余票紧张，可关注候补购票。"
      );
    }

    return {
      ok: true,
      data: {
        originCity: origin,
        destinationCity: dest,
        dateIso: args.dateIso,
        hints,
        disclaimer: RAIL_DISCLAIMER,
        note: "提示型结果，非实时班次数据。",
        doNotRetrySameArgs: true,
      },
    };
  },
};
