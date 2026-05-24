import type {
  AgentContextBundle,
  AgentRunInput,
  AgentRunMode,
  ChatMessage,
  IConversationContextBuilder,
  TripPreferences,
  ToolName,
} from "../contracts";

export interface ConversationContextBuilderArgs {
  userId: string;
  conversationId: string;
  userMessage: string;
  preferences: TripPreferences;
  history?: ChatMessage[];
  runMode?: AgentRunMode;
  activeSkillIds?: string[];
  enabledToolNames?: ToolName[];
}

export class ConversationContextBuilder implements IConversationContextBuilder {
  constructor(private maxHistoryMessages = 20) {}

  async buildRunInput(args: ConversationContextBuilderArgs): Promise<AgentRunInput> {
    const recentHistory = args.history ? args.history.slice(-this.maxHistoryMessages) : [];
    const contextBundle: AgentContextBundle = {
      longTermMemories: [],
      ragChunks: [],
    };

    return {
      sessionId: `conversation-${args.conversationId}-${Date.now()}`,
      conversationId: args.conversationId,
      goal: {
        rawText: args.userMessage,
      },
      context: {
        userId: args.userId,
        preferences: args.preferences,
      },
      history: recentHistory,
      runMode: args.runMode ?? "full_plan_execute",
      contextBundle,
      activeSkillIds: args.activeSkillIds,
      enabledToolNames: args.enabledToolNames,
    };
  }
}
