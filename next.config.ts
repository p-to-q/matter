import type { NextConfig } from "next";

const basePath = process.env.MATTER_BASE_PATH ?? "/matter";

const nextConfig: NextConfig = {
  basePath,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "microphone=(self)" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_MATTER_BASE_PATH: basePath,
  },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
