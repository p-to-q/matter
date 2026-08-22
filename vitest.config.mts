import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["features/**/*.test.ts", "next.config.test.ts", "scripts/**/*.test.mjs"],
    // Repository checks that must run without Vitest keep their suites in
    // `node:test`, so `npm test` hands exactly these files to `node --test`.
    // A new one belongs in both lists or Vitest reports it as an empty suite.
    exclude: [
      "scripts/check-markdown-links.test.mjs",
      "scripts/check-deployment.test.mjs",
      "scripts/check-vercel-config.test.mjs",
      "scripts/check-runtime-artifact.test.mjs",
      "scripts/check-architecture.test.mjs",
      "scripts/probe-model-pool.test.mjs",
    ],
  },
});
