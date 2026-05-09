#!/usr/bin/env bash
set -euo pipefail

# GitLab CI：默认分支合并后的自动部署（Webhook 或 SSH）
# 所需变量见仓库根目录 .gitlab-ci.yml 注释

if [[ -n "${DEPLOY_WEBHOOK_URL:-}" ]]; then
  echo "[deploy] 使用 Webhook 触发远端更新..."
  if [[ -n "${DEPLOY_WEBHOOK_TOKEN:-}" ]]; then
    curl -fsS -X POST \
      -H "Authorization: Bearer ${DEPLOY_WEBHOOK_TOKEN}" \
      "${DEPLOY_WEBHOOK_URL}"
  else
    curl -fsS -X POST "${DEPLOY_WEBHOOK_URL}"
  fi
elif [[ -n "${DEPLOY_SSH_HOST:-}" && -n "${DEPLOY_SSH_USER:-}" && -n "${SSH_PRIVATE_KEY:-}" && -n "${DEPLOY_SSH_COMMAND:-}" ]]; then
  echo "[deploy] 使用 SSH 在 ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST} 执行部署命令..."
  eval "$(ssh-agent -s)"
  if [[ -f "${SSH_PRIVATE_KEY}" ]]; then
    ssh-add "${SSH_PRIVATE_KEY}"
  else
    printf '%s\n' "${SSH_PRIVATE_KEY}" | tr -d '\r' | ssh-add -
  fi
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  ssh-keyscan -H "${DEPLOY_SSH_HOST}" >> ~/.ssh/known_hosts 2>/dev/null || true
  ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=~/.ssh/known_hosts \
    "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}" \
    "${DEPLOY_SSH_COMMAND}"
else
  echo "错误：未配置自动部署。课程要求合并默认分支后部署 Web 项目。"
  echo "请在 GitLab → Settings → CI/CD → Variables 中配置其一："
  echo "  A) DEPLOY_WEBHOOK_URL（及可选 DEPLOY_WEBHOOK_TOKEN）"
  echo "  B) DEPLOY_SSH_HOST、DEPLOY_SSH_USER、SSH_PRIVATE_KEY、DEPLOY_SSH_COMMAND"
  exit 1
fi

if [[ -n "${DEPLOYMENT_PUBLIC_URL:-}" ]]; then
  echo "[deploy] 探测生产地址（可选配置 DEPLOYMENT_PUBLIC_URL）..."
  sleep 8
  curl -fsS --retry 4 --retry-delay 5 --retry-all-errors -o /dev/null "${DEPLOYMENT_PUBLIC_URL}" \
    || echo "[deploy] 警告：HTTP 探测失败，请确认服务已启动且 URL 正确。"
fi

echo "[deploy] 完成。"
