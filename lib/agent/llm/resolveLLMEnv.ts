/**
 * 与示例项目 travel-planner-ai 一致：阿里云 DashScope OpenAI 兼容接口（通义千问）。
 * 未配置密钥时立即抛错，不做降级。
 *
 * 模型名由 `QWEN_MODEL` 决定；未设置时默认 `qwen-plus`（与 `lib/qwen/index.ts` 示例一致）。
 * Convex action 内读 **Convex 部署环境**（Dashboard 或 `npx convex dev` 同步的 `.env.local`）。
 */
export type ResolvedLLMEnv = {
  apiKey: string;
  baseURL: string;
  model: string;
};

function nonempty(s: string | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export function resolveLLMConfig(): ResolvedLLMEnv {
  if (!nonempty(process.env.DASHSCOPE_API_KEY)) {
    throw new Error(
      "缺少 DASHSCOPE_API_KEY：请在本地 .env.local 与 Convex 控制台配置（与 travel-planner-ai 相同；云函数以 Convex 环境为准）。"
    );
  }
  return {
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL:
      process.env.DASHSCOPE_BASE_URL?.trim() ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.QWEN_MODEL?.trim() || "qwen-plus",
  };
}
