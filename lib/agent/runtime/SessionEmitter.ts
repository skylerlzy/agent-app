import type { IEventEmitter, ReasoningEvent } from "../contracts";

/** 为单次 Agent 运行分配单调递增 seq，并补齐 ts / sessionId */
export class SessionEmitter implements IEventEmitter {
  private seq = 0;

  constructor(private readonly sessionId: string) {}

  emit<E extends ReasoningEvent>(partial: Omit<E, "seq" | "ts" | "sessionId">): E {
    const seq = ++this.seq;
    return {
      ...partial,
      seq,
      ts: Date.now(),
      sessionId: this.sessionId,
    } as E;
  }
}
