/** @type {import('next').NextConfig} */
const isGitLabCi = process.env.GITLAB_CI === "true";

const nextConfig = {
  reactStrictMode: true,
  // CI 中已单独执行 `npm run lint`，避免 build 阶段再跑一遍 ESLint（耗时且易误判为卡住）
  eslint: {
    ignoreDuringBuilds: isGitLabCi,
  },
};

export default nextConfig;
