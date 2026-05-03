import type {
  IAutonomousAgent,
  IReflexionPolicy,
  ITraceSink,
} from "../contracts";
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
    return new LLMReflexionPolicy(new OpenAICompatibleClient(), rules);
  }
  return rules;
}

/** 组装自治 Agent 流水线（天气和风 QWeather、路程高德为真实 HTTP） */
export function createAutonomousAgentPipeline(traceSink?: ITraceSink): IAutonomousAgent {
  const registry = createStubToolRegistry();
  const llmClient = new OpenAICompatibleClient();
  const planGenerator = new LLMPlanGenerator(llmClient);
  const reflexion = createReflexionPolicy();
  const react = new ReactExecutor(llmClient, registry, reflexion, 8);
  return new PlanExecuteOrchestrator(planGenerator, react, traceSink, llmClient);
}
