import { expect, test } from "@playwright/test";
import {
  clickExposedMaterial,
} from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const parentId = "thought_fixture_imagined_lives";
const heardTranscript = "呃，我觉得我觉得这个方案可以，但是它的实现事件比预期长。";
const repairedTranscript = "我觉得这个方案可以，但是它的实现时间比预期长。";
// This is a functional boundary, not the performance receipt. Keep it below
// the 12 s repair lease while allowing a loaded parallel browser to schedule
// the otherwise immediate fixture round trip.
const FIXTURE_REPAIR_SETTLE_TIMEOUT_MS = 5_000;

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`voice admits one undoable child thought at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
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

    if (viewport.width < 960) {
      await page.locator(`[data-thought-id="${parentId}"] [data-thought-text-id]`).click();
    } else {
      await clickExposedMaterial(
        page,
        page.locator(`[data-thought-id="${parentId}"] [data-thought-text-id]`),
      );
    }
    await expect(page.locator(`[data-thought-id="${parentId}"]`)).toHaveAttribute(
      "data-selected",
      "true",
    );
    const voice = page.getByRole("button", {
      name: fixtureUiCopy.voiceTool.recordBelowSelectedMaterial,
      exact: true,
    });
    await expect(voice).toBeEnabled();
    await voice.click();
    const stop = page
      .getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true });
    await expect(stop).toBeVisible();
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
    const selectedBox = await page.locator(`[data-thought-id="${parentId}"]`).boundingBox();
    expect(feedbackBox).not.toBeNull();
    expect(selectedBox).not.toBeNull();
    // The structural commit anchor is invisible; feedback instead follows the
    // selected visible passage and must clear every rendered language block.
    expect(feedbackBox!.y).toBeGreaterThanOrEqual(selectedBox!.y + selectedBox!.height + 17);
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
    await stop.click();

    const heard = page.locator('[data-thought-id^="thought_"]').filter({ hasText: heardTranscript });
    const admitted = page.locator('[data-thought-id^="thought_"]').filter({ hasText: repairedTranscript });
    // The fixture model resolves immediately. The raw transcript must still be
    // the first canonical material for the complete visibility floor.
    await expect(heard).toHaveCount(1);
    const rawSeenAt = await page.evaluate(() => performance.now());
    await expect(admitted).toHaveCount(1, { timeout: FIXTURE_REPAIR_SETTLE_TIMEOUT_MS });
    await expect(heard).toHaveCount(0);
    const reveal = admitted.locator(".repair-text");
    await expect(reveal).toHaveAttribute("data-repair-reveal-count", /[1-9]\d*/u);
    await expect(reveal).toHaveText(repairedTranscript, { useInnerText: false });
    const revealCount = Number(await reveal.getAttribute("data-repair-reveal-count"));
    const changedInk = await reveal.locator('[data-repair-part="changed"]').allTextContents();
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
    expect(Math.min(...animations.map(({ time }) => time)) - rawSeenAt).toBeGreaterThanOrEqual(120);
    expect(Math.max(...animations.map(({ time }) => time)) -
      Math.min(...animations.map(({ time }) => time))).toBeGreaterThan(40);
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
      .toHaveText("说话，让想法向下生长。");
    await expect(page.locator(`[data-thought-id="${parentId}"]`)).toHaveAttribute(
      "data-selected",
      "true",
    );
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
    const parentGeometry = geometry.find(({ id }) => id === parentId);
    const admittedGeometry = geometry.find(({ id }) => id === admittedId);
    expect(geometry).toHaveLength(11);
    expect(parentGeometry).toBeDefined();
    expect(admittedGeometry).toBeDefined();
    // A selected visible passage is the durable parent, so admission moves one
    // structural level to the right instead of becoming its sibling.
    expect(admittedGeometry!.x).toBeGreaterThan(parentGeometry!.x);

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

test("reduced motion presents repaired text whole without a reveal sequence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await clickExposedMaterial(
    page,
    page.locator(`[data-thought-id="${parentId}"] [data-thought-text-id]`),
  );
  await page.getByRole("button", {
    name: fixtureUiCopy.voiceTool.recordBelowSelectedMaterial,
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
