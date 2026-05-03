import type { ChatMessage, ILLMClient, LLMCompletionOptions } from "../contracts";
import { fetchWithTimeout } from "../http/fetchWithTimeout";
import { resolveLLMConfig } from "./resolveLLMEnv";

function readTimeoutMs(): number {
  const raw = process.env.LLM_HTTP_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 120_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5_000 ? n : 120_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** LLM 网关在 429 时可能返回 Retry-After（秒或 HTTP-date） */
function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const asSec = Number(raw);
  if (Number.isFinite(asSec) && asSec >= 0) return asSec * 1000;
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

function read429RetryConfig() {
  const maxRetries = Math.min(14, Math.max(0, Math.floor(Number(process.env.LLM_429_MAX_RETRIES ?? "8"))));
  const baseMs = Math.max(500, Math.floor(Number(process.env.LLM_429_RETRY_BASE_MS ?? "3500")));
  const capMs = Math.max(baseMs, Math.floor(Number(process.env.LLM_429_RETRY_CAP_MS ?? "90000")));
  return { maxRetries, baseMs, capMs };
}

/** 两次 LLM 请求之间的最小间隔，减轻短时间多步 ReAct 触顶 429 */
let lastLlmRequestEndedAt = 0;

function readRequestGapMs(): number {
  const n = Math.floor(Number(process.env.LLM_REQUEST_GAP_MS ?? "500"));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30_000) : 500;
}

async function sleepUntilLlmGap(): Promise<void> {
  const gap = readRequestGapMs();
  if (gap <= 0) return;
  const elapsed = Date.now() - lastLlmRequestEndedAt;
  const wait = gap - elapsed;
  if (wait > 0) {
    console.log(`[agent-llm] LLM_REQUEST_GAP_MS 间隔等待 ${wait}ms`);
    await sleep(wait);
  }
}

function markLlmRequestEnded(): void {
  lastLlmRequestEndedAt = Date.now();
}

/** 常见过载文案：服务端已过载，此时多次快速重试往往全部 429，反而拉长总耗时 */
function isHeavyTraffic429Body(text: string): boolean {
  return /访问量过大|稍后再试|请求过于频繁|rate limit|too many requests/i.test(text);
}

function readHeavy429MaxRetries(): number {
  const n = Math.floor(Number(process.env.LLM_429_HEAVY_MAX_RETRIES ?? "2"));
  return Number.isFinite(n) && n >= 0 ? Math.min(6, n) : 2;
}

export class OpenAICompatibleClient implements ILLMClient {
  private readonly cfg = resolveLLMConfig();
  private readonly timeoutMs = readTimeoutMs();

  private get endpoint() {
    const normalizedBaseURL = this.cfg.baseURL.replace(/\/+$/, "");
    return `${normalizedBaseURL}/chat/completions`;
  }

  /**
   * 对 429 做指数退避 + 抖动重试（单次 Agent 会连续调用 plan / revise / 多步 ReAct，易触发 DashScope 限流）。
   */
  private async postChatCompletions(body: object, label: string): Promise<Response> {
    const { maxRetries, baseMs, capMs } = read429RetryConfig();

    await sleepUntilLlmGap();
    try {
      for (let attempt = 0; ; attempt++) {
        const response = await fetchWithTimeout(
          this.endpoint,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.cfg.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
          this.timeoutMs,
          `${label}: LLM 请求超时；可调大 Convex 环境变量 LLM_HTTP_TIMEOUT_MS`,
          `dashscope:${label}`
        );

        if (response.status !== 429) {
          return response;
        }

        let bodyPeek = "";
        try {
          bodyPeek = await response.clone().text();
        } catch {
          /* ignore */
        }
        const heavy = isHeavyTraffic429Body(bodyPeek);
        const effectiveMaxRetries = heavy ? Math.min(maxRetries, readHeavy429MaxRetries()) : maxRetries;

        if (attempt >= effectiveMaxRetries) {
          console.warn(
            `[agent-llm] HTTP 429 [${label}] 已达最大重试 ${effectiveMaxRetries}${heavy ? "（访问量过大类限流，已自动减少重试以免反复打满）" : ""}，放弃重试`
          );
          return response;
        }

        const fromHeader = parseRetryAfterMs(response);
        const exponential = Math.min(capMs, baseMs * 2 ** attempt);
        const trafficBump = !heavy && attempt >= 3 ? 1.6 : 1;
        const minWaitMs = heavy ? Math.max(10_000, Math.floor(Number(process.env.LLM_429_HEAVY_MIN_WAIT_MS ?? "12000"))) : 800;
        const baseWait = Math.max(minWaitMs, (fromHeader ?? exponential) * trafficBump);
        const jitter = baseWait * (0.88 + Math.random() * 0.24);
        const waitMs = Math.min(capMs, Math.max(minWaitMs, Math.round(jitter)));
        console.warn(
          `[agent-llm] HTTP 429 [${label}] 第 ${attempt + 1} 次重试前等待 ${waitMs}ms${heavy ? "（检测到访问量过大类提示）" : ""}`
        );
        await sleep(waitMs);
      }
    } finally {
      markLlmRequestEnded();
    }
  }

  async complete(messages: ChatMessage[], options?: LLMCompletionOptions): Promise<string> {
    const label = options?.requestLabel ?? "llm_complete";
    console.log(`[agent-llm] → ${label} model=${this.cfg.model} (chat/completions)`);
    const response = await this.postChatCompletions(
      {
        model: this.cfg.model,
        messages,
        temperature: options?.temperature ?? 0.7,
      },
      label
    );

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const err: { error?: { message?: string } } = await response.json();
        detail = err.error?.message ?? JSON.stringify(err);
      } catch {
        /* ignore */
      }
      throw new Error(`LLM 请求失败 (${response.status}) [${label}]: ${detail}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`LLM 返回空内容 [${label}]`);
    }
    return content;
  }

  async completeWithTools(
    messages: ChatMessage[],
    tools: { name: string; description: string; parameters: object }[],
    callOptions?: Pick<LLMCompletionOptions, "requestLabel">
  ): Promise<{ content: string | null; toolCalls?: { name: string; arguments: string }[] }> {
    const label = callOptions?.requestLabel ?? "llm_tools";
    if (!tools.length) {
      const text = await this.complete(messages, { requestLabel: `${label}_no_tools` });
      return { content: text, toolCalls: undefined };
    }

    console.log(`[agent-llm] → ${label} model=${this.cfg.model} (chat/completions+tools n=${tools.length})`);

    const formattedTools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.postChatCompletions(
      {
        model: this.cfg.model,
        messages,
        tools: formattedTools,
        tool_choice: "auto",
      },
      label
    );

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const err: { error?: { message?: string } } = await response.json();
        detail = err.error?.message ?? JSON.stringify(err);
      } catch {
        /* ignore */
      }
      throw new Error(`LLM 工具调用请求失败 (${response.status}) [${label}]: ${detail}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error(`LLM 返回格式异常（无 choices[0].message）[${label}]`);
    }

    const allowedNames = new Set(tools.map((t) => t.name));
    const rawCalls = (message.tool_calls ?? []) as {
      function?: { name?: string; arguments?: string };
    }[];
    const filtered = rawCalls.filter((tc) => tc.function?.name && allowedNames.has(tc.function.name));
    if (rawCalls.length > 0 && filtered.length === 0) {
      const attempted = rawCalls.map((tc) => tc.function?.name).filter(Boolean);
      console.warn(
        `[agent-llm] ${label}: 已丢弃未开放工具调用（仅允许 ${[...allowedNames].join(", ")}），模型输出: ${attempted.join(", ")}`
      );
    }

    return {
      content: message.content ?? null,
      toolCalls:
        filtered.length > 0
          ? filtered.map((tc) => ({
              name: String(tc.function?.name ?? ""),
              arguments: String(tc.function?.arguments ?? "{}"),
            }))
          : undefined,
    };
  }
}
