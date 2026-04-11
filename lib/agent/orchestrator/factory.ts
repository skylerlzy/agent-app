import type { IAutonomousAgent, ITraceSink } from "../contracts";
import { StubPlanGenerator } from "../plan/StubPlanGenerator";
import { ReactExecutor } from "../loops/ReactExecutor";
import { ReflexionPolicy } from "../reflexion/ReflexionPolicy";
import { createStubToolRegistry } from "../tools/factory";
import { PlanExecuteOrchestrator } from "./PlanExecuteOrchestrator";

/** 组装自治 Agent 流水线（工具为占位实现，可替换） */
export function createAutonomousAgentPipeline(traceSink?: ITraceSink): IAutonomousAgent {
  const registry = createStubToolRegistry();
  const planGen = new StubPlanGenerator();
  const reflexion = new ReflexionPolicy();
  const react = new ReactExecutor(registry, reflexion);
  return new PlanExecuteOrchestrator(planGen, react, traceSink);
}
