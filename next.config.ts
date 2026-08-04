import type { NextConfig } from "next";

const basePath = process.env.MATTER_BASE_PATH ?? "/matter";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_MATTER_BASE_PATH: basePath,
  },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
