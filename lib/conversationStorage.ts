import type { ReasoningEvent, TripPreferences } from "@/lib/agent/contracts";

const STORAGE_KEY = "agent-app.conversations.v1";

export type MessageStatus = "pending" | "running" | "done" | "error";

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sessionId?: string;
  status?: MessageStatus;
  /** 运行结束后缓存轨迹，便于切换对话后仍可展开推理 */
  traceEvents?: ReasoningEvent[];
  createdAt: number;
}

export interface ConversationPreferences {
  tripStart: string;
  tripEnd: string;
  travelThemes: string[];
  pace: "" | "slow" | "balanced" | "fast";
  accommodationType: "" | "hotel" | "airbnb" | "hostel" | "camping";
  dietaryPreset: "" | "none" | "vegetarian" | "halal" | "local";
  transportPreferences: string[];
  travelParty: "" | "solo" | "couple" | "family" | "group";
  budgetCny: string;
  dietaryNotes: string;
  additionalNotes: string;
}

export interface LocalConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredChatMessage[];
  preferences: ConversationPreferences;
  /** 本轮对话附加的 Skill id */
  activeSkillIds: string[];
}

export function defaultPreferences(): ConversationPreferences {
  return {
    tripStart: "",
    tripEnd: "",
    travelThemes: [],
    pace: "",
    accommodationType: "",
    dietaryPreset: "",
    transportPreferences: [],
    travelParty: "",
    budgetCny: "",
    dietaryNotes: "",
    additionalNotes: "",
  };
}

export function createConversation(title = "新对话"): LocalConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    preferences: defaultPreferences(),
    activeSkillIds: [],
  };
}

export function loadConversations(): LocalConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalConversation[];
    return Array.isArray(parsed)
      ? parsed.map((c) => ({
          ...c,
          activeSkillIds: Array.isArray(c.activeSkillIds) ? c.activeSkillIds : [],
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: LocalConversation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function extractSummaryFromEvents(events: ReasoningEvent[]): string {
  const runDone = [...events].reverse().find((e) => e.type === "run_done");
  if (runDone && runDone.type === "run_done") {
    return String(runDone.payload.summary ?? "").trim();
  }
  const runErr = [...events].reverse().find((e) => e.type === "run_error");
  if (runErr && runErr.type === "run_error") {
    return `运行失败：${runErr.payload.message}`;
  }
  return "";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 将对话内偏好表单转为后端 runAgent 所需的 preferences 对象 */
export function toTripPreferences(prefs: ConversationPreferences): TripPreferences {
  const budgetNum = prefs.budgetCny.trim() ? Number(prefs.budgetCny.trim()) : undefined;
  const start = prefs.tripStart.trim();
  const end = prefs.tripEnd.trim();
  return {
    tripStartDateIso: ISO_DAY.test(start) ? start : undefined,
    tripEndDateIso: ISO_DAY.test(end) ? end : undefined,
    travelThemes: prefs.travelThemes.length ? prefs.travelThemes : undefined,
    pace: prefs.pace || undefined,
    accommodationType: prefs.accommodationType || undefined,
    dietaryPreset: prefs.dietaryPreset === "" ? undefined : prefs.dietaryPreset,
    transportPreferences: prefs.transportPreferences.length ? prefs.transportPreferences : undefined,
    travelParty: prefs.travelParty || undefined,
    budgetCny:
      budgetNum !== undefined && Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
    dietaryNotes: prefs.dietaryNotes.trim() || undefined,
    additionalNotes: prefs.additionalNotes.trim() || undefined,
  };
}

export function autoTitleFromMessage(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "新对话";
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
}
