import type { AgentRunInput, ExecutionPlan, PlanStep } from "../contracts";
import { getCanonicalDestination, getCanonicalOrigin, planReferencesWrongDestination } from "../tripPlan/tripContext";
import { planLacksFoodPoiStep } from "./ensureEssentialPlanSteps";

function flattenSteps(plan: ExecutionPlan): PlanStep[] {
  return plan.phases.flatMap((ph) => ph.steps ?? []);
}

function forcePlanRevision(): boolean {
  return process.env.FORCE_PLAN_REVISION === "1" || process.env.FORCE_PLAN_REVISION === "true";
}

/**
 * 初稿已具备可执行结构时，跳过「规划定稿」第二次 LLM（通常节省 30～60 秒）。
 * 目的地预检 / ensureEssentialPlanSteps 仍会在初稿后运行。
 */
export function planDraftIsExecutionReady(plan: ExecutionPlan, input: AgentRunInput): boolean {
  if (forcePlanRevision()) return false;
  if (process.env.SKIP_PLAN_REVISION === "1" || process.env.SKIP_PLAN_REVISION === "true") {
    return true;
  }

  const steps = flattenSteps(plan);
  if (steps.length < 3) return false;

  const dest = getCanonicalDestination(input);
  const origin = getCanonicalOrigin(input);
  if (dest && planReferencesWrongDestination(plan, dest, origin)) return false;

  const suggested = steps.flatMap((s) => s.suggestedTools ?? []);
  const hasWeather =
    suggested.includes("weather_forecast") ||
    steps.some((s) => /天气|weather_forecast/i.test(s.description));
  const poiSteps = steps.filter((s) => (s.suggestedTools ?? []).includes("poi_search"));
  const hasPoi = poiSteps.length >= 1;
  const hasFoodPoi = !planLacksFoodPoiStep(plan);

  const crossCity =
    Boolean(origin?.trim()) &&
    Boolean(dest?.trim()) &&
    origin!.replace(/市$/u, "") !== dest!.replace(/市$/u, "");
  const hasRail = !crossCity || suggested.includes("rail_schedule_hint");

  return hasWeather && hasPoi && hasFoodPoi && hasRail;
}
