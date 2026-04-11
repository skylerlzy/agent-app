# Convex 数据层（可选首跑）

1. 安装 CLI：`npm install -g convex`（或使用 `npx convex`）。
2. 在项目根目录执行 `npx convex dev`，按提示关联部署并生成 `convex/_generated`。
3. 成员5 根据 `docs/迭代二-任务一分工.md` 中的 `appendEvent` / `listEventsBySession` 契约实现 `convex/trace.ts` 并接入 `ConvexTraceSink`。

当前仓库已包含 `schema.ts` 表结构定义；在未运行 codegen 前，Next.js 构建不依赖 Convex 函数文件。
