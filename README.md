# agent-app — 智能出行与日程协调助手（迭代二任务一）

**自治 Agent**（`IAutonomousAgent`）：以用户目标为驱动，**在运行时**由 LLM 决定计划与工具（仓库内 `StubPlanGenerator`、**`stubTools.ts`** 仅为占位）。架构上组合 **Plan-and-Execute**、**ReAct**、**Reflexion**，通过 **ReasoningEvent** 满足内部状态可视化。

**说明**：本仓库提供 **接口契约与骨架代码**，详细业务实现见 `docs/迭代二-任务一分工.md`。

## 快速开始

```bash
npm install
cp .env.example .env.local
# 填写 DASHSCOPE_*、AMAP_WEBSERVICE_KEY、OPEN_WEATHER_MAP_API_KEY 等（勿提交密钥）
npm run dev
```

浏览器访问：

- `/` — 项目说明  
- `/demo` — 运行示例 Agent 并查看 **推理轨迹**（调用 `POST /api/agent/run`）

## 架构说明

- **接口契约**：`lib/agent/contracts.ts`（全项目唯一权威类型定义）  
- **编排**：`PlanExecuteOrchestrator`（`IAutonomousAgent`）→ 计划事件 → 逐步 `ReactExecutor`
- **工具**：`lib/agent/tools/stubTools.ts` 占位（`ToolRegistry` 注册；成员3 换真实实现）
- **可视化**：`ReasoningEvent` 序列；前端 `components/agent/TracePanel.tsx`  
- **Convex**（可选）：`convex/schema.ts` + 见 `convex/README.md` 接入轨迹持久化  

详细分工与接口列表见 **`docs/迭代二-任务一分工.md`**。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 仅类型检查 |

## CI/CD

仓库根目录 **`.gitlab-ci.yml`**：在默认分支与 MR 上执行 `lint` + `build`。请使用 **GitLab Runner** 与课程要求对齐；依赖镜像源可在 YAML 或 `.npmrc` 中配置国内镜像。

## 与课程仓库

本仓库远程示例：`http://172.29.4.49/2026seiii-56-2026nju/agent-app`（按实际组名调整）。
