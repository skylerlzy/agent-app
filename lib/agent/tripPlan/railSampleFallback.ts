import type { TripPlanRailOption, TripPlanTransportSegment } from "./types";

function hashRoute(origin: string, dest: string): number {
  const s = `${origin.replace(/市$/u, "")}|${dest.replace(/市$/u, "")}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 按起讫城市粗估跨城铁路参考耗时（分钟），随输入变化而非固定样例 */
export function estimateRailDurationMinutes(origin: string, dest: string): number {
  const o = origin.replace(/市$/u, "").replace(/站$/u, "");
  const d = dest.replace(/市$/u, "").replace(/站$/u, "");
  if (o === d) return 0;

  const tier1 =
    /北京|上海|广州|深圳|杭州|南京|武汉|成都|重庆|西安|天津|苏州|长沙|郑州|青岛|厦门|珠海|福州|合肥|南昌|昆明|贵阳|南宁|海口|大连|沈阳|哈尔滨|长春|石家庄|太原|济南|兰州|乌鲁木齐|拉萨|银川|西宁|呼和浩特/;
  const oTier = tier1.test(o);
  const dTier = tier1.test(d);

  if (oTier && dTier) {
    if (/北京|上海|广州|深圳/.test(o) && /北京|上海|广州|深圳/.test(d)) return 360;
    if (/珠海|深圳|广州/.test(d) && /南京|杭州|上海|北京|武汉/.test(o)) return 420;
    if (/珠海|深圳|广州/.test(o) && /南京|杭州|上海|北京|武汉/.test(d)) return 420;
    return 300;
  }
  const h = hashRoute(origin, dest);
  return 180 + (h % 180);
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return padTime(Math.floor(total / 60) % 24, total % 60);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}小时${m}分`;
  if (h > 0) return `${h}小时`;
  return `${m}分`;
}

/** 站名已含「站」则保留，否则补全 */
function formatStationLabel(cityOrStation: string, role: "depart" | "arrive"): string {
  const n = cityOrStation.replace(/市$/u, "").trim();
  if (/站$/.test(n)) return n;
  if (role === "arrive" && /珠海|深圳|广州|南京|武汉|成都|西安|郑州|长沙/.test(n)) {
    return `${n}站`;
  }
  return `${n}站`;
}

function estimatePriceSecond(durationMinutes: number, h: number, tier: "g" | "d"): number {
  const base = Math.round(durationMinutes * (tier === "g" ? 0.52 : 0.38) + 80);
  return base + (h % 120);
}

function buildReferenceTrains(
  origin: string,
  dest: string,
  durationMinutes: number,
  dateIso?: string
): { options: TripPlanRailOption[]; recommendation: string } {
  const h = hashRoute(origin, dest);
  const oLabel = origin.replace(/市$/u, "");
  const dLabel = dest.replace(/市$/u, "");
  const trainBase = 1000 + (h % 800);

  const departFast = padTime(7 + (h % 3), 8 + (h % 45));
  const fastest: TripPlanRailOption = {
    trainNo: `G${trainBase + 2}`,
    trainType: "G",
    departStation: formatStationLabel(origin, "depart"),
    arriveStation: formatStationLabel(dest, "arrive"),
    departureTime: departFast,
    arrivalTime: addMinutes(departFast, durationMinutes + (h % 15)),
    duration: formatDuration(durationMinutes + (h % 15)),
    priceSecond: String(estimatePriceSecond(durationMinutes, h, "g")),
    priceFirst: String(estimatePriceSecond(durationMinutes, h, "g") + 280 + (h % 80)),
    seatsAvailable: "二等座有票",
    tag: "最快",
  };

  const departRec = padTime(8 + (h % 2), 15 + (h % 40));
  const recommended: TripPlanRailOption = {
    trainNo: `G${trainBase + 8}`,
    trainType: "G",
    departStation: formatStationLabel(origin, "depart"),
    arriveStation: formatStationLabel(dest, "arrive"),
    departureTime: departRec,
    arrivalTime: addMinutes(departRec, durationMinutes + 25 + (h % 20)),
    duration: formatDuration(durationMinutes + 25 + (h % 20)),
    priceSecond: String(estimatePriceSecond(durationMinutes, h + 3, "g")),
    priceFirst: String(estimatePriceSecond(durationMinutes, h + 3, "g") + 260),
    seatsAvailable: "一等/二等有余票",
    tag: "推荐",
  };

  const departBudget = padTime(9 + (h % 2), 5 + (h % 50));
  const budget: TripPlanRailOption = {
    trainNo: `D${trainBase + 5}`,
    trainType: "D",
    departStation: formatStationLabel(origin, "depart"),
    arriveStation: formatStationLabel(dest, "arrive"),
    departureTime: departBudget,
    arrivalTime: addMinutes(departBudget, durationMinutes + 55 + (h % 30)),
    duration: formatDuration(durationMinutes + 55 + (h % 30)),
    priceSecond: String(estimatePriceSecond(durationMinutes, h + 7, "d")),
    seatsAvailable: "二等座有票",
    tag: "经济",
  };

  const options = [fastest, recommended, budget];
  const lines = options.map((o) => {
    const price = o.priceSecond ? `二等 ¥${o.priceSecond}` : "";
    return `【${o.tag}】${o.trainNo} ${o.departureTime} ${o.departStation}→${o.arrivalTime} ${o.arriveStation}（${o.duration}${price ? `，${price}` : ""}）`;
  });

  const recommendation = [
    `${oLabel} → ${dLabel}${dateIso ? ` · ${dateIso}` : ""} 高铁/动车参考（实时接口未返回时由系统按路线生成，购票请以 12306 为准）：`,
    ...lines,
    "抵达后使用地铁/网约车接驳至市区酒店或首站；若携带大件行李可预留 30 分钟出站缓冲。",
  ].join("\n");

  return { options, recommendation };
}

/** API 失败或无车次数据时，生成与起讫站/日期绑定的参考车次（展示样式与实时数据一致） */
export function buildSampleRailTransportSegment(
  origin: string,
  destination: string,
  dateIso?: string
): TripPlanTransportSegment {
  const durationMinutes = estimateRailDurationMinutes(origin, destination);
  const { options, recommendation } = buildReferenceTrains(
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
