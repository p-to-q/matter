import { expect, test, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT_ID = "thought_fixture_root";
const SOURCE_SEGMENT = "我们怀念的也许不是一个真实存在过的过去";
const REWRITTEN_SEGMENT = "我们也许怀念的，并不是一个曾经真实存在的过去";
const SOURCE_TEXT = `${SOURCE_SEGMENT}，而是那个过去在今天仍然允许我们想象的其他生活。`;
const REWRITTEN_TEXT = `${REWRITTEN_SEGMENT}，而是那个过去在今天仍然允许我们想象的其他生活。`;
const DIRECTION = "换一种更凝练的说法";

test.describe("passage-local Point and Talk", () => {
  test("the AI mark rewrites its exact node locally and keeps the result undoable", async ({ page }) => {
    let requestSelection: Readonly<{
      nodeId: string;
      start: number;
      end: number;
      selectedText: string;
    }> | null = null;
    await page.route("**/api/text-swap", async (route) => {
      const envelope = route.request().postDataJSON() as {
        protocolVersion: "0.2";
        requestVersion: "text-swap/2";
        id: string;
        treeId: string;
        treeRevision: number;
        selection: typeof requestSelection;
      };
      requestSelection = envelope.selection;
      await new Promise((resolve) => setTimeout(resolve, 250));
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
            nodeId: ROOT_ID,
            start: 0,
            end: SOURCE_TEXT.length,
            text: REWRITTEN_TEXT,
            intent: "paraphrase",
          },
          presentation: { motionHint: "settle" },
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    await passage.hover();
    await page.getByRole("button", { name: "Rewrite this material with AI" }).click();

    const composer = page.locator(".point-talk");
    const direction = page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" });
    await expect(composer).toBeVisible();
    await expect(direction).toBeFocused();
    expect(await page.evaluate((rootId) => {
      const target = document.querySelector<HTMLElement>(`[data-thought-text-id="${rootId}"]`);
      const field = document.querySelector<HTMLElement>(".point-talk");
      if (target === null || field === null) return null;
      const range = document.createRange();
      range.selectNodeContents(target);
      const targetRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
      range.detach();
      const fieldRect = field.getBoundingClientRect();
      return {
        fieldHeight: Math.round(fieldRect.height),
        fieldWidth: Math.round(fieldRect.width),
        leftDifference: Math.abs(fieldRect.left - Math.min(...targetRects.map((rect) => rect.left))),
        upperGap: Math.min(...targetRects.map((rect) => rect.top)) - fieldRect.bottom,
      };
    }, ROOT_ID)).toEqual({
      fieldHeight: 38,
      fieldWidth: 264,
      leftDifference: 0,
      upperGap: 14,
    });
    await expect(composer.getByRole("button", { name: "取消", exact: true })).toHaveCount(0);
    await direction.fill(DIRECTION);
    await page.getByRole("button", { name: "改写", exact: true }).click();
    await expect(composer).toHaveAttribute("data-phase", "pending");
    await expect(passage).toContainText(REWRITTEN_TEXT);
    expect(requestSelection).toEqual({
      type: "segment-range",
      nodeId: ROOT_ID,
      start: 0,
      end: SOURCE_TEXT.length,
      selectedText: SOURCE_TEXT,
    });
    await expect(page.locator('.transform-text[data-transform-motion="settle"]')).toHaveCount(1);

    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
    await expect(passage).toContainText(SOURCE_TEXT);
  });

  test("the local field follows material zoom within one optical size range", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    const shell = page.locator("main.matter-shell");
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const setCanvasZoom = async (deltaY: number) => {
      await pan.click();
      const pivot = await passage.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      });
      await shell.dispatchEvent("wheel", {
        clientX: pivot.x,
        clientY: pivot.y,
        ctrlKey: true,
        deltaMode: 0,
        deltaY,
      });
      await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
    };
    const openAndMeasure = async () => {
      await passage.hover();
      await page.getByRole("button", { name: "Rewrite this material with AI" }).click();
      const composer = page.locator(".point-talk");
      await expect(composer).toBeVisible();
      return composer.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          height: bounds.height,
          scale: Number.parseFloat(getComputedStyle(element).getPropertyValue("--point-talk-scale")),
          width: bounds.width,
        };
      });
    };

    await setCanvasZoom(-1e6);
    const maximum = await openAndMeasure();
    expect(maximum.scale).toBe(1.1);
    expect(maximum.width).toBeCloseTo(264 * maximum.scale, 1);
    expect(maximum.height).toBeCloseTo(38 * maximum.scale, 1);
    await page.keyboard.press("Escape");

    await setCanvasZoom(1e6);
    const minimum = await openAndMeasure();
    expect(minimum.scale).toBe(.74);
    expect(minimum.width).toBeCloseTo(264 * minimum.scale, 1);
    expect(minimum.height).toBeGreaterThanOrEqual(38 * minimum.scale);
    expect(minimum.height).toBeLessThan(29);
  });

  test("the local field stays inside clipped material when its passage reaches the index edge", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    const paper = page.locator(".matter-document");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan }).click();
    const paperBox = await paper.boundingBox();
    if (paperBox === null) throw new Error("material paper must be measurable");
    const pointer = {
      x: paperBox.x + paperBox.width * .5,
      y: paperBox.y + paperBox.height * .5,
    };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x - 160, pointer.y);
    await page.mouse.up();
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();

    await passage.hover();
    await page.getByRole("button", { name: "Rewrite this material with AI" }).click();
    const field = page.locator(".point-talk");
    await expect(field).toBeVisible();
    expect(await page.evaluate(() => {
      const paperElement = document.querySelector<HTMLElement>(".matter-document");
      const fieldElement = document.querySelector<HTMLElement>(".point-talk");
      if (paperElement === null || fieldElement === null) return null;
      const paperRect = paperElement.getBoundingClientRect();
      const fieldRect = fieldElement.getBoundingClientRect();
      return {
        bottom: fieldRect.bottom <= paperRect.bottom - 11,
        left: fieldRect.left >= paperRect.left + 11,
        right: fieldRect.right <= paperRect.right - 11,
        top: fieldRect.top >= paperRect.top + 11,
      };
    })).toEqual({ bottom: true, left: true, right: true, top: true });
  });

  test("stopping Voice submits one exact local direction without a keyboard", async ({ page }) => {
    let requestedDirection: string | null = null;
    await page.route("**/api/text-swap", async (route) => {
      const envelope = route.request().postDataJSON() as {
        protocolVersion: "0.2";
        requestVersion: "text-swap/2";
        id: string;
        treeId: string;
        treeRevision: number;
        direction: { text: string };
      };
      requestedDirection = envelope.direction.text;
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
            nodeId: ROOT_ID,
            start: 0,
            end: SOURCE_TEXT.length,
            text: REWRITTEN_TEXT,
            intent: "paraphrase",
          },
          presentation: { motionHint: "settle" },
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    await passage.hover();
    await page.getByRole("button", { name: "Rewrite this material with AI" }).click();
    await page.getByRole("button", { name: "说出改写方向", exact: true }).click();
    await expect(page.locator('.point-talk[data-phase="recording"]')).toBeVisible();
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await expect(passage).toContainText(REWRITTEN_TEXT);
    expect(requestedDirection).toBe(`${DIRECTION}。`);
  });

  test("an outside canvas pointer cancels a pending local turn and its late result", async ({ page }) => {
    await page.route("**/api/text-swap", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue().catch(() => undefined);
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    await passage.hover();
    await page.getByRole("button", { name: "Rewrite this material with AI" }).click();
    await page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" }).fill(DIRECTION);
    await page.getByRole("button", { name: "改写", exact: true }).click();
    await expect(page.locator('.point-talk[data-phase="pending"]')).toBeVisible();

    await passage.click();
    await expect(page.locator(".point-talk")).toBeHidden();
    await page.waitForTimeout(650);
    await expect(passage).toContainText(SOURCE_TEXT);
  });

  test.describe("coarse pointer", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("the local composer stays inside a coarse visual viewport", async ({ page }) => {
      await page.goto("/matter");
      await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
      await page.locator(`[data-thought-text-id="${ROOT_ID}"]`).click();
      await page.getByRole("button", { name: "Rewrite this material with AI" }).click();
      const composer = page.locator(".point-talk");
      await expect(composer).toBeVisible();
      expect(await composer.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 11 && rect.right <= innerWidth - 11 && rect.top >= 11 && rect.bottom <= innerHeight - 11;
      })).toBe(true);
      expect(await composer.locator("button").evaluateAll((buttons) => buttons.every((button) =>
        button.getBoundingClientRect().height >= 48
      ))).toBe(true);
    });
  });
});

test.describe.skip("historical lasso Text Swap presenter", () => {

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
  await expect(page.getByRole("button", { name: fixtureUiCopy.voiceTool.recordTopLevelThought, exact: true })).toBeEnabled();
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

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
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

    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
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
      requestVersion: "text-swap/2";
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

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitLanguageSelection, exact: true }).click();
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
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
}

async function selectFirstSegment(
  page: Page,
  text: ReturnType<Page["locator"]>,
): Promise<void> {
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
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

});
