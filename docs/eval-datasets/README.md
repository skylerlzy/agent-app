# 迭代三评估数据集存档

> 课程要求：优化过程中使用的评估数据集须存档保留。  
> **权威副本（与代码同仓）**：`agent-app/docs/eval-datasets/`  
> **文档仓副本（本目录）**：供 `my-awesome-project` 文档与答辩引用。

## 目录说明

| 文件 | 负责人 | 用途 |
|------|--------|------|
| `iter3-eval-platform-tasks.json` | 全员 | **评测平台可导入任务清单**（evalGoal + dataset + evalPayload） |
| `iter3-tools-correctness.json` | 成员6 | 工具选型、非法参数拦截、工具开关（MT-6） |
| `iter3-rag-cross-memory.json` | 成员2 | 跨对话记忆、RAG 出处标注（含手工 setup） |
| `iter3-trip-generation.json` | 全员 | 行程生成质量（交通兜底、主题天数、餐饮 POI、Skill） |
| `iter3-runmode-routing.json` | 成员5 | runMode 路由与 latency 对比 |

**规模**：共 **19** 条 Case（**16** 条可由 `agent-eval-platform` 一键导入自动跑；**3** 条 RAG/记忆需手工前置）。

## 与 agent-eval-platform 的对接方式

评测平台 **不会** 直接读取 `cases[]` JSON；每条评测对应平台任务字段：

| 平台字段 | 含义 |
|----------|------|
| `eval_goal` | 发给 `agent-app` 的用户目标（`POST /api/eval/run` 的 `goalRaw`） |
| `dataset` | LLM Judge / Ragas 的**参考验收标准**（纯文本，非文件路径） |
| `evalPayloadJson` | 可选 JSON：`preferences`、`activeSkillIds`、`enabledToolNames` |

`iter3-eval-platform-tasks.json` 已按上述格式整理，并映射到源数据集 Case ID。

### 一键导入（推荐）

1. 启动 **agent-app**（默认 `http://localhost:3000`）与 **agent-eval-platform 后端**（默认 `http://localhost:8000`）。
2. 配置评测后端 `EVAL_SERVER_SECRET` 与 agent-app / Convex 一致（或双方开启 `EVAL_PUBLIC_EVAL=true` 仅内网演示）。
3. 在 `agent-eval-platform` 根目录执行：

```powershell
.\scripts\import-iter3-eval-tasks.ps1
```

4. 打开评测平台前端 → 任务看板 → 对导入的 16 条任务点击「运行评测」。

### 手工创建单条任务

从 `iter3-eval-platform-tasks.json` 复制对应 `name`、`evalGoal`、`dataset`；若含 `evalPayload`，在 API 创建任务时填入 `evalPayloadJson` 字符串。

### 手工用例（RAG / 记忆）

`memory-cross-dialogue-spicy`、`memory-share-disabled`、`rag-citation-nanjing-guide` 标记为 `automation: manual`，导入脚本会跳过。按各 Case 的 `dataset` 字段完成 setup 后，可在 UI 手工建任务复跑。

## 校验

在 `agent-app` 根目录：

```bash
npx tsx scripts/validate-eval-datasets.ts
```

校验：文件齐全、Case ID 唯一、平台清单与源 JSON 一致、关键 payload（TG-01 Skill、T-04 关 weather）存在。

## 优化前后对比流程

1. 优化前：Agent 版本 tag 如 `iter3-baseline`，导入并跑完全部 **platform** 任务，导出报告。
2. 优化后：版本 tag 如 `iter3-optimized`，**同数据集**复跑，在平台「对比分析」比较 `tool_correctness`、`latency_ms`、`factuality`。
3. 答辩附录引用 Case ID（如 `TG-01`、`RM-04`）与 trace 截图。

## 版本

- v1.1：新增 `iter3-eval-platform-tasks.json`、平台 import API、evalPayload 透传、校验脚本（2026-06）
- v1.0：迭代三 W5 定稿，与 `Agent优化文档（迭代三）.md` 第四节指标表一致
