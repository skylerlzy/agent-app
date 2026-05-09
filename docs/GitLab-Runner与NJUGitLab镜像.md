# GitLab Runner、git.nju.edu.cn 镜像与课程 CI/CD 加分项对接说明

本文档对应课程《2026 软工三-团队创建与软件过程要求》**第三节「CICD（过程加分项）」**中 **GitLab Runner** 条款，建议同步复制到课程要求维护的 **「文档」仓库 → `迭代二/`** 目录，便于助教查阅。

**Windows 本机自建 Runner**：见课程「文档」仓库 **`迭代二/Windows本机GitLab-Runner搭建说明.md`**。推送前可用本仓库 **`scripts/ci-verify-local.ps1`** 做与 CI `verify` 阶段一致的预检。

## 1. 私服（172.29.4.49）与 git.nju.edu.cn 的分工

| 位置 | 作用 |
|------|------|
| `http://172.29.4.49/` | 课程私有 GitLab，收集代码与过程材料（校园网） |
| [https://git.nju.edu.cn](https://git.nju.edu.cn/dashboard/projects) | 南大 GitLab，可作**镜像**与**对外可访问 Runner** 的补充（需校内邮箱注册） |

课程说明：迭代过程中 **git.nju.edu.cn 上的项目须保持私有**；迭代三截止后再按通知改为公开。

## 2. 在 git.nju.edu.cn 上建立镜像项目（推荐：Pull 镜像）

在 **git.nju.edu.cn** 登录后：

1. **新建项目**：与课程组内路径对齐，例如 `2026seiii-56-2026nju/agent-app`（按实际小组编号与组名调整）。
2. 进入 **Settings → Repository → Mirroring repositories → Add new mirror**。
3. **Git repository URL**：填写课程私服的仓库地址，例如  
   `https://<用户名或DeployToken>@172.29.4.49/2026seiii-56-2026nju/agent-app.git`  
   （若仅校园网可解析 `172.29.4.49`，镜像仓库 Runner 须能访问该地址；若 NJU Runner 无法直连内网 IP，可改为在 **课程私服** 配 **Push mirror** 到 git.nju.edu.cn，见下文。）
4. **Mirror direction**：选 **Pull**（从课程私服拉取到 NJU）。
5. **认证**：使用课程 GitLab 的 **Personal Access Token** 或 **Deploy Token**（只读即可），**不要**把令牌写入仓库代码，仅在 Web 配置里填写。
6. 勾选 **Keep divergent refs** 按需；保存后点 **Update now** 测一次。
7. 若界面提供 **Trigger pipelines when mirror updates**（或等价选项），请开启，以便镜像更新后 **git.nju.edu.cn** 上自动跑流水线。

**若 NJU 无法 Pull 内网 172.29.4.49**：在 **课程私服** 项目 **Settings → Repository → Mirroring** 中配置 **Push mirror** 到 git.nju.edu.cn（方向相反，效果等价：代码最终出现在 NJU，由 NJU Runner 执行 CI/CD）。

## 3. 仓库内 Pipeline（本仓库 `.gitlab-ci.yml`）

满足课程要求：

- **a)** 随仓库附带 pipeline 脚本（本仓库根目录 `.gitlab-ci.yml`）。
- **b)** 前端依赖使用国内镜像：`NPM_CONFIG_REGISTRY=https://registry.npmmirror.com`；Docker 基础镜像使用 `public.ecr.aws/docker/library/node:20-alpine`，避免校园网访问 **docker.io** 不稳定。
- **c)** **默认分支**与 **Merge Request** 会触发 **verify**（安装依赖、`lint`、`typecheck`、`build`）；合并进默认分支后触发 **deploy**（见下节，需在 GitLab CI/CD Variables 中配置部署参数）。
- **d)** 在 git.nju.edu.cn 的 **CI/CD → Pipelines** 中保留完整构建记录（不要求每次成功）。
- **e)** **迭代二、迭代三截止前最后一次流水线须成功**——请在截止前合并或推送一次，确认 Pipeline 为绿色。

构建结果**自动回显在 GitLab**（对应 Jenkins 条款里的「将构建结果发回 GitLab」）：无需额外配置。

## 4. 自动部署（满足「合并到默认分支后部署 Web 项目」）

课程要求：合并到默认分支时构建，且 **Web 项目自动部署最新代码**。本仓库通过 **`deploy_production` Job** 实现（阶段 `deploy`，仅在 **默认分支** 且上游 `lint_typecheck_build` 成功后运行）。

请在 **git.nju.edu.cn（或实际执行 CI 的实例）→ Settings → CI/CD → Variables** 中配置（**勿**提交到 Git）：

| 变量 | 保护/掩码 | 含义 |
|------|-----------|------|
| `DEPLOY_WEBHOOK_URL` | 建议 Mask | 部署平台提供的 **Webhook URL**（如部分 PaaS 的 Redeploy Hook）。设置后流水线会向该 URL 发 `POST`，触发拉取最新镜像/代码并重启。 |
| `DEPLOY_WEBHOOK_TOKEN` | Mask | 可选。若 Webhook 需要 `Authorization: Bearer ...` 或其它 Header，与脚本约定一致时在变量中保存 Token；无需则可不建。 |
| `DEPLOYMENT_PUBLIC_URL` | 可选 | 助教可访问的 **生产环境根 URL**（如 `https://your-app.example.com`）。用于部署后 **HTTP 探测**；并建议设为 GitLab **Environment URL**，方便在 Pipeline 中点开验收。 |

若团队使用 **自有服务器 + SSH**，在 Variables 中配置 **`DEPLOY_SSH_HOST`**、**`DEPLOY_SSH_USER`**、**`SSH_PRIVATE_KEY`**（密钥正文，或 GitLab **File** 类型变量）、**`DEPLOY_SSH_COMMAND`**（远端一条 shell 命令，例如 `cd /opt/agent-app && git pull && docker compose up -d --build`）。逻辑见仓库 **`scripts/ci-deploy.sh`**。**密钥必须用 CI Variables，禁止写入仓库。**

生产构建已启用 Next **`output: 'standalone'`**，产物在 `.next/standalone`，便于与 Node 进程或容器编排对接。

## 5. Runner 与文档义务（课程 f 条）

- **组内使用共享 Runner**：通常无需自架 Runner；若课程提供带 `docker` 的执行器，一般可直接运行本 pipeline。
- **若自建 GitLab Runner**：将搭建步骤（操作系统、注册命令 `gitlab-runner register`、Executor 类型、`tags` 是否与 `.gitlab-ci.yml` 中注释的 `tags` 一致）整理成文，放入 **文档仓库 `迭代二/`**。
- **本文档**可作为附件或粘贴到该目录，与 **`.gitlab-ci.yml`** 保持同步：变量名、部署方式、负责人（谁维护 pipeline、谁保证截止前最后一次成功）写清楚。

## 6. 验收前自检清单

- [ ] git.nju.edu.cn 上镜像项目已配置，且默认分支与课程私服一致。
- [ ] 合并进默认分支后：**Pipeline 成功**，且 **deploy** 已按变量真实触发（环境已更新）。
- [ ] `DEPLOYMENT_PUBLIC_URL` 在浏览器中可由助教访问（迭代二完成后要求）。
- [ ] 迭代二、迭代三**截止前最后一次**提交对应 Pipeline **成功**。

---

参考：[GitLab 仓库镜像](https://docs.gitlab.com/ee/user/project/repository/mirror/) · [GitLab CI/CD 变量](https://docs.gitlab.com/ee/ci/variables/) · [Signed commits](https://docs.gitlab.com/ee/user/project/repository/signed_commits/ssh.html)（课程另要求提交签名，与 CI 独立）。
