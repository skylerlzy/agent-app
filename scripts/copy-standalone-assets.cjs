/**
 * Next.js `output: "standalone"` 产出最小 server 后，须把 public 与 .next/static
 * 拷入 standalone 目录，否则线上静态资源与 chunk 路径异常，易出现网关 502。
 * 由 npm postbuild 在 `next build` 之后自动执行。
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.warn("[copy-standalone-assets] skip: .next/standalone/server.js not found");
  process.exit(0);
}

const pubSrc = path.join(root, "public");
const pubDest = path.join(standalone, "public");
if (fs.existsSync(pubSrc)) {
  fs.cpSync(pubSrc, pubDest, { recursive: true });
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDest), { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
}

console.log("[copy-standalone-assets] ok");
