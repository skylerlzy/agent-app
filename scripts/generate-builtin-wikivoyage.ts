/**
 * 从 English Wikivoyage 拉取中国一二线城市条目，生成内置知识库 JSON。
 * 运行：npx tsx scripts/generate-builtin-wikivoyage.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { CHINA_TIER12_WIKIVOYAGE } from "../lib/agent/knowledge/chinaTier12Catalog";

const API = "https://en.wikivoyage.org/w/api.php";
const OUT = join(process.cwd(), "lib/agent/knowledge/data/builtin-wikivoyage.json");
const MAX_CHARS = 55_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchExtract(enTitle: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "extracts",
    explaintext: "1",
    titles: enTitle,
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": "VoyageMind-TravelAgent/1.0 (education project)" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    query?: { pages?: Record<string, { extract?: string; missing?: string }> };
  };
  const page = Object.values(json.query?.pages ?? {})[0];
  if (!page?.extract || page.missing) return null;
  return page.extract.trim().slice(0, MAX_CHARS);
}

async function main() {
  const documents: Array<{
    id: string;
    title: string;
    city: string;
    tier: number;
    tags: string[];
    sourceUrl: string;
    text: string;
  }> = [];

  const general = await fetchExtract("China");
  if (general && general.length > 200) {
    documents.push({
      id: "builtin:china-general",
      title: "China Travel Guide (Wikivoyage)",
      city: "",
      tier: 0,
      tags: ["China", "general", "Wikivoyage"],
      sourceUrl: "https://en.wikivoyage.org/wiki/China",
      text: `# China Travel Guide\n\n> Source: English Wikivoyage (CC BY-SA). Verify details before travel.\n\n${general}`,
    });
  }

  for (const city of CHINA_TIER12_WIKIVOYAGE) {
    process.stdout.write(`Fetching ${city.en}... `);
    const extract = await fetchExtract(city.en);
    await sleep(350);
    if (!extract || extract.length < 120) {
      console.log("skip");
      continue;
    }
    const slug = city.en.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    documents.push({
      id: `builtin:wikivoyage:${slug}`,
      title: `${city.zh}出行指南（Wikivoyage · ${city.en}）`,
      city: city.zh,
      tier: city.tier,
      tags: ["Wikivoyage", city.zh, city.en, city.tier === 1 ? "一线" : "二线"],
      sourceUrl: `https://en.wikivoyage.org/wiki/${encodeURIComponent(city.en)}`,
      text: `# ${city.zh} (${city.en}) Travel Guide\n\n> Source: [English Wikivoyage](https://en.wikivoyage.org/wiki/${encodeURIComponent(city.en)}). Content under CC BY-SA.\n\n${extract}`,
    });
    console.log(`ok (${extract.length} chars)`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "https://en.wikivoyage.org/wiki/Main_Page",
        documentCount: documents.length,
        documents,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nWrote ${documents.length} documents → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
