import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3000/matter",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    env: {
      ...process.env,
      MATTER_TRANSCRIPTION_ADAPTER: "fixture",
    },
    url: "http://127.0.0.1:3000/matter",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
