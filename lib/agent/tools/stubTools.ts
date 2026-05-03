/**
 * 主题工具占位定义（框架层）。
 * 外部 API 失败时抛错，由上层 Agent / Convex action 捕获并向用户展示。
 */
import { z } from "zod";
import { fetchWithTimeout } from "../http/fetchWithTimeout";
import type { ToolContext, ToolDefinition, ToolResult } from "../contracts";

function toolHttpTimeoutMs(): number {
  const raw = process.env.TOOL_HTTP_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 45_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3_000 ? n : 45_000;
}

/** 与 travel-planner-ai `convex/location.ts` 一致：地理编码得到「经度,纬度」供 direction 接口使用 */
type AmapGeoPoint = { lng: number; lat: number; adcode?: string };

async function amapGeocodeToPoint(address: string, apiKey: string): Promise<AmapGeoPoint | null> {
  const q = address.trim();
  if (!q) return null;
  const geoUrl = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(q)}&city=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`;

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
    geocodes?: { location?: string; adcode?: string }[];
  };
  if (String(geoData.status) !== "1" || !geoData.geocodes?.length) {
    return null;
  }
  const loc = geoData.geocodes[0]?.location;
  if (!loc || typeof loc !== "string") return null;
  const parts = loc.split(",").map((s) => Number(s.trim()));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }
  const ad = geoData.geocodes[0]?.adcode;
  return {
    lng: parts[0],
    lat: parts[1],
    adcode: typeof ad === "string" && /^\d{6}$/.test(ad) ? ad : undefined,
  };
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
): Promise<{ id: string; displayName: string } | null> {
  const trimmed = cityRaw.trim();
  const normalized = normalizeCityQuery(trimmed);
  const candidates = [...new Set([normalized, trimmed].filter((s) => s.length > 0))];

  for (const c of candidates) {
    const row = await qweatherCityLookupOne(apiKey, c, c.slice(0, 20));
    if (row?.id) {
      const displayName = [row.name, row.adm1].filter(Boolean).join(" · ") || row.id;
      return { id: row.id, displayName };
    }
  }
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
  description:
    "查询城市天气与空气质量（和风：GeoAPI → weather/now 与/或 weather/7d 指定日 + v7/air/now）。**可多次调用**：不同 city（出发/目的/中转）、不同 dateIso（行程中多个关键日）；dateIso 须与系统「未来14日」一致。返回中含 weekOutlookText 时对多日穿衣与是否适合户外活动安排很有用。",
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

    let loc: { id: string; displayName: string } | null;
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
    let city = loc.displayName;
    let temperature: number | undefined;
    let weather: string | undefined;
    let tempMin: number | undefined;
    let tempMax: number | undefined;
    let precipMm: number | undefined;
    /** 复用同一次 7d 响应生成 weekOutlook，避免重复请求 */
    let cached7dDaily: QwDailyRow[] | undefined;

    if (useForecast) {
      try {
        const r = await fetchJson(
          "/v7/weather/7d",
          { location: loc.id, lang: "zh", unit: "m" },
          "和风 7 日预报请求超时（可调 TOOL_HTTP_TIMEOUT_MS）",
          `qweather:7d:${loc.id}`
        );
        const body = r.body as { code?: string; daily?: QwDailyRow[] } | null;
        if (r.ok && body?.code === "200" && Array.isArray(body.daily)) {
          cached7dDaily = body.daily;
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
            summaryNote = `预报日 ${wantDate}（和风 weather/7d）`;
          } else {
            summaryNote = `请求的 ${wantDate} 不在本次返回的 7 日预报日期内，已改读实时天气。`;
          }
        } else {
          const code = body && typeof body === "object" && "code" in body ? String((body as { code: unknown }).code) : "?";
          summaryNote = `7 日预报不可用（code=${code}），已改读实时天气。`;
        }
      } catch (e) {
        summaryNote = `7 日预报请求失败：${e instanceof Error ? e.message : String(e)}；已尝试实时天气。`;
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
        if (!summaryNote) summaryNote = "实时天气（和风 weather/now）";
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
    try {
      const airR = await fetchJson(
        "/v7/air/now",
        { location: loc.id, lang: "zh" },
        "和风空气质量请求超时（可调 TOOL_HTTP_TIMEOUT_MS）",
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
    } catch {
      /* 空气质量为增强项，失败不阻断天气 */
    }

    let weekOutlookText: string | undefined;
    if (cached7dDaily?.length) {
      weekOutlookText = formatOutlookFromDaily(cached7dDaily, 7);
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
        dateIso: wantDate && DATE_ISO.test(wantDate) ? wantDate : undefined,
        note: summaryNote,
        weekOutlookText,
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
  description:
    "高德 Web：地理编码 + 路径规划。**可多次调用**以覆盖多段行程（如「东站→景区」「景区→酒店」「酒店→机场」）。origin/destination 可为城市名、区县或具体 POI。mode：同城优先 transit；短距离可 walking；跨城或枢纽间若 transit 空则工具会驾车回退并在 note 中说明。若起终点**过长**导致高德 OVER_DIRECTION_RANGE，工具会自动给出**粗估距离/耗时**（大圆+系数）并提示查铁路/航班，不会卡死。**distanceMeters/durationSeconds 为估算**，公交细节以当地为准，跨城勿当作铁路时刻。",
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
          message: `无法将起终点解析为坐标（请换更具体的地址或城市名）。origin=${args.origin} destination=${args.destination}`,
          retryable: true,
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

    const crossCity =
      originPt.adcode &&
      destPt.adcode &&
      String(originPt.adcode).slice(0, 4) !== String(destPt.adcode).slice(0, 4);

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
        distanceMeters,
        durationSeconds,
        distanceKm,
        durationMinutes,
        durationHuman,
        tollsYuan,
        crossCityHint: crossCity ? "起终点行政区不同：若为跨城长距离，驾车/路网耗时与高铁直达不同，请以铁路售票为准。" : undefined,
        note: noteExtra || "OK",
      },
    };
  },
};
