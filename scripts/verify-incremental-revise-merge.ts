/**
 * 增量修订合并逻辑冒烟测试（不含 LLM）
 * 运行：npx tsx scripts/verify-incremental-revise-merge.ts
 */
import type { TripPlanDocument } from "../lib/agent/tripPlan/types";
import {
  formatItineraryDiffSummary,
  mergeIncrementalTripPlan,
  tripPlanItineraryChanged,
} from "../lib/agent/tripPlan/incrementalReviseMerge";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

const baseline: TripPlanDocument = {
  version: 1,
  meta: { destination: "北京", tripStart: "2026-06-24", tripEnd: "2026-06-26" },
  overview: "北京三日游",
  weatherTips: "晴热",
  transport: "高铁",
  themesAndPlaces: ["胡同"],
  itinerary: [
    {
      title: "Day 1",
      dateIso: "2026-06-24",
      activities: {
        morning: [{ itineraryItem: "南京出发 · 抵达北京", briefDescription: "抵达" }],
        afternoon: [{ itineraryItem: "故宫博物院", briefDescription: "下午参观" }],
        evening: [{ itineraryItem: "天安门", briefDescription: "傍晚顺访天安门" }],
      },
    },
    {
      title: "Day 2",
      dateIso: "2026-06-25",
      activities: {
        morning: [{ itineraryItem: "天坛", briefDescription: "上午参观" }],
        afternoon: [],
        evening: [],
      },
    },
  ],
  foodAndBudget: "北京用餐参考",
  tipsAndDisclaimer: "仅供参考",
  topPlacesToVisit: [{ name: "故宫" }],
};

const llmRevised: TripPlanDocument = {
  ...baseline,
  itinerary: [
    {
      title: "Day 1",
      dateIso: "2026-06-24",
      activities: {
        morning: [{ itineraryItem: "南京出发 · 抵达北京", briefDescription: "抵达" }],
        afternoon: [{ itineraryItem: "故宫博物院", briefDescription: "下午参观" }],
        evening: [
          {
            itineraryItem: "清华大学",
            briefDescription: "晚上参观清华园，感受校园人文氛围。",
          },
        ],
      },
    },
    {
      title: "Day 2",
      dateIso: "2026-06-25",
      activities: {
        morning: [{ itineraryItem: "天坛", briefDescription: "上午参观" }],
        afternoon: [],
        evening: [],
      },
    },
  ],
};

const merged = mergeIncrementalTripPlan(baseline, llmRevised);
assert(
  merged.itinerary[0].activities.evening.some((a) => a.itineraryItem.includes("清华大学")),
  "合并后 Day1 晚上应为清华大学"
);
assert(
  !merged.itinerary[0].activities.evening.some((a) => a.itineraryItem.includes("天安门")),
  "合并后不应再保留天安门"
);
assert(
  merged.itinerary[0].activities.afternoon.some((a) => a.itineraryItem.includes("故宫")),
  "未修改的下午故宫应保留"
);
assert(tripPlanItineraryChanged(baseline, merged), "签名应变化");

const diff = formatItineraryDiffSummary(baseline, merged);
assert(diff.includes("天安门") && diff.includes("清华大学"), "diff 摘要包含替换信息");

const baseline3: TripPlanDocument = {
  ...baseline,
  itinerary: [
    ...baseline.itinerary,
    {
      title: "Day 3",
      dateIso: "2026-06-26",
      activities: {
        morning: [{ itineraryItem: "南锣鼓巷", briefDescription: "上午" }],
        afternoon: [{ itineraryItem: "北京 · 老城街巷", briefDescription: "胡同" }],
        evening: [{ itineraryItem: "北京 · 滨水慢行", briefDescription: "散步" }],
      },
    },
  ],
};

const partialRevised: TripPlanDocument = {
  ...baseline3,
  itinerary: [
    {
      title: "Day 3",
      dateIso: "2026-06-26",
      activities: {
        morning: [{ itineraryItem: "南锣鼓巷", briefDescription: "上午" }],
        afternoon: [],
        evening: [{ itineraryItem: "北京 · 滨水慢行", briefDescription: "散步" }],
      },
    },
  ],
};

const mergedPartial = mergeIncrementalTripPlan(baseline3, partialRevised);
assert(
  mergedPartial.itinerary[2].activities.afternoon.length === 0,
  "LLM 只返回 Day3 时也应正确清空第三天下午（按 dateIso 对齐）"
);
assert(
  mergedPartial.itinerary[0].activities.evening.some((a) => a.itineraryItem.includes("天安门")),
  "Day1 不应被错位合并覆盖"
);
assert(
  mergedPartial.itinerary[2].activities.morning.some((a) => a.itineraryItem.includes("南锣鼓巷")),
  "Day3 上午应保留"
);

if (failed > 0) {
  process.exit(1);
}
console.log("\nAll incremental revise merge checks passed.");
