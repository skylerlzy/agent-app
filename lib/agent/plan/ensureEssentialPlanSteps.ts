import type { AgentRunInput, ExecutionPlan, PlanStep } from "../contracts";
import { getCanonicalDestination } from "../tripPlan/tripContext";
import { resolveFoodPoiKeywords } from "../tripPlan/supplementTripToolLogs";

const FOOD_STEP_PATTERN = /餐|美食|小吃|餐厅|老字号|饭|饮|清真|bar|咖啡|茶餐厅/i;

function flattenSteps(plan: ExecutionPlan): PlanStep[] {
  return plan.phases.flatMap((ph) => ph.steps ?? []);
}

export function planLacksFoodPoiStep(plan: ExecutionPlan): boolean {
  for (const step of flattenSteps(plan)) {
    const tools = step.suggestedTools ?? [];
    if (tools.includes("poi_search") && FOOD_STEP_PATTERN.test(step.description)) {
      return false;
    }
  }
  return true;
}

/** 若计划缺少餐饮 poi_search 步骤，追加一步（避免总结阶段无真实店名） */
export function ensureEssentialPlanSteps(
  plan: ExecutionPlan,
  input: AgentRunInput
): ExecutionPlan {
  if (!planLacksFoodPoiStep(plan)) return plan;

  const dest = getCanonicalDestination(input) ?? "目的地";
  const keywords = resolveFoodPoiKeywords(input)[0] ?? "特色美食 老字号餐厅";
  const step: PlanStep = {
    id: "s_food",
    description: `在${dest}检索餐饮 POI（keywords: ${keywords}），获取可写入行程的真实餐厅名称、地址与电话，至少 3 家。`,
    suggestedTools: ["poi_search"],
  };

  return {
    ...plan,
    phases: [
      ...plan.phases,
      {
        id: "p_food",
        title: "餐饮 POI 收集",
        steps: [step],
      },
    ],
  };
}
