/**
 * 校验迭代三评估数据集格式与平台任务清单一致性。
 * 运行：npx tsx scripts/validate-eval-datasets.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATASET_DIR = join(process.cwd(), "docs", "eval-datasets");

type PlatformTask = {
  caseId: string;
  sourceDataset: string;
  automation: string;
  name: string;
  evalGoal: string;
  dataset: string;
  evalPayload?: Record<string, unknown>;
};

type PlatformManifest = {
  version: string;
  tasks: PlatformTask[];
};

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATASET_DIR, file), "utf8")) as T;
}

const files = readdirSync(DATASET_DIR).filter((f) => f.endsWith(".json"));
assert(files.length >= 5, `eval-datasets 至少 5 个 JSON（当前 ${files.length}）`);

const manifest = readJson<PlatformManifest>("iter3-eval-platform-tasks.json");
assert(manifest.version.startsWith("iter3-platform"), "平台清单 version 正确");
assert(manifest.tasks.length >= 16, `平台任务数 ≥16（当前 ${manifest.tasks.length}）`);

const caseIds = new Set<string>();
for (const t of manifest.tasks) {
  assert(Boolean(t.caseId), "每条任务有 caseId");
  assert(!caseIds.has(t.caseId), `caseId 唯一: ${t.caseId}`);
  caseIds.add(t.caseId);
  assert(Boolean(t.evalGoal) || t.automation === "manual", `${t.caseId} 有 evalGoal 或标记 manual`);
  assert(Boolean(t.dataset), `${t.caseId} 有 dataset 参考文本`);
  assert(files.includes(t.sourceDataset), `${t.caseId} 的 sourceDataset 存在`);
}

const autoTasks = manifest.tasks.filter((t) => t.automation !== "manual");
const manualTasks = manifest.tasks.filter((t) => t.automation === "manual");
assert(autoTasks.length >= 13, `可平台自动跑任务 ≥13（当前 ${autoTasks.length}）`);
assert(manualTasks.length >= 3, `手工前置任务 ≥3（当前 ${manualTasks.length}）`);

const tools = readJson<{ cases: Array<{ id: string; goal?: string }> }>("iter3-tools-correctness.json");
assert(tools.cases.length >= 6, "工具链用例 ≥6");
for (const c of tools.cases) {
  assert(Boolean(c.id && c.goal), `tools case ${c.id} 有 id+goal`);
}

const trip = readJson<{ cases: Array<{ id: string; goal: string }> }>("iter3-trip-generation.json");
assert(trip.cases.length >= 5, "行程生成用例 ≥5");

const runmode = readJson<{ cases: Array<{ id: string; input: string }> }>("iter3-runmode-routing.json");
assert(runmode.cases.length >= 5, "runMode 用例 ≥5");

const rag = readJson<{ cases: Array<{ id: string; input: string; setup: string[] }> }>(
  "iter3-rag-cross-memory.json"
);
assert(rag.cases.length >= 3, "RAG/记忆用例 ≥3");
for (const c of rag.cases) {
  assert(Array.isArray(c.setup) && c.setup.length > 0, `rag case ${c.id} 有 setup 步骤`);
}

const platformCaseIdsFromSources = new Set<string>();
for (const file of ["iter3-tools-correctness.json", "iter3-runmode-routing.json", "iter3-trip-generation.json"]) {
  const data = readJson<{ cases: Array<{ id: string }> }>(file);
  for (const c of data.cases) {
    platformCaseIdsFromSources.add(c.id);
  }
}
for (const id of rag.cases.map((c) => c.id)) {
  platformCaseIdsFromSources.add(id);
}

for (const t of manifest.tasks) {
  assert(platformCaseIdsFromSources.has(t.caseId), `平台任务 ${t.caseId} 在源数据集中有对应条目`);
}

const tg01 = manifest.tasks.find((t) => t.caseId === "TG-01");
assert(Boolean(tg01?.evalPayload?.preferences), "TG-01 含 preferences");
assert(
  Array.isArray(tg01?.evalPayload?.activeSkillIds) &&
    (tg01?.evalPayload?.activeSkillIds as string[]).includes("builtin:couple-romantic-travel"),
  "TG-01 含 couple skill"
);

const t04 = manifest.tasks.find((t) => t.caseId === "T-04");
assert(
  Array.isArray(t04?.evalPayload?.enabledToolNames) &&
    !(t04?.evalPayload?.enabledToolNames as string[]).includes("weather_forecast"),
  "T-04 关闭 weather 工具"
);

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
