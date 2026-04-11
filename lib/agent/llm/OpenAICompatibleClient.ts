import type { ChatMessage, ILLMClient } from "../contracts";

/**
 * LLM 适配骨架（成员2 实现 complete / completeWithTools，对接 DashScope 等）。
 * 禁止在此文件硬编码 API Key。
 */
export class OpenAICompatibleClient implements ILLMClient {
  async complete(_messages: ChatMessage[], _options?: { temperature?: number }): Promise<string> {
    throw new Error("OpenAICompatibleClient.complete 待成员2 实现");
  }
}
