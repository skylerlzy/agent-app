#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "============================================"
echo "  agent-app 一键启动（Docker）"
echo "============================================"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未检测到 docker。请先安装 Docker Desktop / Docker Engine。"
  exit 1
fi

if [[ ! -f .env.local ]]; then
  echo "[提示] 当前目录下没有 .env.local。"
  echo "请将 .env.sample 复制为 .env.local 并填写密钥后再运行。"
  exit 1
fi

echo "正在启动（首次会执行 npm ci，请稍候）…"
echo "浏览器打开: http://localhost:3000"
echo "按 Ctrl+C 停止。"
echo

docker compose up
