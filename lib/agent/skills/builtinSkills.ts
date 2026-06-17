import type { AgentSkill } from "../contracts";
import { parseSkillMarkdown } from "./parseSkillMarkdown";

export const BUILTIN_USER_ID = "__builtin__";

const NOW = 1700000000000;

/** 内置 Skill：情侣浪漫出行 */
const COUPLE_ROMANTIC_TRAVEL_MD = `---
name: couple-romantic-travel
description: 为情侣规划甜蜜出行、制造浪漫氛围的专属 Skill。在用户提到情侣、二人世界、约会、纪念日、求婚、 honeymoon、浪漫、氛围感、惊喜 时使用；即使未明确说「浪漫」但同行规模为 couple 且主题含约会/纪念时也建议使用。
tags: ["情侣", "浪漫", "约会", "二人世界", "纪念日", "氛围感"]
---

# 情侣甜蜜出行 · 浪漫氛围 Skill

## 适用场景

- 情侣短途 / 长途旅行、周末 getaway
- 纪念日、生日、情人节、恋爱周年等特殊日期
- 求婚、表白、惊喜策划（仅给思路，不编造已预订服务）
- 用户偏好中 \`travelParty\` 为 \`couple\`，或目标含「和对象」「和 TA」「两个人」

## 核心原则

1. **氛围优先于打卡数量**：每日 1～2 个「高光时刻」即可，留出并肩散步、闲聊、拍照的空白时段。
2. **节奏偏 slow / balanced**：避免「特种兵」式赶场；若用户未指定 pace，默认建议 **slow** 并在 plannerRationale 中说明。
3. **惊喜感可设计、不可伪造**：可建议「傍晚在 XX 街区散步 + 提前选一家景观餐厅」，但不得假装已订座、已买花、已有隐藏布置。
4. **隐私与尊重**：不假设性别组合；用语中性、温暖，避免刻板情话模板堆砌。
5. **天气友好**：雨天 / 酷暑优先室内或傍晚户外；在总结中说明「为浪漫体验做的天气备选」。

## 规划要求（Agent 执行计划须体现）

1. **时段设计**
   - 推荐「黄金三刻」：**晨光**（人少、适合拍照）、**黄昏**（光线柔和）、**夜景**（灯光与河景/ skyline）。
   - 每个高光日至少安排一段 **无具体景点的自由时间**（如「沿河岸慢行 40 分钟」）。

2. **路线与交通**
   - 优先 **步行 + 公共交通** 短距离衔接，减少「各看各手机」的长时间车程。
   - 若调用 \`maps_route_estimate\`，同一段路程可备注「建议并肩步行若距离 ≤2km、天气适宜」。

3. **工具使用倾向**
   - \`weather_forecast\`：关注 **日落前后时段** 与是否适合户外；若有 7 日 outlook，选一天作为「户外浪漫日主推」。
   - 不必为浪漫强行增加工具步骤；质量重于数量。

4. **Planner 论证（plannerRationale）须点名**
   - 如何服务「二人世界」而非普通观光
   - 日期 / 天气如何支撑氛围（如「周六傍晚预报多云，适合江边散步不暴晒」）

## 推荐体验类型（常识性参考，须标注以官方为准）

| 类型 | 示例方向 | 注意 |
|------|----------|------|
| 景观 | 日落观景点、江滨/湖岸、城市天际线 | 不编造闭园时间 |
| 慢享 | 独立咖啡馆、书店、小众街区 | 标注「建议提前预约热门店」 |
| 仪式感 | 纪念日晚餐、手写小卡片、同城「第一次」地点 | 不虚构订座成功 |
| 轻冒险 | 同城骑行、夜游巴士、小型展览 | 结合体力与天气 |

## 总结必须包含（Markdown 二级标题）

最终出行方案 **除标准章节外**，须增加或强化以下小节（可用 \`## 情侣浪漫时刻\` 或在「主题与推荐景点」下单独成段）：

### 须覆盖的要点

- **今日/每日浪漫高光**：1 句描述 + 建议时段（如「Day1 17:30–19:00 黄昏河岸散步」）
- **氛围小贴士**：拍照光线、着装色系建议（简洁 1～2 条）、避免人挤人的错峰提示
- **惊喜灵感（可选执行）**：2～3 条 **低成本、可自行动手** 的建议（如带一张拍立得、提前查一家有窗景的餐厅），并注明「需自行预约/确认营业」
- **二人相处留白**：明确写出哪段时间 **不安排景点**，留给对话与休息

### 语气

- 温暖、具体、有画面感；避免空洞形容词（「浪漫极了」）而不给行动建议。
- 禁止杜撰具体票价、已订酒店名称、虚构「专属情侣折扣」。

## 示例输出片段

> **情侣浪漫时刻（Day1）**  
> 建议 17:30 前后抵达 XX 水岸步道（黄昏 golden hour，适合并肩拍照）。之后不赶行程，留 45 分钟自由散步。若天气转阴，可改为同区域室内独立咖啡馆，靠窗座位建议提前电话确认。  
> **小惊喜灵感**：可准备一张手写便签，在晚餐前交给对方；餐厅与开放时间请以官方渠道为准。

## 与其他 Skill 的关系

- 若同时启用「亲子慢游」等节奏类 Skill，浪漫 Skill 负责 **体验与氛围**，亲子 Skill 负责 **家庭安全与儿童节奏**；总结中两者并存、不互相覆盖。
`;

/** 内置 Skill：亲子慢游 */
const FAMILY_SLOW_TRAVEL_MD = `---
name: family-slow-travel
description: 带儿童或长辈的慢节奏亲子/家庭出游规划。在用户提到亲子、带娃、儿童、老人、慢游、轻松行程时使用。
tags: ["亲子", "慢游", "家庭", "儿童"]
---

# 亲子慢游 Skill

## 节奏原则

- **pace 必须为 slow**：每日 **1–2 个** 核心活动点，午后安排休息或室内备选。
- 单段步行不超过 **20 分钟** 为宜；连续户外不超过 **2.5 小时** 须安排休息。
- 避免「红眼交通 + 满档景点」组合；优先上午参观、下午低强度活动。

## 安全与便利

- 标注 **母婴室/无障碍卫生间/医疗点** 查询建议（不编造具体位置）。
- 饮食：提醒儿童过敏与清淡选项；结合用户 dietaryNotes 严格执行。
- 天气：极端高温/雨雪时优先室内场馆，并在总结中说明调整理由。

## 规划步骤建议

- 工具查询天气后，若不适宜户外，在 plannerRationale 中说明改为室内方案。
- 路线规划 mode 优先 **transit / walking** 短距离；**仅同城** OD 可调用 maps；跨城勿调 maps。
- 工具无法满足时依据 note 收束，**禁止同参重试**。

## 总结必须包含

- **「亲子/家庭友好提示」** 小节：休息节奏、推车/电梯、紧急联系方式（120/110）、儿童证件与优惠票查阅提醒。
- 日程按「上午 / 午休 / 下午 / 晚间」四段描述，而非堆叠景点列表。
`;

export const BUILTIN_SKILL_DEFINITIONS = [
  { id: "builtin:couple-romantic-travel", markdown: COUPLE_ROMANTIC_TRAVEL_MD },
  { id: "builtin:family-slow-travel", markdown: FAMILY_SLOW_TRAVEL_MD },
] as const;

/** 解析后的内置 Skill 列表（静态，供 Registry 与 Convex list 复用） */
export function getBuiltinSkills(): AgentSkill[] {
  return BUILTIN_SKILL_DEFINITIONS.map(({ id, markdown }) => {
    const parsed = parseSkillMarkdown(markdown);
    return {
      id,
      userId: BUILTIN_USER_ID,
      name: parsed.name,
      description: parsed.description,
      markdownBody: parsed.markdownBody,
      tags: parsed.tags,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
      isBuiltin: true as const,
    };
  });
}
