import type { ChatMessage, ILLMClient } from "../contracts";

export class OpenAICompatibleClient implements ILLMClient {
  private apiKey = process.env.LLM_API_KEY || process.env.DASHSCOPE_API_KEY;
  private baseURL = process.env.LLM_API_BASE_URL || process.env.DASHSCOPE_BASE_URL;
  private model = process.env.LLM_MODEL || process.env.QWEN_MODEL || "qwen-turbo";

  private get endpoint() {
    if (!this.baseURL) {
      throw new Error("Missing LLM API base URL. Please set LLM_API_BASE_URL or DASHSCOPE_BASE_URL.");
    }
    if (!this.apiKey) {
      throw new Error("Missing LLM API key. Please set LLM_API_KEY or DASHSCOPE_API_KEY.");
    }
    return `${this.baseURL}/chat/completions`;
  }

  async complete(messages: ChatMessage[], options?: { temperature?: number }): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`LLM API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content || "";
  }

  /**
   * 实现带工具调用的补全（ReAct 模式核心）
   */
  async completeWithTools(
    messages: ChatMessage[],
    tools: { name: string; description: string; parameters: object }[]
  ): Promise<{ content: string | null; toolCalls?: { name: string; arguments: string }[] }> {

    // 将 contracts.ts 里的格式转换为 OpenAI 要求的工具格式
    const formattedTools = tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }
    }));

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        tools: formattedTools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`LLM API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const message = data.choices[0].message;

    return {
      content: message.content,
      toolCalls: message.tool_calls?.map((tc: any) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };
  }
}