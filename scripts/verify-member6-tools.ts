/**
 * 成员6 工具链本地冒烟检查（无需 Convex / API Key）
 * 运行：npx tsx scripts/verify-member6-tools.ts
 */
import { decideRunMode } from "../lib/agent/orchestrator/RunModeRouter";
import { parseRunModeDecisionJson } from "../lib/agent/orchestrator/runModeDecision";
import { parseIncrementalReviseOutput } from "../lib/agent/orchestrator/incrementalReviseOutput";
import {
  ensureKnowledgeCitations,
  getBuiltinKnowledgeCandidates,
  inferKnowledgeCityFromText,
  rankKnowledgeChunks,
  scopeCandidatesToQueryCity,
  shouldRetrieveKnowledge,
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

assert(
  decideRunMode({ goalText: "从南京去珠海玩", history: [], hasExistingPlan: false }) ===
    "full_plan_execute",
  "新对话「从南京去珠海玩」须走 full_plan_execute"
);
assert(
  decideRunMode({ goalText: "南京天气怎么样", history: [], hasExistingPlan: false }) ===
    "quick_reply",
  "新对话天气问答仍走 quick_reply"
);
assert(
  decideRunMode({ goalText: "复述一下 Day2", history: [], hasExistingPlan: true }) ===
    "quick_reply",
  "已有方案复述走 quick_reply"
);
assert(
  decideRunMode({
    goalText: "第三天节奏更加紧凑一些，白天多安排一些活动",
    history: [],
    hasExistingPlan: true,
  }) === "incremental_revise",
  "已有方案改 Day3 节奏走 incremental_revise"
);
assert(
  decideRunMode({
    goalText: "渔女加入第三天日程",
    history: [],
    hasExistingPlan: true,
  }) === "incremental_revise",
  "已有方案把景点加入 Day3 走 incremental_revise"
);

const llmParsed = parseRunModeDecisionJson(
  '{"mode":"incremental_revise","confidence":0.91,"reason":"用户要求把渔女加入第三天"}'
);
assert(llmParsed?.mode === "incremental_revise" && llmParsed.source === "llm", "LLM 路由 JSON 解析");

const reviseParsed = parseIncrementalReviseOutput(
  JSON.stringify({
    chatReply: "已将渔女雕像加入 Day3 清晨时段。",
    tripPlanMarkdown: "## 行程总览\n修订说明\n\n## 日程建议（按天）\nDay3 …",
  })
);
assert(Boolean(reviseParsed?.chatReply.includes("渔女")), "增量修订 JSON 解析 chatReply");
assert(Boolean(reviseParsed?.tripPlanMarkdown.includes("日程建议")), "增量修订 JSON 解析 tripPlanMarkdown");

assert(
  shouldRetrieveKnowledge({ goalText: "南京三日慢游有什么适合晚上安排的地点？", runMode: "quick_reply" }),
  "攻略类问题应触发 RAG"
);
assert(
  !shouldRetrieveKnowledge({ goalText: "渔女加入第三天日程", runMode: "incremental_revise" }),
  "纯日程修订不应触发 RAG"
);
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
assert(builtinRanked.length > 0 && builtinRanked[0].documentTitle.includes("南京"), "内置南京攻略可被检索");

const zhuhaiRanked = rankKnowledgeChunks(
  "珠海情侣路 野狸岛 爱情邮局",
  getBuiltinKnowledgeCandidates({ city: "珠海" }),
  3
);
assert(zhuhaiRanked.length > 0 && /珠海|野狸岛/.test(zhuhaiRanked[0].documentTitle + zhuhaiRanked[0].content), "内置珠海攻略可被检索");

const zhuhaiFoodScoped = rankKnowledgeChunks(
  "推荐一些珠海美食",
  scopeCandidatesToQueryCity(
    "推荐一些珠海美食",
    getBuiltinKnowledgeCandidates({ city: "珠海" })
  ),
  5
);
assert(
  zhuhaiFoodScoped.every((c) => !c.documentTitle.includes("南京")),
  "珠海美食问题不应召回南京专属文档"
);
assert(inferKnowledgeCityFromText("推荐一些珠海美食") === "珠海", "从问题推断珠海");

const full = createFullToolRegistry();
assert(full.list().length === 4, "注册表含 4 个工具");

const noWeather = createConfigurableToolRegistry({
  userSettings: [{ userId: "u", toolName: "weather_forecast", enabled: false, updatedAt: 0 }],
});
assert(
  !noWeather.list().some((t) => t.name === "weather_forecast"),
  "全局关闭 weather 后 registry 无 weather_forecast"
);

const poiOnly = createConfigurableToolRegistry({ enabledToolNames: ["poi_search"] });
assert(
  poiOnly.list().length === 1 && poiOnly.list()[0]?.name === "poi_search",
  "对话级 enabledToolNames 仅暴露 poi_search"
);

const emptyMeansAll = createConfigurableToolRegistry({ enabledToolNames: [] });
assert(emptyMeansAll.list().length === 4, "对话级空 enabledToolNames 不传白名单时默认全开");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
