/**
 * Render / 生产环境：使用 standalone 的 server.js，避免 `next start` 与 output:standalone 不兼容。
 * 在 standalone 目录下启动，保证相对路径与 Next 文档一致；默认绑定 0.0.0.0（Render 要求）。
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const standaloneDir = path.join(__dirname, "..", ".next", "standalone");
const serverJs = path.join(standaloneDir, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error("[run-standalone] Missing", serverJs, "— run `npm run build` first.");
  process.exit(1);
}

// Next standalone 的 server.js 使用：hostname = process.env.HOSTNAME || '0.0.0.0'
// Linux / Render 常把 HOSTNAME 设成 Pod 主机名；若只监听该名，边缘负载均衡连不上 → 502 且无 body。
// 必须覆盖为 0.0.0.0，不能仅在「未设置」时才写（否则永远不生效）。
const childEnv = { ...process.env, HOSTNAME: "0.0.0.0" };

const child = spawn(process.execPath, ["server.js"], {
  cwd: standaloneDir,
  stdio: "inherit",
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code == null ? 0 : code);
});
