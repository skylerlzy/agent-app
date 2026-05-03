/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/System Volume Information/**",
          "**/$RECYCLE.BIN/**",
          "**/pagefile.sys",
          "**/swapfile.sys",
          "**/hiberfil.sys",
          "**/DumpStack.log.tmp",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
