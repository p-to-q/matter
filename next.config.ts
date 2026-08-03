import type { NextConfig } from "next";

const basePath = process.env.ARROW_BASE_PATH ?? "/matter";

const nextConfig: NextConfig = {
  basePath,
  outputFileTracingRoot: process.cwd(),
  env: {
    NEXT_PUBLIC_ARROW_BASE_PATH: basePath,
  },
};

export default nextConfig;
