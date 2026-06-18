/**
 * 增量修订 operations 冒烟测试
 * 运行：npx tsx scripts/verify-incremental-revise-operations.ts
 */
import type { TripPlanDocument } from "../lib/agent/tripPlan/types";
import {
  applyRevisionOperations,
  parseRevisionOperations,
} from "../lib/agent/tripPlan/incrementalReviseOperations";
import { tripPlanItineraryChanged } from "../lib/agent/tripPlan/incrementalReviseMerge";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

const plan: TripPlanDocument = {
  version: 1,
  meta: { destination: "北京" },
  overview: "x",
  weatherTips: "x",
  transport: "x",
  themesAndPlaces: [],
  itinerary: [
    {
      title: "Day 1",
      dateIso: "2026-06-24",
      activities: {
        morning: [{ itineraryItem: "抵达", briefDescription: "a" }],
        afternoon: [{ itineraryItem: "故宫", briefDescription: "b" }],
        evening: [{ itineraryItem: "天安门", briefDescription: "c" }],
      },
    },
    {
      title: "Day 3",
      dateIso: "2026-06-26",
      activities: {
        morning: [{ itineraryItem: "南锣鼓巷", briefDescription: "d" }],
        afternoon: [{ itineraryItem: "老城街巷", briefDescription: "e" }],
        evening: [{ itineraryItem: "滨水慢行", briefDescription: "f" }],
      },
    },
  ],
  foodAndBudget: "",
  tipsAndDisclaimer: "",
  topPlacesToVisit: [],
};

const ops = parseRevisionOperations([
  { action: "replace", slot: "evening", dayIndex: 1, itineraryItem: "清华大学", briefDescription: "参观清华" },
  { action: "clear", slot: "afternoon", dayIndex: 3, dateIso: "2026-06-26" },
]);

assert(ops.length === 2, "parse operations");

const after = applyRevisionOperations(plan, ops);
assert(
  after.itinerary[0].activities.evening.some((a) => a.itineraryItem.includes("清华大学")),
  "Day1 evening 替换为清华"
);
assert(after.itinerary[1].activities.afternoon.length === 0, "Day3 afternoon 清空");
assert(tripPlanItineraryChanged(plan, after), "应有变化");

if (failed > 0) process.exit(1);
console.log("\nAll incremental revise operations checks passed.");
