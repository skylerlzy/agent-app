import { NextResponse } from "next/server";
import { z } from "zod";
import type { AgentRunInput, ReasoningEvent } from "@/lib/agent/contracts";
import { createAutonomousAgentPipeline } from "@/lib/agent/orchestrator/factory";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string(),
  goal: z.object({
    rawText: z.string(),
    slots: z
      .object({
        originCity: z.string().optional(),
        destination: z.string().optional(),
        startDateIso: z.string().optional(),
        endDateIso: z.string().optional(),
        budgetCny: z.number().optional(),
        pace: z.enum(["slow", "balanced", "fast"]).optional(),
      })
      .optional(),
  }),
  context: z.object({
    userId: z.string(),
    preferences: z
      .object({
        dietaryNotes: z.string().optional(),
        mobilityNeeds: z.string().optional(),
        maxDailyTransitMinutes: z.number().optional(),
      })
      .default({}),
    calendarBusyWindows: z
      .array(
        z.object({
          start: z.number(),
          end: z.number(),
          label: z.string().optional(),
        })
      )
      .optional(),
  }),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data as AgentRunInput;
    const pipeline = createAutonomousAgentPipeline();
    const events: ReasoningEvent[] = [];
    for await (const ev of pipeline.run(input)) {
      events.push(ev);
    }
    return NextResponse.json({ events });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
