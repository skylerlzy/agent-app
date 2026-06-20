/**
 * 阿里云云市场 cmapi033685「火车查询（免费版）」HTTP 客户端。
 * 域名与路径来自商品 queryApiList：jisutrainf.market.alicloudapi.com
 * @see https://market.aliyun.com/detail/cmapi033685
 */
import { fetchWithTimeout } from "../http/fetchWithTimeout";

const DEFAULT_HOST = "https://jisutrainf.market.alicloudapi.com";
const DEFAULT_TICKET_PATH = "/train/ticket";
const DEFAULT_STATION2S_PATH = "/train/station2s";
const MAX_TRAINS = 15;
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

/** 城市名 → 高铁主站（提升命中率、减轻余票接口压力） */
const CITY_TO_RAIL_STATION: Record<string, string> = {
  北京: "北京南",
  上海: "上海虹桥",
  广州: "广州南",
  深圳: "深圳北",
  杭州: "杭州东",
  南京: "南京南",
  武汉: "武汉",
  成都: "成都东",
  重庆: "重庆北",
  西安: "西安北",
  天津: "天津西",
  苏州: "苏州北",
  长沙: "长沙南",
  郑州: "郑州东",
  青岛: "青岛北",
  厦门: "厦门北",
  福州: "福州",
  合肥: "合肥南",
  南昌: "南昌西",
  昆明: "昆明南",
  贵阳: "贵阳北",
  南宁: "南宁东",
  大连: "大连北",
  沈阳: "沈阳北",
  哈尔滨: "哈尔滨西",
  石家庄: "石家庄",
  太原: "太原南",
  济南: "济南西",
  兰州: "兰州西",
  珠海: "珠海",
};

export type AliyunRailQueryInput = {
  start: string;
  end: string;
  dateIso?: string;
  isHighSpeed?: boolean;
};

export type AliyunRailTrainSummary = {
  trainno: string;
  type: string;
  departStation: string;
  arriveStation: string;
  departureTime: string;
  arrivalTime: string;
  costTime: string;
  priceSecond?: string;
  priceFirst?: string;
  priceHardSeat?: string;
  priceNoSeat?: string;
  seatsAvailable?: string;
};

export type AliyunRailQueryResult = {
  provider: "aliyun_market_cmapi033685";
  apiHost: string;
  apiPath: string;
  queryDate: string;
  start: string;
  end: string;
  total: number;
  trains: AliyunRailTrainSummary[];
  rawStatus?: number;
  taskNote?: string;
};

type JisuTrainRow = Record<string, unknown>;

function toolHttpTimeoutMs(): number {
  const railRaw = process.env.RAIL_HTTP_TIMEOUT_MS;
  if (railRaw !== undefined && railRaw !== "") {
    const railN = Number(railRaw);
    if (Number.isFinite(railN) && railN >= 3_000) return railN;
  }
  const raw = process.env.TOOL_HTTP_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 22_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3_000 ? Math.min(n, 30_000) : 22_000;
}

function railHttpMaxRetries(): number {
  const raw = process.env.RAIL_HTTP_MAX_RETRIES;
  if (raw === undefined || raw === "") return 2;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(4, Math.floor(n)) : 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryBackoffMs(attempt: number): number {
  const base = Math.max(400, Number(process.env.RAIL_HTTP_RETRY_BASE_MS ?? "800"));
  return Math.min(6_000, base * 2 ** attempt);
}

/** 将「南京市」等城市名归一为 API 更稳定的高铁站名 */
export function normalizeRailStationName(cityOrStation: string): string {
  const trimmed = cityOrStation.trim().replace(/市$/u, "");
  if (!trimmed) return cityOrStation.trim();
  return CITY_TO_RAIL_STATION[trimmed] ?? trimmed;
}

function isGatewayOrTimeoutError(message: string): boolean {
  return /HTTP\s+(429|502|503|504)|超时|timeout|abort|econnreset|etimedout|fetch failed|network/i.test(
    message
  );
}

function railApiHost(): string {
  const raw = process.env.ALIYUN_RAIL_API_HOST?.trim();
  if (!raw) return DEFAULT_HOST;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

function railTicketPath(): string {
  const raw = process.env.ALIYUN_RAIL_API_PATH?.trim();
  return raw ? (raw.startsWith("/") ? raw : `/${raw}`) : DEFAULT_TICKET_PATH;
}

function railStation2sPath(): string {
  const raw = process.env.ALIYUN_RAIL_STATION2S_PATH?.trim();
  return raw ? (raw.startsWith("/") ? raw : `/${raw}`) : DEFAULT_STATION2S_PATH;
}

function agentTimezone(): string {
  return (process.env.AGENT_TIMEZONE ?? "Asia/Shanghai").trim() || "Asia/Shanghai";
}

/** 未传 dateIso 时用 Agent 时区当天 yyyy-MM-dd */
export function resolveRailQueryDate(dateIso?: string): string {
  if (dateIso?.trim()) return dateIso.trim();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: agentTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readAppCode(): string | null {
  const code = process.env.ALIYUN_RAIL_APPCODE?.trim();
  return code || null;
}

function buildAuthHeaders(appCode: string): HeadersInit {
  return { Authorization: `APPCODE ${appCode}` };
}

function strField(row: JisuTrainRow, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function summarizeSeats(row: JisuTrainRow): string | undefined {
  const parts: string[] = [];
  const pairs: [string, string][] = [
    ["numed", "二等"],
    ["numyd", "一等"],
    ["numsw", "商务"],
    ["numyz", "硬座"],
    ["numwz", "无座"],
  ];
  for (const [key, label] of pairs) {
    const v = strField(row, key);
    if (v && v !== "--" && v !== "0") parts.push(`${label}:${v}`);
  }
  return parts.length ? parts.join("；") : undefined;
}

function mapTrainRow(row: JisuTrainRow): AliyunRailTrainSummary | null {
  const trainno = strField(row, "trainno");
  if (!trainno) return null;
  return {
    trainno,
    type: strField(row, "type", "typename") ?? "",
    departStation: strField(row, "station", "departstation") ?? "",
    arriveStation: strField(row, "endstation", "terminalstation") ?? "",
    departureTime: strField(row, "departuretime", "departureTime") ?? "",
    arrivalTime: strField(row, "arrivaltime", "arrivalTime") ?? "",
    costTime: strField(row, "costtime", "costTime") ?? "",
    priceSecond: strField(row, "priceed"),
    priceFirst: strField(row, "priceyd"),
    priceHardSeat: strField(row, "priceyz"),
    priceNoSeat: strField(row, "pricewz"),
    seatsAvailable: summarizeSeats(row),
  };
}

function parseJisuBody(body: unknown): { rows: JisuTrainRow[]; status?: number; msg?: string } {
  if (!body || typeof body !== "object") {
    return { rows: [] };
  }
  const o = body as { status?: number; msg?: string; result?: unknown };
  if (Array.isArray(o.result)) {
    return { rows: o.result as JisuTrainRow[], status: o.status, msg: o.msg };
  }
  if (o.result && typeof o.result === "object" && Array.isArray((o.result as { list?: unknown }).list)) {
    return {
      rows: (o.result as { list: JisuTrainRow[] }).list,
      status: o.status ?? (o as { code?: number }).code,
      msg: o.msg,
    };
  }
  return { rows: [], status: o.status, msg: o.msg };
}

async function fetchRailApiOnce(
  path: string,
  query: Record<string, string>,
  appCode: string
): Promise<{ rows: JisuTrainRow[]; status?: number; msg?: string; apiPath: string }> {
  const host = railApiHost();
  const params = new URLSearchParams(query);
  const url = `${host}${path}?${params.toString()}`;
  const res = await fetchWithTimeout(
    url,
    { headers: buildAuthHeaders(appCode) },
    toolHttpTimeoutMs(),
    "阿里云铁路查询请求超时",
    "aliyun:rail"
  );

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? "阿里云铁路查询返回非 JSON"
        : `阿里云铁路查询 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ""}`
    );
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "msg" in body
        ? String((body as { msg?: unknown }).msg ?? "")
        : text.slice(0, 120);
    const err = new Error(`阿里云铁路查询 HTTP ${res.status}${msg ? `：${msg}` : ""}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }

  const parsed = parseJisuBody(body);
  if (parsed.status != null && parsed.status !== 0 && parsed.rows.length === 0) {
    throw new Error(parsed.msg?.trim() || `阿里云铁路查询失败（status=${parsed.status}）`);
  }
  return { ...parsed, apiPath: path };
}

async function fetchRailApi(
  path: string,
  query: Record<string, string>,
  appCode: string
): Promise<{ rows: JisuTrainRow[]; status?: number; msg?: string; apiPath: string }> {
  const maxRetries = railHttpMaxRetries();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchRailApiOnce(path, query, appCode);
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      const httpStatus = (e as Error & { httpStatus?: number }).httpStatus;
      const retryable =
        isGatewayOrTimeoutError(message) ||
        (httpStatus != null && RETRYABLE_HTTP_STATUSES.has(httpStatus));
      if (!retryable || attempt >= maxRetries) break;
      await sleep(retryBackoffMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 缺少 AppCode 时抛出，供工具层转换为 ToolResult */
export function requireAliyunRailAppCode(): string {
  const appCode = readAppCode();
  if (!appCode) {
    throw new Error(
      "未配置 ALIYUN_RAIL_APPCODE。请在 Convex Dashboard → Environment Variables 填写云市场 AppCode（买家中心 → 已购买服务 → AppCode）。"
    );
  }
  return appCode;
}

/**
 * 查询车次：有 dateIso（或默认当天）时走余票接口；无日期需求时仍用余票接口（默认当天）。
 * 若余票接口无结果且未指定日期，可回退站站查询。
 */
export async function queryAliyunRailTrains(input: AliyunRailQueryInput): Promise<AliyunRailQueryResult> {
  const appCode = requireAliyunRailAppCode();
  const start = normalizeRailStationName(input.start);
  const end = normalizeRailStationName(input.end);
  const queryDate = resolveRailQueryDate(input.dateIso);
  const host = railApiHost();

  const baseQuery: Record<string, string> = {
    start,
    end,
    date: queryDate,
  };
  if (input.isHighSpeed) baseQuery.ishigh = "1";

  let apiPath = railTicketPath();
  let fetched: { rows: JisuTrainRow[]; status?: number; msg?: string; apiPath: string };
  let taskNotePrefix = "";

  try {
    fetched = await fetchRailApi(apiPath, baseQuery, appCode);
  } catch (ticketError) {
    const ticketMsg = ticketError instanceof Error ? ticketError.message : String(ticketError);
    if (!isGatewayOrTimeoutError(ticketMsg)) throw ticketError;

    const fallbackPath = railStation2sPath();
    const fallbackQuery: Record<string, string> = { start, end };
    if (input.isHighSpeed) fallbackQuery.ishigh = "1";
    try {
      fetched = await fetchRailApi(fallbackPath, fallbackQuery, appCode);
      apiPath = fallbackPath;
      taskNotePrefix = "余票接口暂不可用，已改读站站时刻参考；";
    } catch {
      throw ticketError;
    }
  }

  if (fetched.rows.length === 0 && !input.dateIso?.trim()) {
    const fallbackPath = railStation2sPath();
    const fallbackQuery: Record<string, string> = { start, end };
    if (input.isHighSpeed) fallbackQuery.ishigh = "1";
    try {
      const fallback = await fetchRailApi(fallbackPath, fallbackQuery, appCode);
      if (fallback.rows.length > 0) {
        fetched = fallback;
        apiPath = fallbackPath;
      }
    } catch {
      /* 保留 ticket 空结果 */
    }
  }

  const trains = fetched.rows
    .map(mapTrainRow)
    .filter((t): t is AliyunRailTrainSummary => t != null)
    .slice(0, MAX_TRAINS);

  return {
    provider: "aliyun_market_cmapi033685",
    apiHost: host,
    apiPath,
    queryDate,
    start,
    end,
    total: trains.length,
    trains,
    rawStatus: fetched.status,
    taskNote:
      trains.length > 0
        ? `${taskNotePrefix}共返回 ${trains.length} 条车次（最多展示 ${MAX_TRAINS} 条）。`
        : `${taskNotePrefix}未查询到车次，请确认站名为中文车站名（如「南京南」「上海虹桥」）并核对乘车日期。`,
  };
}

/** 铁路 API 完全不可用时的降级载荷（避免 ReAct 反复重试同一参数） */
export function buildDegradedRailToolData(input: {
  originCity: string;
  destinationCity: string;
  dateIso?: string;
  reason: string;
}): Record<string, unknown> {
  const queryDate = resolveRailQueryDate(input.dateIso);
  return {
    provider: "aliyun_market_cmapi033685",
    originCity: input.originCity.trim(),
    destinationCity: input.destinationCity.trim(),
    dateIso: queryDate,
    queryDate,
    start: normalizeRailStationName(input.originCity),
    end: normalizeRailStationName(input.destinationCity),
    total: 0,
    trains: [],
    degraded: true,
    apiUnavailable: true,
    note: `铁路查询接口暂时不可用（${input.reason}）。后续行程将基于常见高铁参考车次推演，购票与时刻请以 12306 为准。`,
    doNotRetrySameArgs: true,
  };
}
