import type {
  ChatMessage,
  ILLMClient,
  IReflexionPolicy,
  PlanStep,
  ReactTurn,
  ToolArguments,
  ToolError,
} from "../contracts";
import { ReflexionPolicy } from "./ReflexionPolicy";

const nextActionSchema = ["retry", "skip", "abort"] as const;

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/**
 * 可选：用 LLM 产出 diagnosis 与 nextAction；解析失败或调用失败时回退到规则策略。
 */
export class LLMReflexionPolicy implements IReflexionPolicy {
  constructor(
    private readonly llm: ILLMClient,
    private readonly fallback: IReflexionPolicy = new ReflexionPolicy()
  ) {}

  async decide(input: {
    step: PlanStep;
    error: ToolError;
    lastArgs: ToolArguments;
    history: ReactTurn[];
  }): Promise<{
    diagnosis: string;
    nextAction: "retry" | "skip" | "abort";
    patchedArgs?: ToolArguments;
  }> {
    try {
      const system: ChatMessage = {
        role: "system",
        content: [
          "你是出行 Agent 的反思模块。根据工具失败信息，决定下一步：retry（重试，可给出 patchedArgs 修正参数）、skip（跳过本步）、abort（终止整个任务）。",
          "只输出一个 JSON 对象，不要 Markdown，键：diagnosis（string）、nextAction（retry|skip|abort）、patchedArgs（object，可选，仅 retry 时需要）。",
        ].join("\n"),
      };
      const user: ChatMessage = {
        role: "user",
        content: JSON.stringify({
          stepDescription: input.step.description,
          suggestedTools: input.step.suggestedTools,
          error: input.error,
          lastArgs: input.lastArgs,
          priorTurns: input.history.map((h) => ({
            thought: h.thought,
            toolName: h.toolName,
            toolResultSummary: h.toolResultSummary,
          })),
        }),
      };

      const raw = await this.llm.complete([system, user], { temperature: 0.2 });
      const jsonStr = extractJsonObject(raw);
      if (!jsonStr) return this.fallback.decide(input);

      const parsed = JSON.parse(jsonStr) as {
        diagnosis?: string;
        nextAction?: string;
        patchedArgs?: ToolArguments;
      };

      const nextAction = parsed.nextAction;
      if (!nextAction || !nextActionSchema.includes(nextAction as (typeof nextActionSchema)[number])) {
        return this.fallback.decide(input);
      }

      const diagnosis =
        typeof parsed.diagnosis === "string" && parsed.diagnosis.length > 0
          ? parsed.diagnosis
          : `LLM 反思：${input.error.message}`;

      const action = nextAction as "retry" | "skip" | "abort";
      if (action === "retry") {
        return {
          diagnosis,
          nextAction: "retry",
          patchedArgs: parsed.patchedArgs ?? input.lastArgs,
        };
      }

      return { diagnosis, nextAction: action };
    } catch {
      return this.fallback.decide(input);
    }
  }
}
