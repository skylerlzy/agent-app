# agent-app — 智能出行自治助手（迭代二任务一）

**自治 Agent**：Plan-and-Execute + ReAct + Reflexion；**推理与轨迹在 Convex 云函数中执行并写入 Convex 数据库**；**登录与身份由 Clerk 提供**，与示例项目 `travel-planner-ai` 同栈（`ClerkProvider` + `ConvexProviderWithClerk`）。

## 1. 环境文件分层（通俗理解）

| 文件 | 是否提交 Git | 作用 |
|------|----------------|------|
| **`.env.sample`** | 是 | 「填空题模板」：列出要配哪些变量、占位符是什么。新人复制成 `.env.local` 对照填写。 |
| **`.env`** | 是 | **没有密钥**的默认值（例如 Clerk 登录后的跳转路径、开关默认关）。全队一致，可安全提交。 |
| **`.env.local`** | **否**（已 `.gitignore`） | 你自己的 **密钥** 和 **部署地址**（Clerk、Convex、DashScope、高德、天气等）。**永远不要**把真实 Key 写进 `.env` 再提交。 |

Next.js 启动时会合并 `.env`、`.env.local`；**仅 `NEXT_PUBLIC_*` 会进浏览器**，其它变量只在服务端（含 Convex action 在云端读自己的环境变量，见下文）。

## 2. 快速开始

```bash
npm install
# Windows: copy .env.sample .env.local
# macOS/Linux: cp .env.sample .env.local
```

在 **`.env.local`** 中至少先填 **Clerk** 的 key，以及 **`CUSTOM_DOMAIN`（Clerk Issuer，见 `.env.sample` 注释）**——否则 `npx convex dev` 会因 `auth.config.js` 校验失败而退出。然后再：

```bash
npx convex dev    # 会写入 NEXT_PUBLIC_CONVEX_URL / CONVEX_DEPLOYMENT，并把 .env.local 中的变量同步到开发部署
npm run dev
```

访问 `/`：未登录可浏览介绍；登录后在**同一首页**运行 Agent 并查看 Convex 实时轨迹。

## 3. Clerk 在本项目中的工作方式

1. **`proxy.ts`**：`clerkMiddleware()` + `createRouteMatcher`，公开 `/`、`/sign-in`、`/sign-up`，其余路由 `auth.protect()`。
2. **`middleware.ts`**：从 `proxy.ts` 再导出，满足 Next 对文件名的要求。
3. **`app/providers.tsx`**：`<ClerkProvider>`（`telemetry={false}`、浅色主题 `appearance.variables`）与顶栏 **`SiteHeader`**；**`ConvexClientRoot`** 内用 `ConvexProviderWithClerk` + `useAuth` 把 Clerk JWT 交给 Convex。
4. **页面**：`/sign-in`、`/sign-up` 使用 `<SignIn />` / `<SignUp />`；首页等业务区用 **`<Show when="signed-in">` / `<Show when="signed-out">`** 控制 Agent 工作台显隐（Clerk 7）。

### 你需要在 Clerk 里配置什么

1. [Clerk Dashboard](https://dashboard.clerk.com) 创建应用，复制 **Publishable key**、**Secret key** 到 `.env.local`。  
   **遥测**：本地若出现对 `clerk-telemetry.com` 的 CORS 报错，本项目已在 `ClerkProvider` 上设置 `telemetry={false}`，并在 `.env.sample` / `.env` 中提供 `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED=1`；复制到 `.env.local` 后即可完全关闭 SDK 遥测请求。
2. **Allowed redirect URLs**：加入本地 `http://localhost:3000` 与生产域名；**Sign-in / Sign-up URLs** 与 `.env` 中 `NEXT_PUBLIC_CLERK_SIGN_IN_URL` 等一致（默认 `/sign-in`、`/sign-up`）。
3. Clerk → **JWT Templates**：确认存在 **Convex** 模板（Clerk 与 Convex 官方对接文档中有说明）；`ConvexProviderWithClerk` 会请求带 `convex` 模板的 token。

### 你需要在 Convex 里配置什么

1. [Convex Dashboard](https://dashboard.convex.dev) 创建项目，`npx convex dev` 绑定本地目录。
2. **Environment Variables**（与示例项目一致）至少包括：
   - **`CUSTOM_DOMAIN`**：Clerk 控制台 **API Keys** 页的 **Issuer**（形如 `https://xxx.clerk.accounts.dev`），须与 `convex/auth.config.js` 中 `providers[0].domain` 所用变量一致。
   - **`DASHSCOPE_API_KEY`**、（可选）`DASHSCOPE_BASE_URL`、**`QWEN_MODEL`**（与 `travel-planner-ai` 的 `lib/qwen/index.ts` 一致；在 **Convex** 环境生效。未设置 `QWEN_MODEL` 时代码默认 **`qwen-plus`**）
   - **`QWEATHER_API_KEY`**、（推荐）**`QWEATHER_API_HOST`**（[和风 API Host](https://dev.qweather.com/docs/configuration/api-host/)）、**`AMAP_WEBSERVICE_KEY`**  
   云函数 **action** 内调用通义千问/天气/高德时读的是 **Convex 云端** 的 `process.env`，与 Next 的 `.env.local` 是两套；本地开发可用 `npx convex dev` 将 `.env.local` 同步到开发部署（以官方文档为准）。天气已改为 **和风 QWeather**（[GeoAPI](https://dev.qweather.com/docs/api/geoapi/) + `v7/weather/now` / `7d`），不再使用 `OPEN_WEATHER_MAP_API_KEY`。

## 4. 大模型与外部 API

- **通义千问（DashScope）**：与示例项目相同，使用 `DASHSCOPE_API_KEY`、可选 `DASHSCOPE_BASE_URL`、`QWEN_MODEL`。调用发生在 **Convex action**，以 **Convex 环境变量** 为准；`429` 多为并发/RPM 触顶，可调 `LLM_REQUEST_GAP_MS`、`SKIP_PLAN_REVISION` 等；失败会抛错并在前端以表单内提示展示。
- **天气（和风）/ 高德**：在工具层直接 `fetch` 公网 API；缺 Key 或 HTTP 失败会 **抛错**。

## 5. 与 `travel-planner-ai` 的差异（简要）

- **大模型**：已与示例对齐，使用 **阿里云 DashScope**（`DASHSCOPE_API_KEY`、`QWEN_MODEL` 等），不再使用智谱。
- 未接入 **Resend / Unsplash** 等（示例里用于邮件与配图）；若需要，可在 Convex action 或 mutation 中另行接入。
- `convex/_generated` 为便于无账号机器 **typecheck/build** 提交的占位；接入真实 Convex 后请长期以 `npx convex dev` 重新生成。

## 6. 故障排除（前端静态资源 / Convex / Windows）

### `_next/static/...` 404、`ERR_ABORTED`、首页只剩标题文字

多为 **中间件误拦截** 或 **`.next` 缓存与浏览器 HTML 不一致**。本项目在 `proxy.ts` 中对 `/_next/`、`/__clerk`、`/icon` 等做了**显式放行**；若仍出现：

1. 停掉 dev 进程后删除构建缓存：删除项目根目录下的 **`.next`** 文件夹，再执行 `npm run dev`。  
2. 浏览器对 `localhost:3000` **硬性刷新**（禁用缓存）或换无痕窗口。  
3. 确认只启动**一个** `next dev`，且访问的端口与终端输出一致。

### 点击「运行 Agent」后一直「运行中」、Convex 无结束

常见原因是 **DashScope 或天气/高德 HTTP 在 Convex action 内长时间无响应**（此前 `fetch` 无超时）。现已为 LLM 与工具请求增加超时（见 `.env.sample` 中 **`LLM_HTTP_TIMEOUT_MS`**、**`TOOL_HTTP_TIMEOUT_MS`**），并避免在 **无工具** 时仍调用「工具模式」接口；请在 **Convex Dashboard → Environment Variables** 中同步上述变量后重新部署/运行 `npx convex dev`。前端可用 **`NEXT_PUBLIC_AGENT_CLIENT_TIMEOUT_MS`** 控制最长等待时间（超时后会提示，服务端 action 可能仍在跑，以 Convex 日志为准）。

### 如何看出「哪一个 API」超时或慢？

在 **Convex Dashboard → Logs** 中过滤 `runAgent`，关注前缀：

| 日志前缀 | 含义 |
|----------|------|
| `[agent-llm] → plan_draft` | DashScope：生成初稿计划 |
| `[agent-llm] → plan_revise` | DashScope：修订计划（第二次调用，易与初稿叠加限流/超时） |
| `[agent-llm] → react_<stepId>_turn<n>` | DashScope：某步骤 ReAct（工具模式时带 `+tools`） |
| `[agent-llm] → reflexion_<stepId>` | DashScope：反思策略（仅 `USE_LLM_REFLEXION=true`） |
| `[agent-http] … tag=dashscope:…` | DashScope HTTP 层起止与耗时；**FAIL** 或超时文案中的 `tag=` 即场景 |
| `[agent-http] … tag=qweather:…` | 和风天气 Geo / 实时 / 7 日预报 |
| `[agent-http] … tag=amap:…` | 高德路径工具 |

若修订阶段总出问题，可在 Convex 环境变量中设 **`SKIP_PLAN_REVISION=1`**，跳过一次 LLM 修订调用，仅用初稿继续执行。

### Watchpack / `lstat 'E:\\pagefile.sys'` 等（Windows）

多为开发模式下文件监视扫到磁盘根目录系统文件，**一般不影响编译**。`next.config.mjs` 已增加常见系统路径的 `watchOptions.ignored`；请始终在**项目目录**下执行 `npm run dev`（不要在 `E:\\` 根目录启动）。

### `InvalidDeploymentName: Couldn't parse deployment name REPLACE`

说明 `.env.local` 里仍留有模板占位符（例如 `CONVEX_DEPLOYMENT=dev:REPLACE`）。请**删除或改成真实值**：

1. 删掉错误的 `CONVEX_DEPLOYMENT`、`NEXT_PUBLIC_CONVEX_URL` 行；或  
2. 在项目根目录运行 `npx convex dev`，按提示链接/创建项目，让 CLI 把**正确**的 `dev:项目slug` 和 `https://xxx.convex.cloud` 写回环境。

**不要**从 `.env.sample` 原样复制 `REPLACE` 字样。

### `npx convex login` 后出现 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`（Windows）

多为 Node/libuv 在 PowerShell 下的已知问题；若下一行已显示 **device has previously been authorized**，通常**登录已成功**，可忽略该断言，直接执行 `npx convex dev`。若仍异常：升级 Node 到当前 LTS、换 **Windows Terminal / cmd**、或以管理员权限重试。

### `CUSTOM_DOMAIN is used in auth config file but its value was not set`

`convex/auth.config.js` 引用了 **`process.env.CUSTOM_DOMAIN`**。在 Convex **推送**该配置前，部署上必须已有这个变量。

**做法 A（推荐，与 `npx convex dev` 同步）**  

1. 打开 Clerk → **API Keys**，复制 **Issuer**（形如 `https://xxxx.clerk.accounts.dev`）。  
2. 写入本机 **`.env.local`**：  
   `CUSTOM_DOMAIN=https://xxxx.clerk.accounts.dev`  
3. **重新运行** `npx convex dev`（CLI 会把 `.env.local` 里的变量同步到当前开发部署）。

**做法 B**  

打开报错里给出的链接（Convex Dashboard → Environment variables），**手动新增** `CUSTOM_DOMAIN`，值同上。保存后再运行 `npx convex dev`。

### `Failed to clone ... get-convex/agent-skills.git` / `Installation failed`（agent skills）

这是 Convex CLI **可选**的「Agent skills」模板拉取（需访问 GitHub）。**网络被重置时只会失败这一步**，你日志里 **Provisioning / 写入 `.env.local` 已成功** 时，项目本身**已创建**。可忽略；需要时再执行：`npx skills add get-convex/agent-skills`。

### `Temporary directory ... and project directory ... are on different filesystems`

仅为提示：临时目录在 C:、项目在 E: 时可能出现。若其它工具监听文件异常，可在运行 Convex 前设置环境变量 **`CONVEX_TMPDIR`** 指向与项目同盘的临时目录（例如 E 盘某文件夹）。

## 7. Clerk 集成说明（与官方 quickstart 对齐）

- 根目录 **`proxy.ts`**：`clerkMiddleware()` + `createRouteMatcher`（公开 `/`、`/sign-in`、`/sign-up`，其余 `auth.protect()`）。  
- **`middleware.ts`**：仅 `export { default, config } from "./proxy"`，满足 Next 对文件名要求。  
- **`app/providers.tsx`**：`<ClerkProvider>` + **`SiteHeader`**（登录/注册、`useUser` 与 `<UserButton>`），内层为 **Convex** 的 `ConvexClientRoot`。  
- 依赖：**Next.js 15.2.8** + **@clerk/nextjs 7.x**（Clerk 7 要求 Next ≥15.2.8）。

## 8. 脚本与 CI

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发 |
| `npm run build` | 生产构建（CI 需设置 `NEXT_PUBLIC_CONVEX_URL`、`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY` 等，见 `.gitlab-ci.yml`） |
| `npm run lint` | ESLint |
| `npm run typecheck` | 类型检查 |

## 9. 课程仓库

本仓库远程示例：`http://172.29.4.49/2026seiii-56-2026nju/agent-app`（按实际组名调整）。
