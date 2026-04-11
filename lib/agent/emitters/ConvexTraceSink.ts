import type { ITraceSink, ReasoningEvent } from "../contracts";

/**
 * 将事件写入 Convex（成员5 在接入 ConvexProvider 后把 Mutation 注入）。
 * 当前骨架：通过 HTTP 调用 Convex mutation 或直接在前端双写；此处保留类型与占位实现。
 */
export class ConvexTraceSink implements ITraceSink {
  constructor(private readonly append?: (e: ReasoningEvent) => Promise<void>) {}

  async emit(event: ReasoningEvent): Promise<void> {
    if (this.append) await this.append(event);
  }
}
