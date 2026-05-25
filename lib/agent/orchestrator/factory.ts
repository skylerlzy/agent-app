import type {
  IAutonomousAgent,
  IReflexionPolicy,
  ISkillRegistry,
  ITraceSink,
} from "../contracts";
import { OpenAICompatibleClient } from "../llm/OpenAICompatibleClient";
import { ReactExecutor } from "../loops/ReactExecutor";
import { LLMPlanGenerator } from "../plan/LLMPlanGenerator";
import { LLMReflexionPolicy } from "../reflexion/LLMReflexionPolicy";
import { ReflexionPolicy } from "../reflexion/ReflexionPolicy";
import { createStubToolRegistry } from "../tools/factory";
import { IncrementalReviseWorkflow } from "./IncrementalReviseWorkflow";
import { LightweightWorkflow } from "./LightweightWorkflow";
import { PlanExecuteOrchestrator } from "./PlanExecuteOrchestrator";
import { RunModeRoutingAgent } from "./RunModeRoutingAgent";

export interface AutonomousAgentPipelineDeps {
  skillRegistry?: ISkillRegistry;
}

export function createReflexionPolicy(): IReflexionPolicy {
  const rules = new ReflexionPolicy();
  if (process.env.USE_LLM_REFLEXION === "true") {
    return new LLMReflexionPolicy(new OpenAICompatibleClient(), rules);
  }
  return rules;
}

/** 组装自治 Agent 流水线（含 runMode 路由：quick / incremental / full） */
export function createAutonomousAgentPipeline(
  traceSink?: ITraceSink,
  _deps?: AutonomousAgentPipelineDeps
): IAutonomousAgent {
  void _deps?.skillRegistry;
  const registry = createStubToolRegistry();
  const llmClient = new OpenAICompatibleClient();
  const planGenerator = new LLMPlanGenerator(llmClient);
  const reflexion = createReflexionPolicy();
  const react = new ReactExecutor(llmClient, registry, reflexion, 5);
  const full = new PlanExecuteOrchestrator(planGenerator, react, traceSink, llmClient);
  const quick = new LightweightWorkflow(llmClient, traceSink);
  const incremental = new IncrementalReviseWorkflow(llmClient, traceSink);
  return new RunModeRoutingAgent(full, quick, incremental);
}
