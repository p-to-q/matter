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
    exclude: [
      "scripts/check-markdown-links.test.mjs",
      "scripts/check-deployment.test.mjs",
    ],
  },
});
