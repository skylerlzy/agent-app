import type {
  IAutonomousAgent,
  IPlanGenerator,
  IReactExecutor,
  IReflexionPolicy,
  IToolRegistry,
  ITraceSink,
} from "../contracts";
import { MockLLMClient } from "../llm/MockLLMClient";
import { OpenAICompatibleClient } from "../llm/OpenAICompatibleClient";
import { ReactExecutor } from "../loops/ReactExecutor";
import { StubPlanGenerator } from "../plan/StubPlanGenerator";
import { LLMReflexionPolicy } from "../reflexion/LLMReflexionPolicy";
import { ReflexionPolicy } from "../reflexion/ReflexionPolicy";
import { createStubToolRegistry } from "../tools/factory";
import { PlanExecuteOrchestrator } from "./PlanExecuteOrchestrator";
import {LLMPlanGenerator} from "@/lib/agent/plan/LLMPlanGenerator";

export interface AutonomousAgentPipelineOptions {
  planGenerator?: IPlanGenerator;
  reactExecutor?: IReactExecutor;
  reflexionPolicy?: IReflexionPolicy;
  toolRegistry?: IToolRegistry;
  traceSink?: ITraceSink;
  maxReactTurns?: number;
}

function isTraceSink(value: ITraceSink | AutonomousAgentPipelineOptions): value is ITraceSink {
  return "emit" in value && !("traceSink" in value);
}

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
  const llmClient = new OpenAICompatibleClient();
  const planGenerator = new LLMPlanGenerator(llmClient);
  const reflexion = createReflexionPolicy();
  const react = new ReactExecutor(llmClient,registry, reflexion);
  return new PlanExecuteOrchestrator(planGenerator, react, traceSink);
}
