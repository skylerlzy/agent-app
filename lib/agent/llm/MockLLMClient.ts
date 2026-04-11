import type { ChatMessage, ILLMClient } from "../contracts";

/** 无 API Key 时的占位客户端，仅用于本地 UI 骨架联调 */
export class MockLLMClient implements ILLMClient {
  async complete(messages: ChatMessage[]): Promise<string> {
    return `[mock-llm] ${messages.at(-1)?.content ?? ""}`;
  }
}
