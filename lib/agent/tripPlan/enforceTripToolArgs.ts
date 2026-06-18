import type { ToolArguments, ToolName } from "../contracts";
import { citiesMatch, isDateInTripRange, type ResolvedTripContext } from "./tripContext";

export function enforceTripToolArgs(
  toolName: ToolName,
  args: ToolArguments,
  ctx: ResolvedTripContext
): { args: ToolArguments; patchedFields: string[] } {
  const patchedFields: string[] = [];
  const out: ToolArguments = { ...args };
  const dest = ctx.destination?.trim();
  const origin = ctx.origin?.trim();

  if (dest) {
    if (toolName === "weather_forecast") {
      const city = typeof args.city === "string" ? args.city.trim() : "";
      if (!citiesMatch(city, dest)) {
        out.city = dest;
        patchedFields.push(`city → ${dest}`);
      }
      const dateIso = typeof args.dateIso === "string" ? args.dateIso.trim() : "";
      if (
        dateIso &&
        ctx.tripStart &&
        !isDateInTripRange(dateIso, ctx.tripStart, ctx.tripEnd)
      ) {
        patchedFields.push(`dateIso ${dateIso} 不在行程 ${ctx.tripStart}～${ctx.tripEnd}`);
      }
    }

    if (toolName === "poi_search") {
      const city = typeof args.city === "string" ? args.city.trim() : "";
      if (!citiesMatch(city, dest)) {
        out.city = dest;
        patchedFields.push(`city → ${dest}`);
      }
    }

    if (toolName === "rail_schedule_hint") {
      const dc = typeof args.destinationCity === "string" ? args.destinationCity.trim() : "";
      if (!citiesMatch(dc, dest)) {
        out.destinationCity = dest;
        patchedFields.push(`destinationCity → ${dest}`);
      }
      if (origin) {
        const oc = typeof args.originCity === "string" ? args.originCity.trim() : "";
        if (!citiesMatch(oc, origin)) {
          out.originCity = origin;
          patchedFields.push(`originCity → ${origin}`);
        }
      }
    }
  }

  return { args: out, patchedFields };
}
