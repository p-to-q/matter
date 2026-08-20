import { expect, test, type Page } from "@playwright/test";

const ROOT_ID = "thought_fixture_root";
const SOURCE_SEGMENT = "我们怀念的也许不是一个真实存在过的过去";
const REWRITTEN_SEGMENT = "我们也许怀念的，并不是一个曾经真实存在的过去";
const SOURCE_TEXT = `${SOURCE_SEGMENT}，而是那个过去在今天仍然允许我们想象的其他生活。`;
const REWRITTEN_TEXT = `${REWRITTEN_SEGMENT}，而是那个过去在今天仍然允许我们想象的其他生活。`;
const DIRECTION = "换一种更凝练的说法";

test("Text Swap keeps Full-view admission, then Voice rewrites one Focus segment atomically", async ({ page }) => {
  const browserErrors: string[] = [];
  let swapRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.route("**/api/text-swap", async (route) => {
    swapRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.getByRole("button", { name: "Record a top-level thought", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true })).toHaveCount(0);

  await focusRoot(page, false);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await expect(text).toHaveText(SOURCE_TEXT);
  await selectFirstSegment(page, text);

  const rewriteVoice = page.getByRole("button", { name: "Rewrite selected language", exact: true });
  await expect(rewriteVoice).toBeEnabled();
  await expect(page.getByRole("button", { name: "输入所选文字的改写方向", exact: true })).toBeVisible();

  await observeCanonicalText(page);
  await rewriteVoice.click();
  await expect(page.getByRole("slider")).toHaveCount(0);
  const stop = page.getByRole("button", { name: "Stop rewrite direction", exact: true });
  await expect(stop).toBeVisible();
  await expect(page.locator('.text-swap-feedback[data-phase="recording"]')).toContainText(
    "正在听你想怎样换一种说法",
  );
  await expectLaneBeforeSuffix(page, [
    page.locator('.text-swap-feedback[data-phase="recording"]'),
  ]);
  await page.waitForTimeout(350);
  await stop.click();

  const pending = page.locator('.text-swap-feedback[data-phase="pending"]');
  await expect(pending).toContainText("正在换个说法");
  await expect(text).toHaveText(SOURCE_TEXT);
  await expect(page.locator(`[data-thought-id="${ROOT_ID}"]`)).toHaveAttribute(
    "data-transform-phase",
    "requesting",
  );
  await expectFeedbackToFollowSelection(page, pending);
  await expectLaneBeforeSuffix(page, [pending]);

  await expect(text).toHaveText(REWRITTEN_TEXT);
  expect(swapRequests).toBe(1);
  const observed = await page.evaluate(() => {
    const state = window as Window & { __matterTextSwapObserved?: string[] };
    return state.__matterTextSwapObserved ?? [];
  });
  expect(observed.length).toBeGreaterThan(0);
  expect(observed).toContain(REWRITTEN_TEXT);
  expect(observed.every((value) => value === SOURCE_TEXT || value === REWRITTEN_TEXT)).toBe(true);
  await expect(page.locator('.transform-text[data-transform-motion="settle"]')).toHaveCount(1);
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.getByRole("button", { name: "Undo last change", exact: true }).click();
  await expect(text).toHaveText(SOURCE_TEXT);
  await expect(page.locator(".transform-text")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+Z");
  await expect(text).toHaveText(REWRITTEN_TEXT);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toContainText(REWRITTEN_TEXT);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  expect(swapRequests).toBe(1);
  expect(browserErrors).toEqual([]);
});

test.describe("coarse pointer and reduced motion", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("Text Swap keeps its typed local alternative usable without replaying arrival", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    let swapRequests = 0;
    await page.route("**/api/text-swap", async (route) => {
      swapRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });

    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await focusRoot(page, true);
    const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
    await selectFirstSegment(page, text);

    const typeDirection = page.getByRole("button", {
      name: "输入所选文字的改写方向",
      exact: true,
    });
    const entryBox = await typeDirection.boundingBox();
    expect(entryBox).not.toBeNull();
    expect(entryBox!.width).toBeGreaterThanOrEqual(48);
    expect(entryBox!.height).toBeGreaterThanOrEqual(48);
    await typeDirection.click();

    const direction = page.getByRole("textbox", { name: "输入所选文字的改写方向", exact: true });
    await expect(direction).toBeFocused();
    await direction.fill(DIRECTION);
    const submit = page.getByRole("button", { name: "改写", exact: true });
    await expectLaneBeforeSuffix(page, [direction, submit]);
    await submit.click();
    await expect(page.locator('.text-swap-feedback[data-phase="pending"]')).toContainText("正在换个说法");
    await expectLaneBeforeSuffix(page, [page.locator('.text-swap-feedback[data-phase="pending"]')]);
    await expect(text).toHaveText(SOURCE_TEXT);
    await expect(text).toHaveText(REWRITTEN_TEXT);
    expect(swapRequests).toBe(1);
    await expect(page.locator(".transform-text")).toHaveCount(0);

    await page.getByRole("button", { name: "Undo last change", exact: true }).click();
    await expect(text).toHaveText(SOURCE_TEXT);
    await page.keyboard.press("Control+Shift+Z");
    await expect(text).toHaveText(REWRITTEN_TEXT);
    await page.reload();
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toContainText(REWRITTEN_TEXT);
    await expect(page.locator(".transform-text")).toHaveCount(0);
    expect(swapRequests).toBe(1);
  });
});

test("Text Swap cancel revokes a late response without changing material", async ({ page }) => {
  let swapRequests = 0;
  await page.route("**/api/text-swap", async (route) => {
    swapRequests += 1;
    const envelope = route.request().postDataJSON() as {
      protocolVersion: "0.2";
      requestVersion: "text-swap/1";
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        protocolVersion: envelope.protocolVersion,
        requestVersion: envelope.requestVersion,
        id: envelope.id,
        treeId: envelope.treeId,
        treeRevision: envelope.treeRevision,
        action: {
          id: envelope.id,
          type: "replace-text-range",
          nodeId: envelope.selection.nodeId,
          start: envelope.selection.start,
          end: envelope.selection.end,
          text: REWRITTEN_SEGMENT,
          intent: "paraphrase",
        },
        presentation: { motionHint: "settle" },
      }),
    }).catch(() => undefined);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await selectFirstSegment(page, text);
  await page.getByRole("button", { name: "输入所选文字的改写方向", exact: true }).click();
  await page.getByRole("textbox", { name: "输入所选文字的改写方向", exact: true }).fill(DIRECTION);
  await page.getByRole("button", { name: "改写", exact: true }).click();
  await expect(page.locator('.text-swap-feedback[data-phase="pending"]')).toBeVisible();

  await page.getByRole("button", { name: "Exit language selection", exact: true }).click();
  await expect(page.locator(".text-swap-feedback")).toHaveCount(0);
  await page.waitForTimeout(650);
  await expect(text).toHaveText(SOURCE_TEXT);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  expect(swapRequests).toBe(1);
});

test("Text Swap retryable failure keeps its local lane and original material", async ({ page }) => {
  let swapRequests = 0;
  await page.route("**/api/text-swap", async (route) => {
    swapRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TURN_UNAVAILABLE",
          message: "Synthetic model unavailable.",
          retryable: true,
          fallbackReason: "MODEL_UNAVAILABLE",
        },
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await selectFirstSegment(page, text);
  await page.getByRole("button", { name: "输入所选文字的改写方向", exact: true }).click();
  await page.getByRole("textbox", { name: "输入所选文字的改写方向", exact: true }).fill(DIRECTION);
  await page.getByRole("button", { name: "改写", exact: true }).click();

  const failure = page.locator('.text-swap-feedback[data-phase="error"]');
  await expect(failure).toContainText("没有改写，原文保留");
  await expectLaneBeforeSuffix(page, [failure]);
  await expect(text).toHaveText(SOURCE_TEXT);
  expect(swapRequests).toBe(1);
});

async function focusRoot(page: Page, narrow: boolean): Promise<void> {
  const rootText = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  if (narrow) await rootText.click();
  else await rootText.hover();
  await page.getByRole("toolbar", { name: "Thought actions" })
    .getByRole("button", { name: "Focus this thought" })
    .click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
}

async function selectFirstSegment(
  page: Page,
  text: ReturnType<Page["locator"]>,
): Promise<void> {
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  await expect(page.locator(".lasso-selection-fragment").first()).toBeVisible();
}

async function observeCanonicalText(page: Page): Promise<void> {
  await page.evaluate((rootId) => {
    const label = document.querySelector(`[data-thought-text-id="${rootId}"] .spatial-thought__label`);
    if (!(label instanceof HTMLElement)) throw new Error("root text label missing");
    const state = window as Window & { __matterTextSwapObserved?: string[] };
    state.__matterTextSwapObserved = [];
    new MutationObserver(() => {
      state.__matterTextSwapObserved?.push(label.textContent ?? "");
    }).observe(label, { characterData: true, childList: true, subtree: true });
  }, ROOT_ID);
}

async function expectFeedbackToFollowSelection(
  page: Page,
  feedback: ReturnType<Page["locator"]>,
): Promise<void> {
  const feedbackBox = await feedback.boundingBox();
  const fragments = await page.locator(".lasso-selection-fragment").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom };
    }));
  expect(feedbackBox).not.toBeNull();
  expect(fragments.length).toBeGreaterThan(0);
  const left = Math.min(...fragments.map((fragment) => fragment.left));
  const right = Math.max(...fragments.map((fragment) => fragment.right));
  const bottom = Math.max(...fragments.map((fragment) => fragment.bottom));
  const feedbackCenter = feedbackBox!.x + feedbackBox!.width / 2;
  expect(feedbackCenter).toBeGreaterThanOrEqual(left - 1);
  expect(feedbackCenter).toBeLessThanOrEqual(right + 1);
  expect(feedbackBox!.y).toBeGreaterThanOrEqual(bottom);
}

async function expectLaneBeforeSuffix(
  page: Page,
  controls: readonly ReturnType<Page["locator"]>[],
): Promise<void> {
  const suffix = page.locator(".language-split-block--after");
  const selection = page.locator(".language-split-block--selected");
  await expect(page.locator(".language-split-projection")).toHaveAttribute(
    "data-preview-mode",
    /^(lane|expand)$/,
  );
  const [selectionBox, suffixBox] = await Promise.all([
    selection.boundingBox(),
    suffix.boundingBox(),
  ]);
  expect(selectionBox).not.toBeNull();
  expect(suffixBox).not.toBeNull();
  for (const control of controls) {
    await expect(control).toBeVisible();
    const controlBox = await control.boundingBox();
    expect(controlBox).not.toBeNull();
    expect(controlBox!.y).toBeGreaterThanOrEqual(selectionBox!.y + selectionBox!.height - 1);
    expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(suffixBox!.y + 1);
  }
}

async function segmentProbeRect(
  text: ReturnType<Page["locator"]>,
  segmentIndex: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return text.evaluate((element, index) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const content = textNode.data;
    const delimiters = ["，", "。", "；", "：", "！", "？", ",", ".", ";", ":", "!", "?"];
    const segments: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (let cursor = 0; cursor < content.length; cursor += 1) {
      if (!delimiters.includes(content[cursor]!)) continue;
      if (cursor > start) segments.push({ start, end: cursor });
      start = cursor + 1;
    }
    if (start < content.length) segments.push({ start, end: content.length });
    const segment = segments[index];
    if (segment === undefined) throw new Error("fixture segment missing");
    const range = document.createRange();
    range.setStart(textNode, segment.start);
    range.setEnd(textNode, segment.end);
    const rect = Array.from(range.getClientRects()).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (rect === undefined) throw new Error("fixture fragment missing");
    return {
      x: rect.left + rect.width / 2 - 2,
      y: rect.top + rect.height / 2 - 2,
      width: 4,
      height: 4,
    };
  }, segmentIndex);
}

async function drawEarlyReleaseLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  await page.mouse.move(rect.x - margin, rect.y + Math.min(18, rect.height * .45), { steps: 2 });
  await page.mouse.up();
}
