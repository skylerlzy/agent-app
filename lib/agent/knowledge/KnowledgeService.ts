import type { IKnowledgeService, KnowledgeChunk, UserMemory } from "../contracts";
import { extractMemoryCandidates } from "./extractMemories";
import { rankKnowledgeChunks, type ScoredChunkCandidate } from "./retrieve";

export interface KnowledgeServiceStore {
  listMemories(input: {
    userId: string;
    conversationId?: string;
    sharedKnowledgeEnabled?: boolean;
  }): Promise<UserMemory[]>;
  saveMemories(input: {
    userId: string;
    conversationId: string;
    memories: Array<Pick<UserMemory, "kind" | "content">>;
  }): Promise<UserMemory[]>;
  listChunkCandidates(input: {
    userId: string;
    filters?: { city?: string; tags?: string[] };
  }): Promise<ScoredChunkCandidate[]>;
}

export class KnowledgeService implements IKnowledgeService {
  constructor(private readonly store: KnowledgeServiceStore) {}

  listLongTermMemories(
    userId: string,
    opts?: { conversationId?: string; sharedKnowledgeEnabled?: boolean }
  ): Promise<UserMemory[]> {
    return this.store.listMemories({
      userId,
      conversationId: opts?.conversationId,
      sharedKnowledgeEnabled: opts?.sharedKnowledgeEnabled,
    });
  }

  async extractMemoriesFromTurn(input: {
    userId: string;
    conversationId: string;
    userMessage: string;
    assistantReply: string;
  }): Promise<UserMemory[]> {
    const memories = extractMemoryCandidates(input);
    if (!memories.length) return [];
    return this.store.saveMemories({
      userId: input.userId,
      conversationId: input.conversationId,
      memories,
    });
  }

  async retrieve(input: {
    userId: string;
    query: string;
    topK?: number;
    filters?: { city?: string; tags?: string[] };
  }): Promise<KnowledgeChunk[]> {
    const candidates = await this.store.listChunkCandidates({
      userId: input.userId,
      filters: input.filters,
    });
    return rankKnowledgeChunks(input.query, candidates, input.topK);
  }
}
