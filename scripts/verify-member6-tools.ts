/**
 * 成员6 工具链本地冒烟检查（无需 Convex / API Key）
 * 运行：npx tsx scripts/verify-member6-tools.ts
 */
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

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
