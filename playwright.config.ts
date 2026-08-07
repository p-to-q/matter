import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3100/matter",
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
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      ...process.env,
      MATTER_BASE_PATH: "/matter",
      MATTER_PERFORMANCE_FIXTURE: "true",
      MATTER_TRANSCRIPTION_ADAPTER: "fixture",
      MATTER_FIXTURE_ADMISSION_TRANSCRIPT: "也许我还没有想清楚，但这句话可以先留在这里，等它继续长出自己的方向。",
      MATTER_FIXTURE_DIRECTION_TRANSCRIPT: "把这里说得更具体一些，但保留一点不确定。",
      MATTER_INQUIRY_ADAPTER: "off",
      NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: "false",
      NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: "true",
      MATTER_LABEL_ADAPTER: "fixture",
      MATTER_REPAIR_ADAPTER: "fixture",
      NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED: "false",
      NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: "false",
      MATTER_NEXT_DIST_DIR: ".next-e2e",
    },
    url: "http://127.0.0.1:3100/matter",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
