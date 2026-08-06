import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3200/matter",
    trace: "on-first-retry",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      permissions: ["microphone"],
      launchOptions: {
        args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
      },
    },
  }],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3200",
    env: {
      ...process.env,
      MATTER_BASE_PATH: "/matter",
      MATTER_PERFORMANCE_FIXTURE: "true",
    },
    url: "http://127.0.0.1:3200/matter",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
