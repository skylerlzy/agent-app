import type {
  AgentContextBundle,
  AgentRunInput,
  AgentRunMode,
  ChatMessage,
  IConversationContextBuilder,
  TripPreferences,
  ToolName,
} from "../contracts";
import { mergeGoalFromPreferences } from "../runtime/mergeGoalSlots";

export interface ConversationContextBuilderArgs {
  sessionId: string;
  userId: string;
  conversationId: string;
  userMessage: string;
  preferences: TripPreferences;
  history?: ChatMessage[];
  conversationSummary?: string;
  runMode?: AgentRunMode;
  activeSkillIds?: string[];
  enabledToolNames?: ToolName[];
}

export class ConversationContextBuilder implements IConversationContextBuilder {
  constructor(private maxHistoryMessages = 20) {}

  async buildRunInput(args: ConversationContextBuilderArgs): Promise<AgentRunInput> {
    const recentHistory = args.history ? args.history.slice(-this.maxHistoryMessages) : [];
    const contextBundle: AgentContextBundle = {
      conversationSummary: args.conversationSummary,
      longTermMemories: [],
      ragChunks: [],
    };

    return {
      sessionId: args.sessionId,
      conversationId: args.conversationId,
      goal: mergeGoalFromPreferences(args.userMessage, args.preferences),
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

/** 供 action 调用的纯函数入口（实现 IConversationContextBuilder 契约） */
export async function buildAgentRunInput(args: {
  sessionId: string;
  userId: string;
  conversationId: string;
  userMessage: string;
  preferences: TripPreferences;
  history?: ChatMessage[];
  conversationSummary?: string;
  runMode?: AgentRunMode;
  activeSkillIds?: string[];
  enabledToolNames?: ToolName[];
}): Promise<AgentRunInput> {
  return new ConversationContextBuilder().buildRunInput(args);
}
