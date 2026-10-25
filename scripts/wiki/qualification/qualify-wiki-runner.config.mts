import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimal vitest config used exclusively by qualify-wiki.mjs --check and
// --print-update.  The main config (vitest.config.mts) deliberately excludes
// qualify-wiki-runner.ts from normal test runs; this config opts it back in.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/wiki/qualification/qualify-wiki-runner.ts"],
  },
});
