import type { TripPlanRailOption, TripPlanTransportSegment } from "./types";

function hashRoute(origin: string, dest: string): number {
  const s = `${origin}|${dest}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function estimateRailHours(origin: string, dest: string): number {
  const h = hashRoute(origin, dest);
  return 3 + (h % 9);
}

function padTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutes(time: string, add: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + add;
  return padTime(Math.floor(total / 60) % 24, total % 60);
}

/** 铁路 API 不可用时的参考车次（明确标注为示意，非实时数据） */
export function buildSyntheticRailSegment(
  origin: string,
  destination: string,
  dateIso?: string
): TripPlanTransportSegment {
  const h = hashRoute(origin, destination);
  const baseHours = estimateRailHours(origin, destination);
  const trainBase = 1000 + (h % 800);

  const fastest: TripPlanRailOption = {
    trainNo: `G${trainBase + 2}`,
    trainType: "高铁",
    departStation: `${origin.replace(/市$/u, "")}站`,
    arriveStation: `${destination.replace(/市$/u, "")}南站`,
    departureTime: padTime(7 + (h % 3), 10 + (h % 40)),
    arrivalTime: addMinutes(padTime(7 + (h % 3), 10 + (h % 40)), baseHours * 60 + 20),
    duration: `${baseHours}小时20分`,
    priceSecond: String(280 + (h % 220)),
    priceFirst: String(450 + (h % 180)),
    seatsAvailable: "参考余票（请以 12306 为准）",
    tag: "最快",
  };

  const recommended: TripPlanRailOption = {
    ...fastest,
    trainNo: `G${trainBase + 8}`,
    departureTime: padTime(8 + (h % 2), 30),
    arrivalTime: addMinutes(padTime(8 + (h % 2), 30), baseHours * 60 + 45),
    duration: `${baseHours}小时45分`,
    tag: "推荐",
  };

  const budget: TripPlanRailOption = {
    ...fastest,
    trainNo: `D${trainBase + 5}`,
    trainType: "动车",
    departureTime: padTime(9 + (h % 2), 5),
    arrivalTime: addMinutes(padTime(9 + (h % 2), 5), baseHours * 60 + 90),
    duration: `${baseHours + 1}小时30分`,
    priceSecond: String(220 + (h % 120)),
    tag: "经济",
  };

  const options = [fastest, recommended, budget];
  const lines = options.map(
    (o) =>
      `【${o.tag}·参考】${o.trainNo} ${o.departureTime} ${o.departStation}→${o.arrivalTime} ${o.arriveStation}（${o.duration}，二等约 ¥${o.priceSecond}）`
  );

  const recommendation = [
    `${origin} → ${destination}${dateIso ? ` · ${dateIso}` : ""} 铁路参考（API 暂不可用，以下为常见车次示意，购票以 12306 为准）：`,
    ...lines,
    "抵达后地铁/网约车接驳至酒店或首站；携带大件行李可预留 30 分钟出站缓冲。",
  ].join("\n");

  return {
    category: "intercity",
    origin,
    destination,
    durationMinutes: baseHours * 60 + 45,
    mode: "rail",
    recommendation,
    railOptions: options,
    queryDateIso: dateIso,
    totalTrains: undefined,
  };
}
