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
  const raw = process.env.TOOL_HTTP_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 45_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3_000 ? n : 45_000;
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

async function fetchRailApi(
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
    throw new Error(`阿里云铁路查询 HTTP ${res.status}${msg ? `：${msg}` : ""}`);
  }

  const parsed = parseJisuBody(body);
  if (parsed.status != null && parsed.status !== 0 && parsed.rows.length === 0) {
    throw new Error(parsed.msg?.trim() || `阿里云铁路查询失败（status=${parsed.status}）`);
  }
  return { ...parsed, apiPath: path };
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
  const start = input.start.trim();
  const end = input.end.trim();
  const queryDate = resolveRailQueryDate(input.dateIso);
  const host = railApiHost();

  const baseQuery: Record<string, string> = {
    start,
    end,
    date: queryDate,
  };
  if (input.isHighSpeed) baseQuery.ishigh = "1";

  let apiPath = railTicketPath();
  let fetched = await fetchRailApi(apiPath, baseQuery, appCode);

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
        ? `共返回 ${trains.length} 条车次（最多展示 ${MAX_TRAINS} 条）。`
        : "未查询到车次，请确认站名为中文车站名（如「南京南」「上海虹桥」）并核对乘车日期。",
  };
}
