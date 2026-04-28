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

  // 使用 Server-Sent Events (SSE) 来实时推送 events
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of pipeline.run(input)) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error(error);
        const errorData = `data: ${JSON.stringify({ type: "error", message: errorMessage(error) })}\n\n`;
        controller.enqueue(new TextEncoder().encode(errorData));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
