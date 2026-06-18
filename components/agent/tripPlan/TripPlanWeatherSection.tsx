"use client";

import type { TripPlanDailyWeather } from "@/lib/agent/tripPlan/types";
import { cn } from "@/lib/utils";
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Cloudy,
  Snowflake,
  Sun,
  ThermometerSun,
  type LucideIcon,
} from "lucide-react";

function weekdayLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
}

function formatDateLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  if (!m || !d) return dateIso;
  return `${Number(m)}月${Number(d)}日`;
}

function pickWeatherVisual(summary: string): {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  rowBg: string;
  shortLabel: string;
} {
  const s = summary;
  if (/雷/.test(s)) {
    return {
      Icon: CloudLightning,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
      rowBg: "from-violet-50/90 to-sky-50/40",
      shortLabel: "雷阵雨",
    };
  }
  if (/暴雨|大雨|中雨|小雨|雨/.test(s)) {
    return {
      Icon: CloudRain,
      iconBg: "bg-sky-100",
      iconColor: "text-sky-600",
      rowBg: "from-sky-50/90 to-blue-50/30",
      shortLabel: "有雨",
    };
  }
  if (/雪/.test(s)) {
    return {
      Icon: Snowflake,
      iconBg: "bg-cyan-100",
      iconColor: "text-cyan-600",
      rowBg: "from-cyan-50/80 to-slate-50/40",
      shortLabel: "降雪",
    };
  }
  if (/阴/.test(s)) {
    return {
      Icon: Cloud,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      rowBg: "from-slate-50/90 to-gray-50/40",
      shortLabel: "阴天",
    };
  }
  if (/多云/.test(s)) {
    return {
      Icon: CloudSun,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      rowBg: "from-amber-50/80 to-orange-50/30",
      shortLabel: "多云",
    };
  }
  if (/晴/.test(s)) {
    return {
      Icon: Sun,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
      rowBg: "from-amber-50/90 to-yellow-50/40",
      shortLabel: "晴",
    };
  }
  return {
    Icon: Cloudy,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-500",
    rowBg: "from-sky-50/70 to-background",
    shortLabel: "多变",
  };
}

function shortSummary(summary: string): string {
  const day = summary.match(/白天[^；;]+/)?.[0];
  const night = summary.match(/夜间[^；;]+/)?.[0];
  if (day && night) return `${day}，${night}`;
  return summary.length > 72 ? `${summary.slice(0, 72)}…` : summary;
}

function WeatherDayRow({ day }: { day: TripPlanDailyWeather }) {
  const visual = pickWeatherVisual(day.summary);
  const { Icon } = visual;
  const weekday = weekdayLabel(day.dateIso);

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/40 bg-gradient-to-r px-3 py-3 transition hover:border-primary/20 hover:shadow-sm",
        visual.rowBg
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl shadow-inner",
          visual.iconBg
        )}
      >
        <Icon className={cn("h-6 w-6", visual.iconColor)} strokeWidth={1.75} />
        <span className={cn("mt-0.5 text-[9px] font-semibold", visual.iconColor)}>{visual.shortLabel}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-bold text-foreground">{formatDateLabel(day.dateIso)}</span>
          {weekday ? <span className="text-xs text-muted-foreground">{weekday}</span> : null}
          {day.city ? <span className="text-[11px] text-muted-foreground">{day.city}</span> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-foreground/85">{shortSummary(day.summary)}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {day.aqi != null ? <span>AQI {day.aqi}{day.airQuality ? ` · ${day.airQuality}` : ""}</span> : null}
          {day.precipMm != null && day.precipMm > 0 ? <span>降水 {day.precipMm} mm</span> : null}
        </div>
      </div>

      {day.tempMin != null && day.tempMax != null ? (
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums text-foreground">
            {day.tempMax}°
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{day.tempMin}°～{day.tempMax}°</p>
        </div>
      ) : (
        <ThermometerSun className="h-5 w-5 shrink-0 text-muted-foreground/50" />
      )}
    </li>
  );
}

export function TripPlanWeatherSection({
  dailyWeather,
  weatherAdvice,
  legacyText,
}: {
  dailyWeather?: TripPlanDailyWeather[];
  weatherAdvice?: string;
  legacyText?: string;
}) {
  const days = dailyWeather?.length ? dailyWeather : [];

  return (
    <div className="space-y-4">
      {days.length > 0 ? (
        <ul className="space-y-2">
          {days.map((day) => (
            <WeatherDayRow key={day.dateIso} day={day} />
          ))}
        </ul>
      ) : legacyText ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{legacyText}</p>
      ) : (
        <p className="text-sm text-muted-foreground">暂无逐日天气预报。</p>
      )}

      {weatherAdvice?.trim() ? (
        <div className="rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 px-3 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            <Sun className="h-3.5 w-3.5" />
            着装与出行建议
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">{weatherAdvice}</p>
        </div>
      ) : null}
    </div>
  );
}
