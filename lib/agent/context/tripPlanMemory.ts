import type { AgentRunMode } from "../contracts";
import type { TripPlanDocument } from "../tripPlan/types";
import {
  isValidTripPlan,
  parseTripPlanJsonString,
  serializeTripPlan,
} from "../tripPlan/schema";
import { formatTripPlanForPrompt } from "../tripPlan/formatForPrompt";

const WORKING_MEMORY_KEY = "tripPlanStructured";

export function parseTripPlanFromWorkingMemory(workingMemory?: string): TripPlanDocument | null {
  if (!workingMemory?.trim()) return null;
  try {
    const parsed = JSON.parse(workingMemory) as Record<string, unknown>;
    if (parsed[WORKING_MEMORY_KEY]) {
      return parseTripPlanJsonString(JSON.stringify(parsed[WORKING_MEMORY_KEY]));
    }
    if (typeof parsed.tripPlanStructured === "object") {
      return parseTripPlanJsonString(JSON.stringify(parsed.tripPlanStructured));
    }
  } catch {
    return null;
  }
  return null;
}

export function buildWorkingMemoryWithTripPlan(tripPlan: TripPlanDocument): string {
  return JSON.stringify({ [WORKING_MEMORY_KEY]: tripPlan });
}

export function formatWorkingMemoryPlanText(workingMemory?: string): string {
  const doc = parseTripPlanFromWorkingMemory(workingMemory);
  if (!doc) return "";
  return formatTripPlanForPrompt(doc);
}

/** incremental_revise / full 是否应写回 conversations.tripPlanStructuredJson */
export function shouldPatchTripPlan(
  mode: AgentRunMode | undefined,
  tripPlan: TripPlanDocument | null | undefined,
  updatesMasterPlan?: boolean
): boolean {
  if (mode === "quick_reply" || updatesMasterPlan === false) return false;
  return isValidTripPlan(tripPlan);
}

export function tripPlanFromRunDone(payload: {
  summary: string;
  tripPlanStructured?: TripPlanDocument;
}): TripPlanDocument | undefined {
  if (payload.tripPlanStructured && isValidTripPlan(payload.tripPlanStructured)) {
    return payload.tripPlanStructured;
  }
  return undefined;
}

export function tripPlanToStorageJson(doc: TripPlanDocument): string {
  return serializeTripPlan(doc);
}

export function tripPlanFromStorageJson(json?: string | null): TripPlanDocument | null {
  return parseTripPlanJsonString(json);
}

/** @deprecated */
export function looksLikeFullItinerary(_content: string): boolean {
  return false;
}

/** @deprecated */
export function extractTripPlanFromHistory(): string | undefined {
  return undefined;
}
