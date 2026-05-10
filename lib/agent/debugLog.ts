/**
 * Convex action 单次执行日志上限约 256 行；默认关闭详细 log，避免 Log overflow。
 * 在 Convex Dashboard 为本部署设置 AGENT_VERBOSE_LOGS=1 可恢复调试输出。
 */
export function agentDebug(...args: unknown[]) {
  const v = process.env.AGENT_VERBOSE_LOGS?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") {
    console.log(...args);
  }
}
