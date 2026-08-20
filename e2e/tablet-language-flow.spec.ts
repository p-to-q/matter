import { expect, test, type Locator, type Page } from "@playwright/test";

const ROOT_ID = "thought_fixture_root";
const SOURCE_SEGMENT = "我们怀念的也许不是一个真实存在过的过去";
const REWRITTEN_SEGMENT = "我们也许怀念的，并不是一个曾经真实存在的过去";
const EXPANDED_SEGMENT = "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去";
const SOURCE_TEXT = `${SOURCE_SEGMENT}，而是那个过去在今天仍然允许我们想象的其他生活。`;

test.describe("tablet touch material language", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 834, height: 1112 } });

  test("Text Swap and Elastic remain reachable without local control collisions", async ({ page }) => {
    const browserErrors: string[] = [];
    let swapRequests = 0;
    let turnRequests = 0;
    const releaseSwapResponses: Array<() => void> = [];
    const releaseTurnResponses: Array<() => void> = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.route("**/api/text-swap", async (route) => {
      swapRequests += 1;
      await new Promise<void>((resolve) => releaseSwapResponses.push(resolve));
      await route.continue();
    });
    await page.route("**/api/turn", async (route) => {
      turnRequests += 1;
      await new Promise<void>((resolve) => releaseTurnResponses.push(resolve));
      await route.continue();
    });

    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(page.getByRole("button", { name: "Record a top-level thought", exact: true })).toBeEnabled();

    await focusRootByTouch(page);
    const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
    await expect(text).toHaveText(SOURCE_TEXT);
    await selectFirstSegmentByTouch(page, text);

    const voice = page.getByRole("button", { name: "Rewrite selected language", exact: true });
    const typeDirection = page.getByRole("button", {
      name: "输入所选文字的改写方向",
      exact: true,
    });
    const grip = page.getByRole("slider", {
      name: "Set selected language expansion with the lower handle",
    });
    const rail = page.getByRole("slider", {
      name: "Set selected language expansion amount without dragging",
    });
    const toolRail = page.getByRole("navigation", { name: "Editing tools" });

    await expect(voice).toBeEnabled();
    await expect(typeDirection).toBeVisible();
    await expect(page.locator(".stretch-handle")).toHaveCount(1);
    await expect(page.locator(".stretch-handle--bottom")).toHaveCount(1);
    await expect(page.locator(".stretch-handle--top")).toHaveCount(0);
    await expect(grip).toHaveAttribute("aria-valuenow", "0");
    await expect(rail).toHaveAttribute("aria-valuenow", "0");
    await expectNoOverlap(typeDirection, toolRail);
    await expectNoOverlap(grip, toolRail);
    await expectNoOverlap(typeDirection, grip);
    const toolTargets = await toolRail.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }));
    expect(toolTargets.length).toBeGreaterThan(0);
    expect(toolTargets.every(({ width, height }) => width >= 48 && height >= 48)).toBe(true);

    await voice.tap();
    const stop = page.getByRole("button", { name: "Stop rewrite direction", exact: true });
    await expect(stop).toBeVisible();
    await expect(page.locator(".stretch-handle")).toHaveCount(0);
    const recording = page.locator('.text-swap-feedback[data-phase="recording"]');
    await expect(recording).toContainText("正在听你想怎样换一种说法");
    await expectNoOverlap(recording, toolRail);
    await page.waitForTimeout(350);
    await stop.tap();

    await expect.poll(() => swapRequests).toBe(1);
    await expect(page.locator('.text-swap-feedback[data-phase="pending"]')).toContainText("正在换个说法");
    await expect(text).toHaveText(SOURCE_TEXT);
    releaseSwapResponses.shift()?.();
    await expect(text).toContainText(REWRITTEN_SEGMENT);
    expect(swapRequests).toBe(1);

    await page.getByRole("button", { name: "Undo last change", exact: true }).tap();
    await expect(text).toHaveText(SOURCE_TEXT);
    await expect(page.locator(".transform-text")).toHaveCount(0);

    const exitLasso = page.getByRole("button", { name: "Exit language selection", exact: true });
    if (await exitLasso.count()) await exitLasso.tap();
    await selectFirstSegmentByTouch(page, text);
    await expect(page.locator(".stretch-handle--bottom")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true })).toBeEnabled();

    const railBox = await rail.boundingBox();
    if (railBox === null) throw new Error("tablet Elastic amount rail missing");
    expect(railBox.width).toBeGreaterThanOrEqual(48);
    expect(railBox.height).toBe(120);
    await page.touchscreen.tap(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(typeDirection).toHaveCount(0);
    await expect(voice).toBeDisabled();
    expect(turnRequests).toBe(0);

    // Choosing an Elastic degree owns the local operation. Resetting the
    // lasso is the explicit way back to the two-operation choice point.
    const exitAfterModeSwitch = page.getByRole("button", { name: "Exit language selection", exact: true });
    if (await exitAfterModeSwitch.count()) await exitAfterModeSwitch.tap();
    await selectFirstSegmentByTouch(page, text);
    await expect(typeDirection).toBeVisible();
    await expect(voice).toBeEnabled();
    const resetRailBox = await rail.boundingBox();
    if (resetRailBox === null) throw new Error("tablet Elastic amount rail missing after lasso reset");
    await page.touchscreen.tap(
      resetRailBox.x + resetRailBox.width / 2,
      resetRailBox.y + resetRailBox.height / 2,
    );
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(typeDirection).toHaveCount(0);
    await expect(voice).toBeDisabled();

    const gripBox = await grip.boundingBox();
    if (gripBox === null) throw new Error("tablet lower Elastic grip missing");
    expect(gripBox.width).toBeGreaterThanOrEqual(48);
    expect(gripBox.height).toBeGreaterThanOrEqual(48);
    await expectContainedByVisualViewport(page, grip);
    await page.touchscreen.tap(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await expect.poll(() => turnRequests).toBe(1);
    await expect(page.locator('.stretch-status-marker[data-phase="requesting"]')).toHaveText("正在展开");
    await expectContainedByVisualViewport(page, grip);
    await expect(typeDirection).toHaveCount(0);
    await expect(voice).toBeDisabled();
    releaseTurnResponses.shift()?.();
    await expect(text).toContainText(EXPANDED_SEGMENT);
    expect(turnRequests).toBe(1);

    await page.getByRole("button", { name: "Undo last change", exact: true }).tap();
    await expect(text).toHaveText(SOURCE_TEXT);
    expect(browserErrors).toEqual([]);
  });
});

async function focusRootByTouch(page: Page): Promise<void> {
  await page.locator(`[data-thought-text-id="${ROOT_ID}"]`).tap();
  await page.getByRole("toolbar", { name: "Thought actions" })
    .getByRole("button", { name: "Focus this thought" })
    .tap();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
}

async function selectFirstSegmentByTouch(page: Page, text: Locator): Promise<void> {
  await page.getByRole("button", { name: "Circle-select language", exact: true }).tap();
  await drawTouchLoop(page, await segmentProbeRect(text, 0));
  await expect(page.locator(".lasso-selection-fragment").first()).toBeVisible();
}

async function drawTouchLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const margin = 9;
  const points = [
    { x: rect.x - margin, y: rect.y - margin },
    { x: rect.x + rect.width + margin, y: rect.y - margin },
    { x: rect.x + rect.width + margin, y: rect.y + rect.height + margin },
    { x: rect.x - margin, y: rect.y + rect.height + margin },
    { x: rect.x - margin, y: rect.y + Math.min(18, rect.height * .45) },
  ];
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...points[0]!, id: 1, radiusX: 1, radiusY: 1 }],
    });
    for (const point of points.slice(1)) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...point, id: 1, radiusX: 1, radiusY: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function expectNoOverlap(first: Locator, second: Locator): Promise<void> {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  const overlapWidth = Math.max(
    0,
    Math.min(firstBox!.x + firstBox!.width, secondBox!.x + secondBox!.width) -
      Math.max(firstBox!.x, secondBox!.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(firstBox!.y + firstBox!.height, secondBox!.y + secondBox!.height) -
      Math.max(firstBox!.y, secondBox!.y),
  );
  expect(overlapWidth * overlapHeight).toBe(0);
}

async function expectContainedByVisualViewport(page: Page, target: Locator): Promise<void> {
  const [box, viewport] = await Promise.all([
    target.boundingBox(),
    page.evaluate(() => {
      const visual = window.visualViewport;
      return visual === null
        ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        : {
            left: visual.offsetLeft,
            top: visual.offsetTop,
            right: visual.offsetLeft + visual.width,
            bottom: visual.offsetTop + visual.height,
          };
    }),
  ]);
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(viewport.left - .5);
  expect(box!.y).toBeGreaterThanOrEqual(viewport.top - .5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.right + .5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.bottom + .5);
}

async function segmentProbeRect(
  text: Locator,
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
    const fragment = Array.from(range.getClientRects()).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (fragment === undefined) throw new Error("fixture fragment missing");
    return {
      x: fragment.left + fragment.width / 2 - 2,
      y: fragment.top + fragment.height / 2 - 2,
      width: 4,
      height: 4,
    };
  }, segmentIndex);
}
