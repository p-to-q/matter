import { expect, test, type Page } from "@playwright/test";
import { REPAIR_REVEAL_HOLD_MS } from "../features/matter/interaction/repair-reveal";
import { fixtureUiCopy } from "./matter-ui-copy";

const heardTranscript = "呃，我觉得我觉得这个方案可以，但是它的实现事件比预期长。";
const repairedTranscript = "我觉得这个方案可以，但是它的实现时间比预期长。";
// This is a functional boundary, not the performance receipt. Keep it below
// the 12 s repair lease while allowing a loaded parallel browser to schedule
// the otherwise immediate fixture round trip.
const FIXTURE_REPAIR_SETTLE_TIMEOUT_MS = 5_000;
// Browser fake-device acquisition is outside the product request path and can
// be slow on a cold Chromium host. The visible permission phase remains under
// assertion while the release receipt waits for the synthetic device.
const FIXTURE_RECORDING_START_TIMEOUT_MS = 30_000;

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`voice admits one undoable top-level thought at ${viewport.name} width`, async ({ page }) => {
    test.setTimeout(90_000);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await prewarmAdmissionRouteModules(page);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await expect(page.locator("#material-files")).toHaveAttribute(
      "data-persistence-phase",
      "saved",
    );
    await page.evaluate(() => {
      const observed = window as Window & {
        __matterRepairAnimations?: Array<{ name: string; time: number; text: string }>;
      };
      observed.__matterRepairAnimations = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName === "material-grapheme-arrive") {
          observed.__matterRepairAnimations?.push({
            name: event.animationName,
            time: performance.now(),
            text: (event.target as HTMLElement).textContent ?? "",
          });
        }
      });
    });

    const voice = page.getByRole("button", {
      name: fixtureUiCopy.voiceTool.recordTopLevelThought,
      exact: true,
    });
    await expect(voice).toBeEnabled();
    await voice.click();
    const stop = page
      .getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true });
    await expect(stop).toBeVisible({ timeout: FIXTURE_RECORDING_START_TIMEOUT_MS });
    await expect(page.getByRole("button", {
      name: fixtureUiCopy.voiceTool.stopRecording,
      exact: true,
    })).toHaveCount(2);
    await expect(page.locator(".matter-guidance__next")).toHaveText("说出你的想法。");
    await expect(page.locator("main.matter-shell")).toHaveAttribute(
      "data-interaction-pending",
      "true",
    );
    const feedback = page.locator(".admission-feedback");
    await expect(feedback).toBeVisible();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const feedbackBox = await feedback.boundingBox();
    const anchorBox = await page.locator('[data-thought-id="thought_fixture_root"]').boundingBox();
    expect(feedbackBox).not.toBeNull();
    expect(anchorBox).not.toBeNull();
    // The structural commit anchor is invisible; feedback instead follows the
    // first visible passage and must clear every rendered language block.
    expect(feedbackBox!.y).toBeGreaterThanOrEqual(anchorBox!.y + anchorBox!.height + 17);
    const overlaps = await page.locator("[data-thought-id]").evaluateAll((nodes, box) =>
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < box.x + box.width &&
          rect.right > box.x &&
          rect.top < box.y + box.height &&
          rect.bottom > box.y;
      }).map((node) => node.getAttribute("data-thought-id")), feedbackBox!);
    expect(overlaps).toEqual([]);
    await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true })).toBeDisabled();
    // MediaRecorder chunks are asynchronous; this crosses one 250 ms capture
    // interval so Stop can prove the final dataavailable boundary with audio.
    await page.waitForTimeout(350);
    const heard = page.locator('[data-thought-id^="thought_"]').filter({ hasText: heardTranscript });
    const admitted = page.locator('[data-thought-id^="thought_"]').filter({ hasText: repairedTranscript });
    // The fixture model resolves immediately. Observe the paint directly;
    // waiting for click() and then polling the DOM can miss a correctly shown
    // baseline that has already entered its repair reveal.
    const rawPaintReceiptPromise = page.evaluate((expectedText) =>
      new Promise<{ animationCount: number; observed: boolean; visibleAfterTwoFrames: boolean }>((resolve) => {
        const containsExpectedText = () => Array.from(
          document.querySelectorAll<HTMLElement>('[data-thought-id^="thought_"]'),
        ).some((element) => element.textContent?.includes(expectedText) === true);
        let settled = false;
        const observer = new MutationObserver(() => {
          if (!containsExpectedText() || settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timeout);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve({
            animationCount: (window as Window & { __matterRepairAnimations?: unknown[] })
              .__matterRepairAnimations?.length ?? 0,
            observed: true,
            visibleAfterTwoFrames: containsExpectedText(),
          })));
        });
        observer.observe(document.body, { characterData: true, childList: true, subtree: true });
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          resolve({
            animationCount: (window as Window & { __matterRepairAnimations?: unknown[] })
              .__matterRepairAnimations?.length ?? 0,
            observed: false,
            visibleAfterTwoFrames: false,
          });
        }, 10_000);
      }), heardTranscript);
    await stop.click();
    const rawPaintReceipt = await rawPaintReceiptPromise;
    expect(rawPaintReceipt).toEqual({
      animationCount: 0,
      observed: true,
      visibleAfterTwoFrames: true,
    });
    await expect(admitted).toHaveCount(1, { timeout: FIXTURE_REPAIR_SETTLE_TIMEOUT_MS });
    await expect(heard).toHaveCount(0);
    const reveal = admitted.locator(".repair-text");
    await expect(reveal).toHaveAttribute("data-repair-reveal-count", /[1-9]\d*/u);
    await expect(reveal).toHaveText(repairedTranscript, { useInnerText: false });
    const revealCount = Number(await reveal.getAttribute("data-repair-reveal-count"));
    const changedInk = await reveal.locator('[data-repair-part="changed"]').allTextContents();
    const authoredRevealDelays = await reveal.locator('[data-repair-part="changed"]')
      .evaluateAll((parts) => parts.map((part) =>
        Number.parseFloat(getComputedStyle(part).animationDelay) * 1_000));
    // The insertion-only admission floor already owns this semantic comma;
    // late repair must not animate it as if a model introduced it.
    expect(changedInk.join("")).not.toContain("，");
    expect(changedInk.join("")).toContain("时");
    expect(changedInk.join("")).not.toContain("方案");
    await expect.poll(async () => page.evaluate(() =>
      (window as Window & { __matterRepairAnimations?: unknown[] })
        .__matterRepairAnimations?.length ?? 0,
    )).toBe(revealCount);
    const animations = await page.evaluate(() =>
      (window as Window & {
        __matterRepairAnimations?: Array<{ name: string; time: number; text: string }>;
      }).__matterRepairAnimations ?? [],
    );
    expect(animations.every(({ name }) => name === "material-grapheme-arrive")).toBe(true);
    expect(Math.min(...authoredRevealDelays)).toBe(REPAIR_REVEAL_HOLD_MS);
    // Browser scheduling may dispatch separately delayed animationstart events
    // in one busy frame. The CSS timeline, not event-delivery jitter, owns the
    // reading-order stagger.
    expect(Math.max(...authoredRevealDelays) - Math.min(...authoredRevealDelays))
      .toBeGreaterThan(40);
    expect(await admitted.locator(".spatial-thought__text").evaluate((element) =>
      getComputedStyle(element).opacity,
    )).toBe("1");
    await expect(admitted.getByRole("button", { name: repairedTranscript, exact: true })).toHaveCount(1);
    const revealingBox = await admitted.locator(".spatial-thought__text").boundingBox();
    await expect(reveal).toHaveCount(0, { timeout: 2_000 });
    const settledBox = await admitted.locator(".spatial-thought__text").boundingBox();
    expect(revealingBox).not.toBeNull();
    expect(settledBox).not.toBeNull();
    expect(Math.abs(revealingBox!.width - settledBox!.width)).toBeLessThan(0.5);
    expect(Math.abs(revealingBox!.height - settledBox!.height)).toBeLessThan(0.5);
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute(
      "data-interaction-pending",
      "true",
    );
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("选择一段想法。");
    await expect(page.locator("#material-files")).toHaveAttribute(
      "data-persistence-phase",
      "saved",
    );
    const geometry = await page.locator("[data-thought-id]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.getAttribute("data-thought-id"), x: rect.x, y: rect.y };
      }),
    );
    const admittedId = await admitted.getAttribute("data-thought-id");
    const parentGeometry = geometry.find(({ id }) => id === "thought_fixture_root");
    const admittedGeometry = geometry.find(({ id }) => id === admittedId);
    expect(geometry).toHaveLength(11);
    expect(parentGeometry).toBeDefined();
    expect(admittedGeometry).toBeDefined();
    // With no editing address selected, Voice admits a peer beneath the
    // invisible document root instead of rewriting existing material.
    expect(Math.abs(admittedGeometry!.x - parentGeometry!.x)).toBeLessThan(1);

    await page.reload();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");
    await expect(admitted).toHaveCount(1);
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
    await expect(heard).toHaveCount(1);
    await expect(admitted).toHaveCount(0);
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
    await expect(heard).toHaveCount(0);
    await expect(admitted).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });

  test(`unselected voice reserves the first material lane at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const root = page.locator('[data-thought-id="thought_fixture_root"]');
    const voice = page.getByRole("button", { name: fixtureUiCopy.voiceTool.recordTopLevelThought, exact: true });
    await voice.click();
    const feedback = page.locator(".admission-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toHaveAttribute("data-admission-anchor-node-id", "thought_fixture_root");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const feedbackBox = await feedback.boundingBox();
    const rootBox = await root.boundingBox();
    if (feedbackBox === null || rootBox === null) throw new Error("voice feedback geometry is unavailable");
    // Voice feedback stays in its anchor's material lane: it begins below the
    // first passage and cannot trespass into its right-hand child branch.
    expect(feedbackBox.y).toBeGreaterThanOrEqual(rootBox.y + rootBox.height + 17);
    expect(feedbackBox.width).toBeLessThanOrEqual(rootBox.width + 1);
    const overlaps = await page.locator("[data-thought-id]").evaluateAll((nodes, box) =>
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < box.x + box.width &&
          rect.right > box.x &&
          rect.top < box.y + box.height &&
          rect.bottom > box.y;
      }).map((node) => node.getAttribute("data-thought-id")), feedbackBox);
    expect(overlaps).toEqual([]);
    // This receipt owns the anchored layout, not an uncontrolled microphone
    // result. The separate admission receipt proves both equivalent Stop
    // controls; ending the test keeps this geometry proof independent of the
    // browser's device-specific transcription ending.
  });
}

async function prewarmAdmissionRouteModules(page: Page): Promise<void> {
  // Next's development server compiles each dynamic route on first access.
  // Keep that test-only startup work outside the human interaction receipt;
  // production deployments already contain compiled route artifacts.
  for (const path of ["/matter/api/transcribe", "/matter/api/repair"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(405);
    await response.dispose();
  }
}

test("a denied microphone leaves material unchanged and Record again starts a fresh attempt", async ({ page }) => {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const original = mediaDevices.getUserMedia.bind(mediaDevices);
    const runtime = window as Window & { __matterDenyMicrophone?: boolean };
    runtime.__matterDenyMicrophone = true;
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: (constraints: MediaStreamConstraints) => runtime.__matterDenyMicrophone
        ? Promise.reject(new DOMException("Synthetic permission denial", "NotAllowedError"))
        : original(constraints),
    });
  });

  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const initialNodeCount = await page.locator("[data-thought-id]").count();
  await page.getByRole("button", {
    name: fixtureUiCopy.voiceTool.recordTopLevelThought,
    exact: true,
  }).click();

  const failure = page.locator('.admission-feedback[data-phase="error"]');
  await expect(failure).toContainText("麦克风权限已被阻止。");
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialNodeCount);

  const voiceTool = page.locator('[data-tool-id="voice"]');
  const retry = failure.getByRole("button", { name: "重新录音", exact: true });
  const dismiss = failure.getByRole("button", { name: "关闭", exact: true });
  await expect(retry).toBeFocused();
  await expect(voiceTool).toBeDisabled();
  await retry.press("Tab");
  await expect(dismiss).toBeFocused();
  await dismiss.press("Enter");
  await expect(failure).toHaveCount(0);
  await expect(voiceTool).toBeFocused();

  await voiceTool.press("Enter");
  await expect(failure).toContainText("麦克风权限已被阻止。");

  await page.evaluate(() => {
    (window as Window & { __matterDenyMicrophone?: boolean }).__matterDenyMicrophone = false;
  });
  await expect(retry).toBeFocused();
  await retry.press("Enter");
  const recording = page.locator('.admission-feedback[data-phase="recording"]');
  await expect(recording).toBeVisible({ timeout: FIXTURE_RECORDING_START_TIMEOUT_MS });
  await expect(recording.getByRole("button", { name: "停止录音", exact: true })).toBeFocused();
  await page.waitForTimeout(350);
  await recording.getByRole("button", { name: "停止录音", exact: true }).click();
  await expect(page.locator('[data-thought-id^="thought_"]')).toHaveCount(initialNodeCount + 1);
  await expect(voiceTool).toBeFocused();
});

test("a hidden page cancels Voice without restoring focus into the background", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Synthetic permission denial", "NotAllowedError")),
    });
  });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const voiceTool = page.locator('[data-tool-id="voice"]');
  await voiceTool.click();
  const failure = page.locator('.admission-feedback[data-phase="error"]');
  await expect(failure).toBeVisible();
  await expect(failure.getByRole("button", { name: "重新录音", exact: true })).toBeFocused();

  await setDocumentVisibility(page, "hidden");
  await expect(failure).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(voiceTool).not.toBeFocused();
});

test("modal chrome cancels raw Voice but holds a stopped admission until material returns", async ({ page }) => {
  let releaseTranscription!: () => void;
  const transcriptionGate = new Promise<void>((resolve) => {
    releaseTranscription = resolve;
  });
  let markTranscriptionFulfilled!: () => void;
  const transcriptionFulfilled = new Promise<void>((resolve) => {
    markTranscriptionFulfilled = resolve;
  });
  let transcriptionRequested = false;
  await page.route("**/api/transcribe", async (route) => {
    transcriptionRequested = true;
    await transcriptionGate;
    const response = await route.fetch();
    await route.fulfill({ response });
    markTranscriptionFulfilled();
  });

  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const initialNodeCount = await page.locator("[data-thought-id]").count();
  const voiceTool = page.locator('[data-tool-id="voice"]');
  const settings = page.getByRole("button", { name: "Matter 设置", exact: true });

  await voiceTool.click();
  await expect(page.locator('.admission-feedback[data-phase="recording"]')).toBeVisible({
    timeout: FIXTURE_RECORDING_START_TIMEOUT_MS,
  });
  await settings.click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".admission-feedback")).toHaveCount(0);
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialNodeCount);
  await dialog.getByRole("button", { name: "关闭: 模型 API" }).click();
  await expect(voiceTool).toBeEnabled();

  // A fresh capture proves that modal cancellation released the microphone.
  await voiceTool.click();
  const recording = page.locator('.admission-feedback[data-phase="recording"]');
  await expect(recording).toBeVisible({ timeout: FIXTURE_RECORDING_START_TIMEOUT_MS });
  await page.waitForTimeout(350);
  await recording.getByRole("button", { name: "停止录音", exact: true }).click();
  await expect.poll(() => transcriptionRequested).toBe(true);

  await settings.click();
  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog).toBeVisible();
  releaseTranscription();
  await transcriptionFulfilled;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  // Network work may finish, but an occluded material surface cannot receive
  // the visible change until modal ownership and its opening pointer are gone.
  await expect(page.locator(".admission-feedback")).toHaveCount(0);
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialNodeCount);
  await dialog.getByRole("button", { name: "关闭: 模型 API" }).click();
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialNodeCount + 1);
  await expect(settings).toBeFocused();
});

test("a transcription outage keeps material unchanged and Record again can recover", async ({ page }) => {
  let transcriptionRequests = 0;
  let releaseOutage!: () => void;
  const outageGate = new Promise<void>((resolve) => {
    releaseOutage = resolve;
  });
  let markOutageFulfilled!: () => void;
  const outageFulfilled = new Promise<void>((resolve) => {
    markOutageFulfilled = resolve;
  });
  await page.route("**/api/transcribe", async (route) => {
    transcriptionRequests += 1;
    if (transcriptionRequests === 1) {
      await outageGate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          error: {
            code: "TRANSCRIPTION_UNAVAILABLE",
            message: "Synthetic transcription outage.",
            retryable: true,
          },
        }),
      });
      markOutageFulfilled();
      return;
    }
    await route.continue();
  });

  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const initialNodeCount = await page.locator("[data-thought-id]").count();
  const voiceTool = page.locator('[data-tool-id="voice"]');
  await voiceTool.click();
  let recording = page.locator('.admission-feedback[data-phase="recording"]');
  await expect(recording).toBeVisible({ timeout: FIXTURE_RECORDING_START_TIMEOUT_MS });
  await page.waitForTimeout(350);
  await recording.getByRole("button", { name: "停止录音", exact: true }).click();
  await expect.poll(() => transcriptionRequests).toBe(1);

  const failure = page.locator('.admission-feedback[data-phase="error"]');
  // Stop already submitted the person's action. Hiding presentation may
  // unmount its recovery surface, but a failure reached while hidden cannot
  // erase that recoverable owner.
  await setDocumentVisibility(page, "hidden");
  releaseOutage();
  await outageFulfilled;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(failure).toHaveCount(0);
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialNodeCount);
  await setDocumentVisibility(page, "visible");
  await expect(failure).toContainText("没能把这段录音变成文字。");

  const retry = failure.getByRole("button", { name: "重新录音", exact: true });
  await expect(retry).toBeFocused();
  await retry.press("Enter");
  recording = page.locator('.admission-feedback[data-phase="recording"]');
  await expect(recording).toBeVisible({ timeout: FIXTURE_RECORDING_START_TIMEOUT_MS });
  const stop = recording.getByRole("button", { name: "停止录音", exact: true });
  await expect(stop).toBeFocused();
  await page.waitForTimeout(350);
  await stop.click();

  await expect(page.locator('[data-thought-id^="thought_"]')).toHaveCount(initialNodeCount + 1);
  await expect(voiceTool).toBeFocused();
  expect(transcriptionRequests).toBe(2);
});

test("reduced motion presents repaired text whole without a reveal sequence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", {
    name: fixtureUiCopy.voiceTool.recordTopLevelThought,
    exact: true,
  }).click();
  await page.waitForTimeout(350);
  await page
    .getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true })
    .click();

  const admitted = page.locator('[data-thought-id^="thought_"]')
    .filter({ hasText: repairedTranscript });
  await expect(admitted).toHaveCount(1, { timeout: FIXTURE_REPAIR_SETTLE_TIMEOUT_MS });
  const changed = admitted.locator('[data-repair-part="changed"]');
  await expect(changed.first()).toBeAttached();
  expect(await changed.evaluateAll((elements) => elements.every((element) => {
    const style = getComputedStyle(element);
    return style.animationName === "none" && style.color !== "rgba(0, 0, 0, 0)";
  }))).toBe(true);
  await expect(admitted.getByRole("button", { name: repairedTranscript, exact: true })).toHaveCount(1);
});

async function setDocumentVisibility(
  page: import("@playwright/test").Page,
  state: "hidden" | "visible",
): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}
