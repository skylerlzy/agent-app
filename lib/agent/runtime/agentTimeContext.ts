/**
 * 为 ReAct / 规划提示提供「人类可读」的当前时间与未来日历，避免模型把「下周三」等相对日期算错或与星期对不上。
 * Convex action 默认 UTC；展示时区可用环境变量 AGENT_TIMEZONE（默认 Asia/Shanghai）。
 */

const ZH_WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;

/** 国内常用 IANA 时区在「无夏令时」下的近似 UTC 偏移（小时），用于把「当地日历日正午」映射到 UTC 瞬时，再交给 Intl 格式化。 */
function tzApproxUtcOffsetHours(tz: string): number {
  if (tz === "Asia/Urumqi" || tz === "Asia/Kashgar") return 6;
  if (tz.startsWith("Asia/")) return 8;
  return 8;
}

function calendarYmdPlusDays(ymdStart: string, deltaDays: number, tz: string): { ymd: string; weekdayLong: string } {
  const [y0, m0, d0] = ymdStart.split("-").map(Number);
  const utcHour = 12 - tzApproxUtcOffsetHours(tz);
  const instant = new Date(Date.UTC(y0, m0 - 1, d0 + deltaDays, utcHour, 0, 0));
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const weekdayLong = new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    weekday: "long",
  }).format(instant);
  return { ymd, weekdayLong };
}

function weekdayIndexFromLong(label: string): number {
  const i = ZH_WEEKDAYS.indexOf(label as (typeof ZH_WEEKDAYS)[number]);
  return i >= 0 ? i : 0;
}

/** 以「周一为一周之首」：返回今天距离本周一的天数（周一=0，周日=6） */
function daysFromThisMonday(todayYmd: string, tz: string): number {
  const { weekdayLong } = calendarYmdPlusDays(todayYmd, 0, tz);
  const idx = weekdayIndexFromLong(weekdayLong);
  return (idx + 6) % 7;
}

export function buildAgentTimeContextLines(): string[] {
  const now = new Date();
  const unixSec = Math.floor(now.getTime() / 1000);
  const tz = (process.env.AGENT_TIMEZONE ?? "Asia/Shanghai").trim() || "Asia/Shanghai";

  const wall = new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const fmtCa = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayYmd = fmtCa.format(now);

  const calLines: string[] = [];
  for (let i = 0; i < 14; i++) {
    const { ymd, weekdayLong } = calendarYmdPlusDays(todayYmd, i, tz);
    calLines.push(`  - ${ymd}（${weekdayLong}）`);
  }

  const dfMon = daysFromThisMonday(todayYmd, tz);
  const thisMondayYmd = calendarYmdPlusDays(todayYmd, -dfMon, tz).ymd;
  const nextMondayYmd = calendarYmdPlusDays(thisMondayYmd, 7, tz).ymd;
  const nextWednesdayYmd = calendarYmdPlusDays(nextMondayYmd, 2, tz);
  const nextThursdayYmd = calendarYmdPlusDays(nextMondayYmd, 3, tz);
  const thisWednesdayYmd = calendarYmdPlusDays(thisMondayYmd, 2, tz);
  const thisThursdayYmd = calendarYmdPlusDays(thisMondayYmd, 3, tz);

  return [
    `【时间基准】当前本地时间（${tz}）: ${wall}。`,
    `同一时刻的 Unix 时间戳(秒): ${unixSec}。`,
    `【自然周】以周一为一周之首：本周一日期 ${thisMondayYmd}；下周一（「下周」起始）${nextMondayYmd}。`,
    `【相对日期权威对照】（调用 weather_forecast 的 dateIso 必须取自下列「未来14日」中的 YYYY-MM-DD，且文字中的星期必须与该行一致，禁止编造）：`,
    ...calLines,
    `术语（与上表一致）：`,
    `  · 「本周三」→ ${thisWednesdayYmd.ymd}（${thisWednesdayYmd.weekdayLong}）；「本周四」→ ${thisThursdayYmd.ymd}（${thisThursdayYmd.weekdayLong}）。`,
    `  · 「下周三」→ ${nextWednesdayYmd.ymd}（${nextWednesdayYmd.weekdayLong}）；「下周四」→ ${nextThursdayYmd.ymd}（${nextThursdayYmd.weekdayLong}）。`,
    `  · 「本周末」通常指本周六、周日：${calendarYmdPlusDays(thisMondayYmd, 5, tz).ymd}、${calendarYmdPlusDays(thisMondayYmd, 6, tz).ymd}。`,
    `说明：Unix 秒仅表示同一瞬间；任何步骤描述里写「周几」必须与该行公历一致，否则视为错误计划。`,
  ];
}
