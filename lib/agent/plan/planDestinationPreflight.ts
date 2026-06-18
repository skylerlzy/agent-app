import type { AgentRunInput, ExecutionPlan, IPlanGenerator } from "../contracts";
import { agentDebug } from "../debugLog";
import {
  getCanonicalDestination,
  getCanonicalOrigin,
  planReferencesWrongDestination,
} from "../tripPlan/tripContext";

function destinationPreflightFeedback(input: AgentRunInput): string {
  const dest = getCanonicalDestination(input) ?? "目的地";
  return `严重错误：计划步骤中出现了非目的地「${dest}」的城市或景点（例如珠海/情侣路/香炉湾）。必须将所有 weather_forecast、poi_search、rail_schedule_hint 的参数改为目的地「${dest}」及行程日期；删除一切其它城市的 POI 查询。`;
}

/** 若计划含错误城市，自动修订一次 */
export async function ensurePlanMatchesDestination(
  planGenerator: IPlanGenerator,
  plan: ExecutionPlan,
  input: AgentRunInput
): Promise<ExecutionPlan> {
  const dest = getCanonicalDestination(input);
  const origin = getCanonicalOrigin(input);
  if (!dest || !planReferencesWrongDestination(plan, dest, origin)) {
    return plan;
  }
  const feedback = destinationPreflightFeedback(input);
  agentDebug(`[agent] plan preflight: wrong city, revising — ${feedback.slice(0, 120)}`);
  return planGenerator.revisePlan(plan, feedback);
}

export { planReferencesWrongDestination };
