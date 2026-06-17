# 迭代三 · Skill 使用说明

> 成员1 交付 · 产品化加分「用户向 Agent 添加 Skill」

## 功能概览

- **设置页** `/settings/skills`：上传、预览、启用/禁用、编辑、删除自定义 Skill
- **对话页**：「附加 Skill」多选，勾选后本轮 Agent 运行遵循对应规则
- **内置 Skill**：`情侣浪漫出行`、`亲子慢游`（答辩演示 MT-5）

## SKILL.md 格式

遵循 [Anthropic Skills](https://github.com/anthropics/skills) 约定：

```markdown
---
name: my-travel-skill
description: 何时触发、做什么（建议写清楚触发词）
tags: ["标签1", "标签2"]
---

# 正文标题

## 规划要求
…

## 总结必须包含
…
```

- `name`：唯一标识（同用户下不可重名）
- `description`：摘要，展示在列表中
- `tags`：可选，JSON 数组或逗号分隔

## 使用步骤

1. 登录后打开顶栏 **设置 → Skill 管理**
2. 上传 `.md` 或粘贴 Markdown → 保存
3. 确保 Skill **已启用**（用户 Skill 存 Convex；内置 Skill 禁用状态存浏览器 localStorage）
4. 回到首页对话，展开 **附加 Skill**，勾选需要的 Skill
5. 发送出行目标，观察规划论证与最终总结是否遵循 Skill 规则

## 演示用例（MT-5）

1. 勾选内置 **couple-romantic-travel**
2. 输入：「规划珠海情侣周末两日游，想要浪漫氛围和黄昏散步」
3. 期望：最终 Markdown 含 **「情侣浪漫时刻」** 小节（高光时段、氛围小贴士、二人留白）

对比：取消勾选 Skill 后同目标再跑，该小节应弱化或消失。

## 技术说明

| 模块 | 路径 |
|------|------|
| 契约 | `lib/agent/contracts.ts` → `AgentSkill`, `ISkillRegistry` |
| 解析 | `lib/agent/skills/parseSkillMarkdown.ts` |
| 注册表 | `lib/agent/skills/SkillRegistry.ts` |
| 注入 | `lib/agent/skills/buildSkillSystemSection.ts` |
| Convex | `convex/skills.ts`, 表 `userSkills` |
| UI | `components/settings/SkillsPanel.tsx`, `components/agent/SkillPicker.tsx` |

运行链路：`activeSkillIds` → action 内 `SkillRegistry.resolve` → `skillSystemSection` → 规划/总结 LLM system prompt。

## 联调接口

- `runAgent({ activeSkillIds?: string[] })` 已扩展，旧评测不传时行为不变
- `createAutonomousAgentPipeline(traceSink, { skillRegistry })` 预留 deps，Skill 解析目前在 action 层完成
