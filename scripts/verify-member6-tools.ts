/**
 * 成员6 工具链 + 意图路由本地冒烟（无需 Convex / API Key）
 * 运行：npx tsx scripts/verify-member6-tools.ts
 */
import { parseRunModeDecisionJson } from "../lib/agent/orchestrator/runModeDecision";
import { parseIncrementalReviseOutput } from "../lib/agent/orchestrator/incrementalReviseOutput";
import {
  ensureKnowledgeCitations,
  getBuiltinKnowledgeCandidates,
  hybridRankKnowledgeChunks,
  inferKnowledgeCityFromText,
  rankKnowledgeChunks,
  scopeCandidatesToQueryCity,
  verifyBuiltinKnowledgeBundle,
  EXPECTED_BUILTIN_DOCUMENT_COUNT,
} from "../lib/agent/knowledge";
import { validateToolArguments } from "../lib/agent/tools/ToolArgumentValidator";
import {
  createConfigurableToolRegistry,
  createFullToolRegistry,
} from "../lib/agent/tools/factory";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

const emptyCity = validateToolArguments("weather_forecast", { city: "  " });
assert(!emptyCity.ok && emptyCity.error.code === "WEATHER_CITY_REQUIRED", "空 city 拦截");

const badDate = validateToolArguments("weather_forecast", { city: "南京", dateIso: "2026/07/01" });
assert(!badDate.ok && badDate.error.code === "DATE_ISO_INVALID", "非法 dateIso 拦截");

const crossTransit = validateToolArguments("maps_route_estimate", {
  origin: "南京南站",
  destination: "上海虹桥",
  mode: "transit",
});
assert(!crossTransit.ok && crossTransit.error.code === "MAPS_TRANSIT_CROSS_CITY", "跨城 transit 拦截");

const poiOk = validateToolArguments("poi_search", { keywords: "中山陵", city: "南京" });
assert(poiOk.ok, "poi_search 合法参数通过");

const railOk = validateToolArguments("rail_schedule_hint", {
  originCity: "北京",
  destinationCity: "上海",
  dateIso: "2026-07-01",
});
assert(railOk.ok, "rail_schedule_hint 合法参数通过");

const llmParsed = parseRunModeDecisionJson(
  '{"mode":"incremental_revise","confidence":0.91,"reason":"用户要求把渔女加入第三天"}'
);
assert(llmParsed?.mode === "incremental_revise" && llmParsed.source === "llm", "LLM 路由 JSON 解析");

const reviseParsed = parseIncrementalReviseOutput(
  JSON.stringify({
    chatReply: "已将渔女雕像加入 Day3 清晨时段。",
    tripPlanStructured: {
      version: 1,
      meta: { destination: "南京", origin: "上海", tripStart: "2026-07-01", tripEnd: "2026-07-03" },
      overview: "南京三日慢游修订版。",
      weatherTips: "7 月炎热，注意防晒。",
      transport: "高铁往返。",
      themesAndPlaces: ["中山陵"],
      itinerary: [
        {
          title: "Day 1",
          dateIso: "2026-07-01",
          activities: {
            morning: [{ itineraryItem: "中山陵", briefDescription: "上午参观中山陵。" }],
            afternoon: [],
            evening: [],
          },
        },
      ],
      foodAndBudget: "人均约 200 元/天。",
      tipsAndDisclaimer: "行程仅供参考。",
      topPlacesToVisit: [{ name: "中山陵" }],
    },
  })
);
assert(Boolean(reviseParsed?.chatReply.includes("渔女")), "增量修订 JSON 解析 chatReply");
assert(reviseParsed?.tripPlanStructured?.meta?.destination === "南京", "增量修订 JSON 解析 tripPlanStructured");

assert(
  ensureKnowledgeCitations("推荐老门东夜游。", [
    {
      chunkId: "c1",
      documentId: "d1",
      documentTitle: "南京慢游攻略",
      content: "老门东适合夜游",
      citation: "第 1 段",
      score: 3,
    },
  ]).includes("[来源: 南京慢游攻略 · 第 1 段]"),
  "缺失出处时自动追加 citations"
);

const builtinRanked = rankKnowledgeChunks(
  "南京三日慢游晚上适合去哪 老门东",
  getBuiltinKnowledgeCandidates({ city: "南京" }),
  3
);
assert(builtinRanked.length > 0 && /南京/.test(builtinRanked[0].documentTitle), "内置南京攻略可被检索");

const zhuhaiRanked = rankKnowledgeChunks(
  "珠海情侣路 野狸岛",
  getBuiltinKnowledgeCandidates({ city: "珠海" }),
  3
);
assert(zhuhaiRanked.length > 0 && /珠海/.test(zhuhaiRanked[0].documentTitle + zhuhaiRanked[0].content), "内置珠海攻略可被检索");

const zhuhaiFoodScoped = rankKnowledgeChunks(
  "推荐一些珠海美食",
  scopeCandidatesToQueryCity(
    "推荐一些珠海美食",
    getBuiltinKnowledgeCandidates({ city: "珠海" })
  ),
  5
);
assert(
  zhuhaiFoodScoped.every((c) => !c.documentTitle.includes("北京") || c.documentTitle.includes("珠海")),
  "珠海美食问题优先珠海文档"
);
assert(inferKnowledgeCityFromText("推荐一些珠海美食") === "珠海", "从问题推断珠海");

const bundle = verifyBuiltinKnowledgeBundle();
assert(bundle.ok && bundle.documentCount === EXPECTED_BUILTIN_DOCUMENT_COUNT, `内置 ${EXPECTED_BUILTIN_DOCUMENT_COUNT} 份文档已打包`);
assert(bundle.offlineReady, "内置文档支持离线关键词检索");

const mockVecA = [1, 0, 0];
const mockVecB = [0.9, 0.1, 0];
const mockVecC = [0, 1, 0];
const hybridCandidates = getBuiltinKnowledgeCandidates({ city: "南京" }).slice(0, 3).map((c, i) => ({
  ...c,
  embedding: i === 0 ? mockVecA : i === 1 ? mockVecB : mockVecC,
}));
const hybridRanked = hybridRankKnowledgeChunks(
  "晚上去哪散步 夜景",
  hybridCandidates,
  2,
  mockVecB
);
assert(hybridRanked.mode === "hybrid" && hybridRanked.chunks.length > 0, "混合检索在提供 query 向量时启用");

const full = createFullToolRegistry();
assert(full.list().length === 4, "注册表含 4 个工具");

const noWeather = createConfigurableToolRegistry({
  userSettings: [{ userId: "u", toolName: "weather_forecast", enabled: false, updatedAt: 0 }],
});
assert(
  !noWeather.list().some((t) => t.name === "weather_forecast"),
  "全局关闭 weather 后 registry 无 weather_forecast"
);

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
