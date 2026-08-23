import { expect, test, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

type WorkerObservation = Readonly<{
  status: string;
  stage?: string;
  textLength?: number;
}>;

function diagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

async function readWorkerObservations(page: Page): Promise<readonly WorkerObservation[]> {
  return page.evaluate(() => (
    window as Window & {
      __matterWorkerObservations?: readonly WorkerObservation[];
    }
  ).__matterWorkerObservations ?? []);
}

test.skip(
  process.env.MATTER_E2E_LOCAL_TRANSCRIPTION !== "true",
  "Run explicitly with a synthetic, non-repository audio fixture because the first receipt downloads the browser Whisper model.",
);

test("synthetic recorded speech reaches local Whisper, punctuation, and expression repair", async ({ page }) => {
  test.setTimeout(300_000);
  const audioPath = process.env.MATTER_E2E_FAKE_AUDIO_PATH?.trim();
  const expectedWords = process.env.MATTER_E2E_EXPECTED_TRANSCRIPT?.trim();
  const captureMs = Number(process.env.MATTER_E2E_FAKE_AUDIO_DURATION_MS ?? "5000");
  if (audioPath === undefined || audioPath.length === 0) {
    throw new Error("MATTER_E2E_FAKE_AUDIO_PATH must name a generated, non-repository WAV fixture.");
  }
  if (expectedWords === undefined || expectedWords.length === 0) {
    throw new Error("MATTER_E2E_EXPECTED_TRANSCRIPT must name words spoken by the synthetic fixture.");
  }
  if (!Number.isSafeInteger(captureMs) || captureMs < 1_000 || captureMs > 15_000) {
    throw new Error("MATTER_E2E_FAKE_AUDIO_DURATION_MS must be an integer from 1000 through 15000.");
  }

  const serverTranscriptions: string[] = [];
  const modelTraffic: string[] = [];
  const browserErrors: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/transcribe")) {
      serverTranscriptions.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    modelTraffic.push(
      `failed ${diagnosticUrl(request.url())} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (/huggingface|whisper|onnx|wasm/iu.test(response.url())) {
      modelTraffic.push(`${response.status()} ${diagnosticUrl(response.url())}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const observations: Array<Readonly<{
      status: string;
      stage?: string;
      textLength?: number;
    }>> = [];
    Object.defineProperty(window, "__matterWorkerObservations", {
      configurable: true,
      value: observations,
    });
    class ObservedWorker extends NativeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        this.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (typeof event.data !== "object" || event.data === null) return;
          const response = event.data as Record<string, unknown>;
          if (typeof response.status !== "string") return;
          observations.push({
            status: response.status,
            ...(typeof response.stage === "string" ? { stage: response.stage } : {}),
            ...(typeof response.text === "string"
              ? { textLength: response.text.length }
              : {}),
          });
        });
      }
    }
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: ObservedWorker,
      writable: true,
    });
  });

  await page.goto("/matter");
  await page.getByRole("button", { name: fixtureUiCopy.voiceTool.recordTopLevelThought, exact: true }).click();
  const stop = page
    .getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(captureMs);
  await stop.click();

  const admitted = page
    .locator('[data-thought-id^="thought_"]')
    .filter({ hasText: expectedWords });
  const failed = page.getByText("没能把这段录音变成文字。", { exact: true });
  await Promise.race([
    admitted.waitFor({ state: "attached", timeout: 240_000 }),
    failed.waitFor({ state: "visible", timeout: 240_000 }).then(async () => {
      const workerObservations = await readWorkerObservations(page);
      throw new Error(JSON.stringify({ browserErrors, modelTraffic, workerObservations }, null, 2));
    }),
  ]);
  await expect(admitted).toHaveCount(1);
  await expect(admitted.locator(".spatial-thought__text")).toContainText(expectedWords);
  await expect(admitted.locator(".spatial-thought__text")).toHaveText(/，.+，/u);
  await expect(admitted.locator(".spatial-thought__text")).toContainText("🎉", {
    timeout: 15_000,
  });
  await expect(admitted.locator(".spatial-thought__text")).toHaveText(/。🎉$/u);
  const workerObservations = await readWorkerObservations(page);
  expect(workerObservations).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: "started" }),
    expect.objectContaining({ status: "complete", textLength: expect.any(Number) }),
  ]));
  expect(serverTranscriptions).toEqual([]);
  expect(browserErrors).toEqual([]);
});
