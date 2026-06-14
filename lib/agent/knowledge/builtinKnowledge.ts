import { chunkDocument } from "./chunkDocument";
import type { ScoredChunkCandidate } from "./retrieve";

/** 与内置 Skill 一致，标识系统预置知识 */
export const BUILTIN_KNOWLEDGE_USER_ID = "__builtin__";

export interface BuiltinKnowledgeDefinition {
  id: string;
  title: string;
  city?: string;
  tags: string[];
  text: string;
}

const GENERAL_TRAVEL_MD = `# 中国自由行通用出行指南

## 规划节奏

- **慢节奏（slow）**：每日 1～2 个主活动 + 大量留白，适合情侣、疗愈、雨季出行；避免「打卡式」赶场。
- **标准节奏**：每日 2～3 个景点 + 1 餐体验，留 30% 弹性应对天气与排队。
- 跨城段建议预留 **≥90 分钟** 换乘缓冲；节假日进站安检额外 +15 分钟。

## 预算与消费

- 华东城市人均日预算参考：经济 200～350 元/天，舒适 400～700 元/天（不含大交通与住宿）。
- 门票优先查官方公众号预约；博物馆类常 **免费但需预约**（如南京博物院、珠海博物馆等）。

## 铁路与交通免责

- 高铁/动车时刻、票价、余票 **仅以 12306 为准**；Agent 不得编造精确车次。
- 市内路线以地图工具估算为准；公交若不可用时会回退驾车路网，须在回答中说明。

## 天气与雨季

- 6 月华东、华南多 **梅雨/台风雨**，户外行程备折叠伞、防滑鞋；午后湿度高时减少长距离步行。
- 极端天气优先室内场馆（博物馆、商场、图书馆）替换户外点。

## 饮食安全

- 海鲜、生腌类注意新鲜度与肠胃适应；标注用户 **忌口**（如不吃辣、海鲜过敏）时全程回避相关推荐。
- 景区周边「特产」理性消费，优先本地连锁或老字号。

## 情侣与浪漫动线

- 一天中至少一个 **高光时刻**：晨光、黄昏或夜景；避免全天满档。
- 仪式感场景：写明信片、环岛步行、临水静坐、共同完成一件小手工。
`;

const NANJING_GUIDE_MD = `# 南京慢游攻略（三日参考）

## 城市气质

南京适合 **慢节奏人文游**：城墙、梧桐、长江与民国记忆交织。6 月梅雨季节，上午户外、下午室内更舒适。

## 第一日 · 老城记忆

- **上午**：中山陵—音乐台—明孝陵（钟山风景区，需步行较多，备防晒与饮水）。
- **下午**：南京博物院（**需提前预约**，周一闭馆），馆藏丰富，适合雨天。
- **晚上**：**老门东** 历史街区 + **夫子庙—秦淮河** 夜游。老门东适合拍夜景与小吃；夫子庙人流大，建议 19:30 后沿河散步而非购物为主。

## 第二日 · 城墙与江景

- **上午**：中华门瓮城或玄武湖环湖（二选一，勿赶场）。
- **下午**：1912 街区或先锋书店（五台山店）阅读休憩。
- **傍晚**：**长江边** 或南京眼步行桥看日落（视天气）。

## 第三日 · 轻松收尾

- **上午**：颐和路公馆区梧桐漫步，或总统府周边（预约）。
- **下午**：科巷/红庙小吃扫街，提前结束返程。

## 预约与避坑

- 南京博物院、中山陵等旺季 **必须预约**；现场可能无票。
- 夫子庙周边餐饮评价参差，推荐查近期点评或选择连锁品牌。
`;

const NANJING_FOOD_MD = `# 南京美食与饮食指南

## 必尝特色（可标注不辣做法）

- **盐水鸭**：冷盘为主，偏咸鲜，适合分享。
- **鸭血粉丝汤**：可要求少辣或不加辣油。
- **小笼包 / 汤包**：先开窗、后喝汤；烫口注意。
- **赤豆元宵、糖芋苗**：甜品类，晚茶友好。

## 晚餐区域推荐

- **老门东 / 夫子庙**：游客集中，适合体验氛围，选明码标价店铺。
- **科巷、红庙**：本地小吃密度高，适合「扫街式」晚餐。
- **河西 / 新街口**：商场餐饮选择多，适合家庭与雨天。

## 忌口提示

- 南京菜 **并非全辣**，但部分小吃默认含辣油；声明「不吃辣」时应点 **不辣、免辣油**。
- 推荐搭配：盐水鸭 + 清炒时蔬 + 米糕/元宵，避开麻辣系。
`;

const ZHUHAI_GUIDE_MD = `# 珠海休闲浪漫攻略

## 城市气质

珠海以 **情侣路海岸线、岛屿与松弛感** 著称，适合 3～4 日慢旅。6 月多 **小雨转多云**，清晨与傍晚户外体验最佳，午后可转室内或营地休憩。

## 经典动线 · 情侣路

- **珠海渔女雕像**（情侣中路）：地标打卡，**晨光 07:00–08:30** 人少适合剪影照；可与 Day2 远观形成「晨光复访」。
- **爱情邮局**（情侣中路 88 号）：写明信片、盖邮戳，**黄昏 18:45–19:15** 仪式感强。
- **野狸岛**：环岛绿道约 2.2 km，看 **日月贝（珠海大剧院）** 夜景；建议 19:30 后入场，21:30 前结束步行。

## 日间备选

- **圆明新园**：大型园林，半天可游；雨天可行。
- **珠海博物馆 / 城市规划馆**：室内避暑，需留意开放时间。
- **长隆海洋王国**：全日项目，与「慢节奏浪漫线」冲突时须单独安排一日。

## 交通提示

- 情侣路核心段 **步行 + 公交** 即可；野狸岛入口距爱情邮局约 3.8 km，可分段停驻。
- 珠海 **无地铁**，跨区打车费用需计入预算。

## 6 月天气

- 预报常见「小雨转多云」，**清晨降雨概率较低**；渔女、野狸岛周边有廊亭可短暂避雨。
- 湿度 85%+ 时减少正午户外，改室内或营地整理手账。
`;

const ZHUHAI_FOOD_MD = `# 珠海饮食与海鲜指南

## 特色方向

- **海鲜大排档**：横琴、湾仔一带；注意明码标价与时价，避免强制消费。
- **粤式早茶 / 茶餐厅**：适合不辣偏好；点心、肠粉、云吞面。
- **葡式蛋挞、双皮奶**：情侣路沿线可共享甜品。

## 饮食安全

- 6 月湿热，**生冷海鲜** 谨慎；优先熟制、现做。
- 用户 **不吃辣** 时，粤菜通常友好，但仍需说明免椒。

## 预算参考

- 情侣路简餐 50～80 元/人；海鲜正餐 150～300 元/人视时价浮动。
`;

const RAIL_TRANSFER_MD = `# 高铁跨城换乘常识（12306 为准）

## 枢纽提示

- **南京南**：沪宁、京沪高铁枢纽；异站换乘预留 ≥90 分钟。
- **珠海**：无高铁直达市内「珠海站」与「珠海长隆」不同；购票须核对站名。
- 从 **南京到珠海** 常见方案：南京南 → 广州南（或深圳北）→ 城际/动车至珠海；总耗时约 7～9 小时，以 12306 为准。

## 购票提醒

- 节假日票紧张，建议 **提前 15 天** 关注放票；候补与改签规则以 12306 公告为准。
- 带大件行李时避免「极限换乘」行程。
`;

export const BUILTIN_KNOWLEDGE_DEFINITIONS: BuiltinKnowledgeDefinition[] = [
  {
    id: "builtin:travel-general",
    title: "中国自由行通用出行指南",
    tags: ["通用", "预算", "安全", "铁路", "天气", "节奏"],
    text: GENERAL_TRAVEL_MD,
  },
  {
    id: "builtin:nanjing-guide",
    title: "南京慢游攻略",
    city: "南京",
    tags: ["南京", "慢节奏", "夜游", "博物馆"],
    text: NANJING_GUIDE_MD,
  },
  {
    id: "builtin:nanjing-food",
    title: "南京美食与饮食指南",
    city: "南京",
    tags: ["南京", "美食", "不辣", "晚餐"],
    text: NANJING_FOOD_MD,
  },
  {
    id: "builtin:zhuhai-guide",
    title: "珠海休闲浪漫攻略",
    city: "珠海",
    tags: ["珠海", "情侣", "浪漫", "情侣路", "野狸岛"],
    text: ZHUHAI_GUIDE_MD,
  },
  {
    id: "builtin:zhuhai-food",
    title: "珠海饮食与海鲜指南",
    city: "珠海",
    tags: ["珠海", "美食", "海鲜", "粤菜"],
    text: ZHUHAI_FOOD_MD,
  },
  {
    id: "builtin:rail-transfer",
    title: "高铁跨城换乘常识",
    tags: ["高铁", "12306", "换乘", "南京", "珠海"],
    text: RAIL_TRANSFER_MD,
  },
];

const NOW = 1700000000000;

let cachedCandidates: ScoredChunkCandidate[] | null = null;

function buildCachedCandidates(): ScoredChunkCandidate[] {
  if (cachedCandidates) return cachedCandidates;
  const all: ScoredChunkCandidate[] = [];
  for (const doc of BUILTIN_KNOWLEDGE_DEFINITIONS) {
    const chunks = chunkDocument(doc.text, { title: doc.title, maxChars: 850 });
    for (const chunk of chunks) {
      all.push({
        chunkId: `${doc.id}:${chunk.chunkIndex}`,
        documentId: doc.id,
        documentTitle: doc.title,
        content: chunk.content,
        citation: chunk.citation,
        tags: doc.tags,
        ...(doc.city ? { city: doc.city } : {}),
      });
    }
  }
  cachedCandidates = all;
  return all;
}

/** 内置知识分块，供 RAG 检索合并 */
export function getBuiltinKnowledgeCandidates(opts?: { city?: string }): ScoredChunkCandidate[] {
  const all = buildCachedCandidates();
  const city = opts?.city?.trim();
  if (!city) return all;

  const citySpecific = all.filter((c) => c.city === city);
  const general = all.filter((c) => !c.city);
  if (citySpecific.length) return [...citySpecific, ...general];
  return all;
}

export function getBuiltinKnowledgeCatalog() {
  return BUILTIN_KNOWLEDGE_DEFINITIONS.map((doc) => ({
    id: doc.id,
    userId: BUILTIN_KNOWLEDGE_USER_ID,
    title: doc.title,
    sourceType: "markdown" as const,
    tags: doc.tags,
    chunkCount: chunkDocument(doc.text, { title: doc.title, maxChars: 850 }).length,
    createdAt: NOW,
    updatedAt: NOW,
    isBuiltin: true as const,
    ...(doc.city ? { city: doc.city } : {}),
  }));
}

export function getBuiltinKnowledgeDocument(id: string) {
  const doc = BUILTIN_KNOWLEDGE_DEFINITIONS.find((d) => d.id === id);
  if (!doc) return null;
  return {
    ...getBuiltinKnowledgeCatalog().find((d) => d.id === id)!,
    originalText: doc.text,
  };
}

export function isBuiltinKnowledgeDocumentId(id: string): boolean {
  return id.startsWith("builtin:");
}
