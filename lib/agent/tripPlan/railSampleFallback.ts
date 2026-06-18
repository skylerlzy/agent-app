import type { TripPlanRailOption, TripPlanTransportSegment } from "./types";

const SAMPLE_DISCLAIMER =
  "以下为参考样例车次（API 未返回实时数据时自动生成），购票与时刻请以 12306 为准。";

/** 按城市名粗估跨城铁路参考耗时（分钟） */
function estimateRailDurationMinutes(origin: string, dest: string): number {
  const o = origin.replace(/市$/u, "");
  const d = dest.replace(/市$/u, "");
  if (o === d) return 0;

  const tier1 = /北京|上海|广州|深圳|杭州|南京|武汉|成都|重庆|西安|天津|苏州|长沙|郑州|青岛|厦门|珠海|福州|合肥|南昌|昆明|贵阳|南宁|海口|大连|沈阳|哈尔滨|长春|石家庄|太原|济南|兰州|乌鲁木齐|拉萨|银川|西宁|呼和浩特/;
  const oTier = tier1.test(o);
  const dTier = tier1.test(d);

  if (oTier && dTier) {
    if (/北京|上海|广州|深圳/.test(o) && /北京|上海|广州|深圳/.test(d)) return 360;
    if (/珠海|深圳|广州/.test(o) && /南京|杭州|上海|北京|武汉/.test(d)) return 420;
    return 300;
  }
  return 240;
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return padTime(nh, nm);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}小时${m}分`;
  if (h > 0) return `${h}小时`;
  return `${m}分`;
}

function buildSampleTrains(
  origin: string,
  dest: string,
  durationMinutes: number,
  dateIso?: string
): { options: TripPlanRailOption[]; recommendation: string } {
  const o = origin.replace(/市$/u, "");
  const d = dest.replace(/市$/u, "");
  const durText = formatDuration(durationMinutes);

  const fastest: TripPlanRailOption = {
    trainNo: "G1736",
    trainType: "G",
    departStation: `${o}站`,
    arriveStation: `${d}南站`,
    departureTime: "08:12",
    arrivalTime: addMinutes("08:12", durationMinutes),
    duration: durText,
    priceSecond: "553.5",
    priceFirst: "884",
    seatsAvailable: "样例数据 · 有余票",
    tag: "最快",
  };

  const recommended: TripPlanRailOption = {
    trainNo: "G1740",
    trainType: "G",
    departStation: `${o}站`,
    arriveStation: `${d}站`,
    departureTime: "09:28",
    arrivalTime: addMinutes("09:28", durationMinutes + 18),
    duration: formatDuration(durationMinutes + 18),
    priceSecond: "523",
    priceFirst: "836",
    seatsAvailable: "样例数据 · 二等座有票",
    tag: "推荐",
  };

  const budget: TripPlanRailOption = {
    trainNo: "D3126",
    trainType: "D",
    departStation: `${o}站`,
    arriveStation: `${d}站`,
    departureTime: "11:05",
    arrivalTime: addMinutes("11:05", durationMinutes + 45),
    duration: formatDuration(durationMinutes + 45),
    priceSecond: "398",
    seatsAvailable: "样例数据 · 参考价",
    tag: "经济",
  };

  const options = [fastest, recommended, budget];
  const lines = options.map((o) => {
    const price = o.priceSecond ? `二等 ¥${o.priceSecond}` : "";
    return `【${o.tag}·样例】${o.trainNo} ${o.departureTime} ${o.departStation}→${o.arrivalTime} ${o.arriveStation}（${o.duration}${price ? `，${price}` : ""}）`;
  });

  const recommendation = [
    `${o} → ${d}${dateIso ? ` · ${dateIso}` : ""} 铁路参考（${SAMPLE_DISCLAIMER}）`,
    ...lines,
    "抵达后使用地铁/网约车接驳至市区酒店或首站；若携带大件行李可预留 30 分钟出站缓冲。",
  ].join("\n");

  return { options, recommendation };
}

/** API 失败或无车次数据时，生成带样例车次的跨城交通段 */
export function buildSampleRailTransportSegment(
  origin: string,
  destination: string,
  dateIso?: string
): TripPlanTransportSegment {
  const durationMinutes = estimateRailDurationMinutes(origin, destination);
  const { options, recommendation } = buildSampleTrains(
    origin,
    destination,
    durationMinutes,
    dateIso
  );

  return {
    category: "intercity",
    origin: origin.replace(/市$/u, ""),
    destination: destination.replace(/市$/u, ""),
    durationMinutes,
    mode: "rail",
    recommendation,
    railOptions: options,
    queryDateIso: dateIso,
    totalTrains: options.length,
  };
}

export { SAMPLE_DISCLAIMER };
