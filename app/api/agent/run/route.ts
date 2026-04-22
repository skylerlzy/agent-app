import { NextResponse } from "next/server";
import { z } from "zod";
import type { AgentRunInput, ReasoningEvent } from "@/lib/agent/contracts";
import { createAutonomousAgentPipeline } from "@/lib/agent/orchestrator/factory";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  goal: z.object({
    rawText: z.string().min(1),
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
    userId: z.string().min(1),
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data as AgentRunInput;
  const pipeline = createAutonomousAgentPipeline();
  const events: ReasoningEvent[] = [];

  try {
    for await (const event of pipeline.run(input)) {
      events.push(event);
    }
    return NextResponse.json({ events });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Agent pipeline failed before it could emit a run_error event.",
        detail: errorMessage(error),
        events,
      },
      { status: 500 }
    );
  }
}
