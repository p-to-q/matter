import { defineConfig, devices } from "@playwright/test";

const localTranscriptionReceipt = process.env.MATTER_E2E_LOCAL_TRANSCRIPTION === "true";
const fakeAudioPath = process.env.MATTER_E2E_FAKE_AUDIO_PATH?.trim();
const requestedPort = Number(process.env.MATTER_E2E_PORT ?? "3100");
if (!Number.isSafeInteger(requestedPort) || requestedPort < 1_024 || requestedPort > 65_535) {
  throw new Error("MATTER_E2E_PORT must be an integer between 1024 and 65535.");
}
const requestedServerTimeoutMs = Number(process.env.MATTER_E2E_SERVER_TIMEOUT_MS ?? "120000");
if (
  !Number.isSafeInteger(requestedServerTimeoutMs) ||
  requestedServerTimeoutMs < 10_000 ||
  requestedServerTimeoutMs > 10 * 60_000
) {
  throw new Error("MATTER_E2E_SERVER_TIMEOUT_MS must be an integer from 10000 to 600000.");
}
const localOrigin = `http://127.0.0.1:${requestedPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Next development compilation is intentionally part of this release
  // matrix. Keep individual expectations strict, but give one serial journey
  // enough wall time to survive a cold compile on slower local filesystems.
  timeout: 60_000,
  // Every project shares one fixture-backed Next development server. Two and
  // three browsers both starved otherwise green Voice, canvas, and Lasso
  // journeys on the release host. The complete functional matrix is serial;
  // concurrency, admission, and rate limits keep their own focused proofs.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: `${localOrigin}/matter`,
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
            ...(fakeAudioPath === undefined || fakeAudioPath.length === 0
              ? []
              : [`--use-file-for-fake-audio-capture=${fakeAudioPath}`]),
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${requestedPort}`,
    env: {
      ...process.env,
      MATTER_BASE_PATH: "/matter",
      MATTER_PERFORMANCE_FIXTURE: "true",
      MATTER_TRANSCRIPTION_ADAPTER: "fixture",
      MATTER_FIXTURE_ADMISSION_TRANSCRIPT: "呃，我觉得我觉得这个方案可以但是它的实现事件比预期长",
      MATTER_INQUIRY_ADAPTER: "off",
      MATTER_TRANSFORM_SURFACE: "public",
      MATTER_TRANSFORM_ADAPTER: "fixture",
      MATTER_E2E_RUNNER: "playwright",
      NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: "false",
      NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: "true",
      MATTER_LABEL_ADAPTER: "fixture",
      MATTER_REPAIR_ADAPTER: "fixture",
      MATTER_FIXTURE_REPAIR: "我觉得这个方案可以，但是它的实现时间比预期长。",
      MATTER_TEXT_SWAP_ADAPTER: "fixture",
      MATTER_TEXT_SWAP_SURFACE: "public",
      MATTER_FIXTURE_SWAP_DIRECTION_TRANSCRIPT: "换一种更凝练的说法",
      NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED: "true",
      NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: localTranscriptionReceipt
        ? "true"
        : "false",
      MATTER_NEXT_DIST_DIR: ".next-e2e",
    },
    url: `${localOrigin}/matter`,
    reuseExistingServer: false,
    // SIGTERM, not a hard kill: the command runs the server behind an `npm run`
    // wrapper, and killing the wrapper outright orphans the server it started,
    // which then holds the port for every later run.
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    timeout: requestedServerTimeoutMs,
  },
});
