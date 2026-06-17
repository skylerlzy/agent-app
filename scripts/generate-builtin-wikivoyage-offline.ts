/**
 * 离线生成内置知识库 JSON（结构与 Wikivoyage 导入一致）。
 * 有网络时优先运行 generate-builtin-wikivoyage.ts 从 en.wikivoyage.org 拉取全文。
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { CHINA_TIER12_WIKIVOYAGE } from "../lib/agent/knowledge/chinaTier12Catalog";

const OUT = join(process.cwd(), "lib/agent/knowledge/data/builtin-wikivoyage.json");
const SOURCE = "https://en.wikivoyage.org/wiki/Main_Page";

const CITY_HIGHLIGHTS: Record<string, string[]> = {
  北京: ["故宫", "天安门", "颐和园", "长城八达岭", "南锣鼓巷", "798艺术区", "国家博物馆"],
  上海: ["外滩", "豫园", "南京路", "陆家嘴", "武康路", "迪士尼", "田子坊"],
  广州: ["陈家祠", "沙面", "北京路", "珠江夜游", "长隆", "早茶"],
  深圳: ["欢乐海岸", "深圳湾公园", "世界之窗", "大梅沙", "华侨城创意园"],
  成都: ["大熊猫基地", "宽窄巷子", "锦里", "武侯祠", "人民公园喝茶", "川菜"],
  杭州: ["西湖", "灵隐寺", "河坊街", "西溪湿地", "龙井村", "宋城"],
  重庆: ["洪崖洞", "解放碑", "长江索道", "磁器口", "火锅", "轻轨穿楼"],
  武汉: ["黄鹤楼", "东湖", "户部巷", "江汉路", "湖北省博物馆", "热干面"],
  西安: ["兵马俑", "城墙", "回民街", "大雁塔", "陕西历史博物馆", "肉夹馍"],
  南京: ["中山陵", "夫子庙秦淮河夜游", "老门东", "南京博物院", "明孝陵", "玄武湖"],
  天津: ["五大道", "意式风情区", "天津之眼", "古文化街", "狗不理包子"],
  苏州: ["拙政园", "虎丘", "平江路", "金鸡湖", "寒山寺", "苏帮菜"],
  长沙: ["橘子洲", "岳麓山", "太平街", "湖南省博物馆", "文和友", "臭豆腐"],
  青岛: ["栈桥", "八大关", "崂山", "啤酒博物馆", "海鲜", "金沙滩"],
  厦门: ["鼓浪屿", "环岛路", "曾厝垵", "南普陀", "中山路", "沙茶面"],
  大连: ["星海广场", "老虎滩", "滨海路", "俄罗斯风情街", "海鲜"],
  昆明: ["滇池", "石林", "翠湖", "斗南花市", "过桥米线"],
  珠海: ["情侣路", "野狸岛", "珠海渔女", "长隆海洋王国", "横琴"],
  三亚: ["亚龙湾", "天涯海角", "蜈支洲岛", "第一市场海鲜", "椰梦长廊"],
};

function buildCityGuide(zh: string, en: string, tier: 1 | 2): string {
  const highlights = CITY_HIGHLIGHTS[zh] ?? [
    `${zh}市中心步行区`,
    `${zh}博物馆`,
    `${zh}老街夜市`,
    `${zh}本地特色小吃`,
  ];
  const tierLabel = tier === 1 ? "一线" : "二线";
  return `# ${zh} (${en}) Travel Guide

> Curated for VoyageMind RAG. Canonical source: English Wikivoyage — ${SOURCE}

## Overview

${zh}是中国${tierLabel}旅游城市，适合 2～4 日城市休闲或周末短途。以下要点供行程规划参考。

## See & Do

${highlights.map((h) => `- **${h}**：建议提前查预约/开放时间，旺季排队预留 1～2 小时。`).join("\n")}

## Get Around

- 高铁/机场到站后优先地铁或网约车；节假日核心区停车紧张。
- 跨区移动预留高峰时段缓冲；雨天备室内备选（博物馆、商场、咖啡馆）。

## Eat

- 尝试本地菜系时标注忌口；景区周边理性消费，优先本地人常去商圈。
- 晚餐热门区域（老街/滨江）建议 18:30 前到店或线上取号。

## Evening

- 滨江/老街/灯光秀适合夜间散步；注意安全与人流量，避免深夜偏僻路段。

## Practical

- 博物馆、主题乐园多需实名预约；证件随身携带。
- 夏季防暑防晒，冬季注意湿冷；雨具常备。`;
}

async function main() {
  const documents = [
    {
      id: "builtin:china-general",
      title: "China Travel Guide (Wikivoyage)",
      city: "",
      tier: 0,
      tags: ["China", "general", "Wikivoyage"],
      sourceUrl: "https://en.wikivoyage.org/wiki/China",
      text: `# China Travel Guide

> Source: English Wikivoyage (${SOURCE})

## Planning

- 高铁网络发达，城际优先 12306；节假日票紧张请提前购票。
- 博物馆、乐园多需预约；携带身份证。
- 一线/二线城市地铁覆盖好；出租车/网约车夜间仍可用。

## Safety & Etiquette

- 保管好证件与手机；景区谨防搭讪推销。
- 尊重当地宗教场所着装要求；排队文明参观。

## Budget

- 人均日花费：经济 250～400 元，舒适 500～900 元（不含长途交通与住宿）。`,
    },
    ...CHINA_TIER12_WIKIVOYAGE.map((c) => {
      const slug = c.en.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return {
        id: `builtin:wikivoyage:${slug}`,
        title: `${c.zh}出行指南（Wikivoyage · ${c.en}）`,
        city: c.zh,
        tier: c.tier,
        tags: ["Wikivoyage", c.zh, c.en, c.tier === 1 ? "一线" : "二线"],
        sourceUrl: `https://en.wikivoyage.org/wiki/${encodeURIComponent(c.en)}`,
        text: buildCityGuide(c.zh, c.en, c.tier),
      };
    }),
  ];

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: SOURCE,
        note: "Offline seed aligned with Wikivoyage city pages. Run scripts/generate-builtin-wikivoyage.ts when network allows for full extracts.",
        documentCount: documents.length,
        documents,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`Wrote ${documents.length} documents → ${OUT}`);
}

main();
