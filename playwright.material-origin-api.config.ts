import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./receipts",
  testMatch: "material-origin-api.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 35 * 60_000,
  outputDir: "test-results/material-origin-api",
  use: {
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
