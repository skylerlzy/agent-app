"use client";

import type { TripPlanDailyWeather } from "@/lib/agent/tripPlan/types";
import { cn } from "@/lib/utils";
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Cloudy,
  Droplets,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";

function weekdayLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
}

function formatDateLabel(dateIso: string): string {
  const [, m, d] = dateIso.split("-");
  if (!m || !d) return dateIso;
  return `${Number(m)}月${Number(d)}日`;
}

function pickWeatherVisual(summary: string): {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  cardBg: string;
  shortLabel: string;
} {
  const s = summary;
  if (/雷/.test(s)) {
    return {
      Icon: CloudLightning,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
      cardBg: "from-violet-50/95 to-indigo-50/50",
      shortLabel: "雷阵雨",
    };
  }
  if (/暴雨|大雨|中雨|小雨|雨/.test(s)) {
    return {
      Icon: CloudRain,
      iconBg: "bg-sky-100",
      iconColor: "text-sky-600",
      cardBg: "from-sky-50/95 to-blue-50/45",
      shortLabel: "有雨",
    };
  }
  if (/雪/.test(s)) {
    return {
      Icon: Snowflake,
      iconBg: "bg-cyan-100",
      iconColor: "text-cyan-600",
      cardBg: "from-cyan-50/90 to-slate-50/50",
      shortLabel: "降雪",
    };
  }
  if (/阴/.test(s)) {
    return {
      Icon: Cloud,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      cardBg: "from-slate-50/95 to-gray-50/45",
      shortLabel: "阴天",
    };
  }
  if (/多云/.test(s)) {
    return {
      Icon: CloudSun,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      cardBg: "from-amber-50/95 to-orange-50/40",
      shortLabel: "多云",
    };
  }
  if (/晴/.test(s)) {
    return {
      Icon: Sun,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
      cardBg: "from-amber-50/95 to-yellow-50/50",
      shortLabel: "晴",
    };
  }
  return {
    Icon: Cloudy,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-500",
    cardBg: "from-sky-50/80 to-background",
    shortLabel: "多变",
  };
}

function parseDayNight(summary: string): { day?: string; night?: string } {
  const day = summary.match(/白天[^；;]+/)?.[0]?.replace(/^白天/u, "").trim();
  const night = summary.match(/夜间[^；;]+/)?.[0]?.replace(/^夜间/u, "").trim();
  return { day, night };
}

function WeatherDayCard({ day }: { day: TripPlanDailyWeather }) {
  const visual = pickWeatherVisual(day.summary);
  const { Icon } = visual;
  const weekday = weekdayLabel(day.dateIso);
  const { day: dayPart, night: nightPart } = parseDayNight(day.summary);

  return (
    <li
      className={cn(
        "flex h-full flex-col rounded-xl border border-border/45 bg-gradient-to-br p-3 shadow-sm transition hover:border-primary/25 hover:shadow-md",
        visual.cardBg
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              visual.iconBg
            )}
          >
            <Icon className={cn("h-5 w-5", visual.iconColor)} strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-base font-bold text-foreground">{formatDateLabel(day.dateIso)}</p>
            <p className="text-xs text-muted-foreground">
              {[weekday, day.city?.replace(/\s·\s.*$/, ""), visual.shortLabel].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {day.tempMin != null && day.tempMax != null ? (
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums leading-none text-foreground">{day.tempMax}°</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{day.tempMin}°～{day.tempMax}°</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex-1 space-y-1.5 text-sm leading-relaxed text-foreground/88">
        {dayPart ? (
          <p>
            <span className="font-medium text-amber-800/90">白天</span> {dayPart}
          </p>
        ) : null}
        {nightPart ? (
          <p>
            <span className="font-medium text-indigo-800/90">夜间</span> {nightPart}
          </p>
        ) : null}
        {!dayPart && !nightPart ? (
          <p className="line-clamp-3">{day.summary}</p>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
        {day.aqi != null ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-background/70 px-1.5 py-0.5 text-xs text-muted-foreground">
            <Wind className="h-3 w-3" />
            AQI {day.aqi}
            {day.airQuality ? ` · ${day.airQuality}` : ""}
          </span>
        ) : null}
        {day.precipMm != null && day.precipMm > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-background/70 px-1.5 py-0.5 text-xs text-muted-foreground">
            <Droplets className="h-3 w-3" />
            降水 {day.precipMm} mm
          </span>
        ) : null}
        {day.tempMax != null && day.tempMax >= 30 ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-xs text-orange-800">
            <Thermometer className="h-3 w-3" />
            偏热
          </span>
        ) : null}
      </div>
    </li>
  );
}

function parseAdviceItems(weatherAdvice?: string, items?: string[]): string[] {
  if (items?.length) return items;
  if (!weatherAdvice?.trim()) return [];
  return weatherAdvice
    .split(/[；;。]\s*/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
}

export function TripPlanWeatherSection({
  dailyWeather,
  weatherAdvice,
  weatherAdviceItems,
  legacyText,
}: {
  dailyWeather?: TripPlanDailyWeather[];
  weatherAdvice?: string;
  weatherAdviceItems?: string[];
  legacyText?: string;
}) {
  const days = dailyWeather?.length ? dailyWeather : [];
  const adviceItems = parseAdviceItems(weatherAdvice, weatherAdviceItems);

  return (
    <div className="space-y-4">
      {days.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {days.map((day) => (
            <WeatherDayCard key={day.dateIso} day={day} />
          ))}
        </ul>
      ) : legacyText ? (
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">{legacyText}</p>
      ) : (
        <p className="text-base text-muted-foreground">暂无逐日天气预报。</p>
      )}

      {adviceItems.length > 0 ? (
        <div className="rounded-2xl border border-emerald-200/55 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-amber-50/30 p-3.5">
          <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-emerald-900">
            <Sun className="h-4 w-4 text-amber-500" />
            着装与出行建议
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {adviceItems.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-white/60 bg-background/75 px-2.5 py-2 text-sm leading-relaxed text-foreground/90 shadow-sm"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
