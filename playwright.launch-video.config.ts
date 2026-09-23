import { defineConfig, devices } from "@playwright/test";
import {
  LAUNCH_MATERIAL_COPY,
  LAUNCH_POINT_TALK_FIXTURE,
} from "./e2e/matter-launch.fixture";

const runDirectory = process.env.MATTER_LAUNCH_RUN_DIR?.trim() ||
  "tmp/matter-launch-video/unconfigured";
const liveInquiry = process.env.MATTER_LAUNCH_LIVE_INQUIRY === "true";

/**
 * Launch-film capture is an explicit operator workflow, not a product test.
 * Material-changing model surfaces are pinned to closed fixtures. Ask Matter
 * uses either one explicitly authorized live call or a receipt-marked local
 * fixture for an offline publication take.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "matter-launch.capture.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: `${runDirectory}/playwright`,
  // The authored action clock remains frozen at 68 seconds. Chrome may need
  // substantially longer to flush a 1600x900 high-quality screencast on a
  // busy local disk, so cleanup gets its own non-narrative time budget.
  timeout: 600_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3120/matter",
    channel: "chrome",
    colorScheme: "dark",
    deviceScaleFactor: 1,
    locale: "zh-CN",
    permissions: ["microphone"],
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    viewport: { width: 1_600, height: 900 },
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    // Publication capture must never inherit the Next development indicator,
    // Fast Refresh, or cold route compilation. This helper builds with the
    // repository's frozen Webpack production command and then owns next start.
    command: "node scripts/start-launch-video-server.mjs",
    env: {
      ...process.env,
      MATTER_BASE_PATH: "/matter",
      MATTER_PUBLIC_ORIGIN: "http://127.0.0.1:3120",
      MATTER_INITIAL_DOCUMENT: "root",
      MATTER_PERFORMANCE_FIXTURE: "true",
      MATTER_TRANSCRIPTION_ADAPTER: "fixture",
      MATTER_FIXTURE_ADMISSION_TRANSCRIPT: LAUNCH_MATERIAL_COPY.voice,
      MATTER_REPAIR_ADAPTER: "fixture",
      MATTER_FIXTURE_REPAIR: LAUNCH_MATERIAL_COPY.voice,
      MATTER_LABEL_ADAPTER: "fixture",
      MATTER_TRANSFORM_ADAPTER: "fixture",
      MATTER_TEXT_SWAP_ADAPTER: "fixture",
      MATTER_FIXTURE_SWAP_DIRECTION_TRANSCRIPT: LAUNCH_POINT_TALK_FIXTURE.direction,
      MATTER_FIXTURE_DIRECTION_TRANSCRIPT: "这段材料把‘怀念’理解成什么？",
      MATTER_INQUIRY_ADAPTER: liveInquiry ? "live" : "off",
      ...(liveInquiry ? {} : {
        MATTER_MODEL_POOL: "",
        MATTER_LABEL_POOL: "",
      }),
      MATTER_E2E_RUNNER: "playwright",
      NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED: "false",
      NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED: "true",
      NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED: "true",
      NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED: "false",
    },
    url: "http://127.0.0.1:3120/matter",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    // Next's first route compile is machine-load dependent and is separate
    // from the authored 68-second take. Keep a bounded startup budget without
    // weakening any interaction, model, geometry, or screencast assertion.
    timeout: 600_000,
  },
});
