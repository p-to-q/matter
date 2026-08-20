import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Every project shares one fixture-backed Next server. Keep enough browser
  // concurrency to expose cross-feature interference without starving that
  // single server and turning five-second interaction receipts into load tests.
  workers: 3,
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
      MATTER_FIXTURE_ADMISSION_TRANSCRIPT: "呃，我觉得我觉得这个方案可以但是它的实现事件比预期长",
      MATTER_INQUIRY_ADAPTER: "off",
      MATTER_E2E_RUNNER: "playwright",
      NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: "false",
      NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: "true",
      MATTER_LABEL_ADAPTER: "fixture",
      MATTER_REPAIR_ADAPTER: "fixture",
      MATTER_FIXTURE_REPAIR: "我觉得这个方案可以，但是它的实现时间比预期长。",
      MATTER_TEXT_SWAP_ADAPTER: "fixture",
      MATTER_FIXTURE_SWAP_DIRECTION_TRANSCRIPT: "换一种更凝练的说法",
      NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED: "true",
      NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: "false",
      MATTER_NEXT_DIST_DIR: ".next-e2e",
    },
    url: "http://127.0.0.1:3100/matter",
    reuseExistingServer: false,
    // SIGTERM, not a hard kill: the command runs the server behind an `npm run`
    // wrapper, and killing the wrapper outright orphans the server it started,
    // which then holds the port for every later run.
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    timeout: 60_000,
  },
});
