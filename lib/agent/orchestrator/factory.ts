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

export function createAutonomousAgentPipeline(
  input?: ITraceSink | AutonomousAgentPipelineOptions
): IAutonomousAgent {
  const options = input ? (isTraceSink(input) ? { traceSink: input } : input) : {};
  const registry = options.toolRegistry ?? createStubToolRegistry();
  const planGenerator = options.planGenerator ?? new StubPlanGenerator();
  const reflexion = options.reflexionPolicy ?? createReflexionPolicy();
  const reactExecutor =
    options.reactExecutor ?? new ReactExecutor(registry, reflexion, options.maxReactTurns);

  return new PlanExecuteOrchestrator(planGenerator, reactExecutor, options.traceSink);
}
