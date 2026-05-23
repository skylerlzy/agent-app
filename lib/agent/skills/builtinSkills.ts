import type { AgentSkill } from "../contracts";
import { parseSkillMarkdown } from "./parseSkillMarkdown";

export const BUILTIN_USER_ID = "__builtin__";

const NOW = 1700000000000;

/** 内置 Skill：高铁换乘 */
const HIGH_SPEED_RAIL_MD = `---
name: high-speed-rail-transfer
description: 规划跨城高铁出行时的换乘、候车、行李与时刻注意事项。在用户提到高铁、动车、跨城、换乘、12306 时使用。
tags: ["高铁", "换乘", "跨城", "铁路"]
---

# 高铁换乘出行 Skill

## 核心原则

- 铁路时刻、票价、余票 **仅以 12306 官方为准**；本 Skill 不提供虚构车次或精确时刻。
- 规划须显式考虑：**进站安检时间、换乘步行/通道耗时、行李托运限制**。
- 跨城段优先建议高铁/动车；若工具无铁路 API，须在总结中说明「具体车次请登录 12306 查询」。

## 工具能力边界（必读）

- 铁路时刻、票价、余票 **仅以 12306 为准**；**禁止** 用 maps_route_estimate 查询跨城高铁/枢纽间 transit。
- 工具无法满足 Skill 要求（如无 AQI、无站内换乘距离）时，**依据工具 note 做保守结论，禁止同参重试**。
- 空气质量：weather_forecast 返回 airQualityAvailable=false 时，说明「当前接口无 AQI」即可，勿循环调用。

## 规划要求

1. **Hub 选择**：比较「直达 vs 一次中转」，说明中转站换乘风险提示（同站/异站）。
2. **时间缓冲**：建议到站比发车提前 **至少 30–45 分钟**（节假日 +15 分钟）；异站换乘预留 **≥90 分钟**。
3. **行李**：大件行李注明是否适合中转换乘；无直梯时提醒楼梯搬运成本。
4. **儿童/老人**：标注无障碍通道、电梯位置查询建议；减少「卡点赶车」日程。

## 总结必须包含

- 独立小节 **「高铁/铁路换乘注意事项」**，至少覆盖：建议提前到站时间、换乘缓冲、12306 购票提醒、退改签规则查阅建议。
- 若涉及南京南、上海虹桥、杭州东等枢纽，可提及「站内换乘通道」为常识性参考，并提醒以车站广播为准。

## 示例输出片段

> **高铁换乘注意事项**：建议发车前 45 分钟抵达车站完成安检；若在中转站异站换乘，请预留不少于 90 分钟。所有车次与票价请通过 12306 官方 App 查询确认。
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
  { id: "builtin:high-speed-rail-transfer", markdown: HIGH_SPEED_RAIL_MD },
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
