import type {
  IAutonomousAgent,
  IContextEngine,
  IKnowledgeService,
  IReflexionPolicy,
  IRunModeRouter,
  ISkillRegistry,
  ITraceSink,
  IToolRegistry,
} from "../contracts";
import { OpenAICompatibleClient } from "../llm/OpenAICompatibleClient";
import { ReactExecutor } from "../loops/ReactExecutor";
import { LLMPlanGenerator } from "../plan/LLMPlanGenerator";
import { LLMReflexionPolicy } from "../reflexion/LLMReflexionPolicy";
import { ReflexionPolicy } from "../reflexion/ReflexionPolicy";
import { createStubToolRegistry } from "../tools/factory";
import { IncrementalReviseWorkflow } from "./IncrementalReviseWorkflow";
import { LightweightWorkflow } from "./LightweightWorkflow";
import { MultiAgentCoordinator } from "./MultiAgentCoordinator";
import { PlanExecuteOrchestrator } from "./PlanExecuteOrchestrator";
import { RunModeRoutingAgent } from "./RunModeRoutingAgent";
import { RunModeRouter } from "./RunModeRouter";

export interface AutonomousAgentPipelineDeps {
  skillRegistry?: ISkillRegistry;
  knowledgeService?: IKnowledgeService;
  contextEngine?: IContextEngine;
  toolRegistry?: IToolRegistry;
  runModeRouter?: IRunModeRouter;
}

export function createReflexionPolicy(): IReflexionPolicy {
  const rules = new ReflexionPolicy();
  if (process.env.USE_LLM_REFLEXION === "true") {
    return new LLMReflexionPolicy(new OpenAICompatibleClient(), rules);
  }
  return rules;
}

function multiAgentCoordinatorEnabled(): boolean {
  const v = process.env.USE_MULTI_AGENT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 组装自治 Agent 流水线（含 runMode 路由：quick / incremental / full） */
export function createAutonomousAgentPipeline(
  traceSink?: ITraceSink,
  deps?: AutonomousAgentPipelineDeps
): IAutonomousAgent {
  void deps?.skillRegistry;
  void deps?.knowledgeService;
  void deps?.contextEngine;
  void deps?.runModeRouter;

  const registry = deps?.toolRegistry ?? createStubToolRegistry();
  const llmClient = new OpenAICompatibleClient();
  const planGenerator = new LLMPlanGenerator(llmClient);
  const reflexion = createReflexionPolicy();
  const react = new ReactExecutor(llmClient, registry, reflexion, 5);

  const full = multiAgentCoordinatorEnabled()
    ? new MultiAgentCoordinator(planGenerator, react, traceSink, llmClient)
    : new PlanExecuteOrchestrator(planGenerator, react, traceSink, llmClient);

  const quick = new LightweightWorkflow(llmClient, registry, traceSink);
  const incremental = new IncrementalReviseWorkflow(llmClient, traceSink);
  return new RunModeRoutingAgent(full, quick, incremental);
}

/** 默认 runMode 路由器（供 Convex action 等调用方使用） */
export function createRunModeRouter(): IRunModeRouter {
  return new RunModeRouter();
}
