import type {
  IAutonomousAgent,
  IReflexionPolicy,
  ITraceSink,
} from "../contracts";
import { MockLLMClient } from "../llm/MockLLMClient";
import { OpenAICompatibleClient } from "../llm/OpenAICompatibleClient";
import { ReactExecutor } from "../loops/ReactExecutor";
import { LLMPlanGenerator } from "../plan/LLMPlanGenerator";
import { LLMReflexionPolicy } from "../reflexion/LLMReflexionPolicy";
import { ReflexionPolicy } from "../reflexion/ReflexionPolicy";
import { createStubToolRegistry } from "../tools/factory";
import { PlanExecuteOrchestrator } from "./PlanExecuteOrchestrator";

export function createReflexionPolicy(): IReflexionPolicy {
  const rules = new ReflexionPolicy();
  if (process.env.USE_LLM_REFLEXION === "true") {
    const llm = process.env.DASHSCOPE_API_KEY ? new OpenAICompatibleClient() : new MockLLMClient();
    return new LLMReflexionPolicy(llm, rules);
  }
  return rules;
}

/** 组装自治 Agent 流水线（工具为占位实现，可替换） */
export function createAutonomousAgentPipeline(traceSink?: ITraceSink): IAutonomousAgent {
  const registry = createStubToolRegistry();
  const llmClient = process.env.DASHSCOPE_API_KEY || process.env.LLM_API_KEY
    ? new OpenAICompatibleClient()
    : new MockLLMClient();
  const planGenerator = new LLMPlanGenerator(llmClient);
  const reflexion = createReflexionPolicy();
  const react = new ReactExecutor(llmClient, registry, reflexion);
  return new PlanExecuteOrchestrator(planGenerator, react, traceSink);
}
