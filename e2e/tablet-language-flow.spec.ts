import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT_ID = "thought_fixture_root";
const SOURCE_SEGMENT = "我们怀念的也许不是一个真实存在过的过去";
const EXPANDED_SEGMENT = "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去";
const SOURCE_TEXT = `${SOURCE_SEGMENT}，而是那个过去在今天仍然允许我们想象的其他生活。`;

test.describe("tablet touch material language", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 834, height: 1112 } });

  test("coarse admission actions keep a 48px target and a two-pixel keyboard focus", async ({ page }) => {
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await page.getByRole("button", { name: fixtureUiCopy.voiceTool.recordTopLevelThought, exact: true }).tap();
    const feedback = page.locator(".admission-feedback");
    await expect(feedback).toBeVisible();
    const actions = feedback.locator("button");
    expect(await actions.count()).toBeGreaterThan(0);
    for (const box of await actions.evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }))) {
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
    await page.keyboard.press("Tab");
    await actions.first().focus();
    await expect(actions.first()).toHaveCSS("outline-width", "2px");
    await actions.last().click();
    await expect.poll(async () => await feedback.count() === 0
      ? "closed"
      : await feedback.getAttribute("data-phase"), {
      message: "fake-device recording should either commit or expose its explicit no-audio recovery",
    }).toMatch(/^(closed|error)$/u);
    if (await feedback.count() > 0) {
      const recoveryActions = feedback.locator("button");
      expect(await recoveryActions.count()).toBeGreaterThan(0);
      for (const box of await recoveryActions.evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }))) {
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      await recoveryActions.last().click();
    }
    await expect(feedback).toHaveCount(0);
  });

  test("Elastic remains the only selected-language action without local control collisions", async ({ page }) => {
    const browserErrors: string[] = [];
    let turnRequests = 0;
    const releaseTurnResponses: Array<() => void> = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.route("**/api/turn", async (route) => {
      turnRequests += 1;
      await new Promise<void>((resolve) => releaseTurnResponses.push(resolve));
      await route.continue();
    });

    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(page.getByRole("button", { name: fixtureUiCopy.voiceTool.recordTopLevelThought, exact: true })).toBeEnabled();

    await focusRootByTouch(page);
    const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
    await expect(text).toHaveText(SOURCE_TEXT);
    await selectFirstSegmentByTouch(page, text);

    const typeDirection = page.getByRole("textbox", {
      name: "输入所选文字的改写方向",
      exact: true,
    });
    const upperGrip = page.getByRole("slider", {
      name: "用上握点设置所选文字的展开程度",
    });
    const grip = page.getByRole("slider", {
      name: "用下握点设置所选文字的展开程度",
    });
    const toolRail = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools });

    await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true }))
      .toHaveCount(0);
    await expect(typeDirection).toHaveCount(0);
    await expect(page.locator(".stretch-handle")).toHaveCount(2);
    await expect(page.locator(".stretch-handle--bottom")).toHaveCount(1);
    await expect(page.locator(".stretch-handle--top")).toHaveCount(1);
    await expect(upperGrip).toHaveAttribute("aria-valuenow", "0");
    await expect(grip).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator(".stretch-amount-rail")).toHaveCount(0);
    await expectNoOverlap(upperGrip, toolRail);
    await expectNoOverlap(grip, toolRail);
    await expectUpperGripAtSelection(page, upperGrip);
    await expectNeutralSelection(page);
    const toolTargets = await toolRail.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }));
    expect(toolTargets.length).toBeGreaterThan(0);
    expect(toolTargets.every(({ width, height }) => width >= 48 && height >= 48)).toBe(true);

    const lowerGripBox = await grip.boundingBox();
    if (lowerGripBox === null) throw new Error("tablet lower Elastic grip missing");
    expect(lowerGripBox.width).toBeGreaterThanOrEqual(48);
    expect(lowerGripBox.height).toBeGreaterThanOrEqual(48);
    await dragByTouch(page, grip, 12);
    await expect(grip).toHaveAttribute("aria-valuenow", "0");
    await expect(typeDirection).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true }))
      .toHaveCount(0);
    expect(turnRequests).toBe(0);

    await expect(typeDirection).toHaveCount(0);
    await expect(grip).toHaveAttribute("aria-valuenow", "0");
    await expectUpperGripAtSelection(page, upperGrip);
    await expectNeutralSelection(page);

    const gripBox = await upperGrip.boundingBox();
    if (gripBox === null) throw new Error("tablet upper Elastic grip missing");
    expect(gripBox.width).toBeGreaterThanOrEqual(48);
    expect(gripBox.height).toBeGreaterThanOrEqual(48);
    await expectContainedByVisualViewport(page, upperGrip);
    await dragByTouch(page, upperGrip, -68);
    await expect.poll(() => turnRequests).toBe(1);
    await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
    // The first eight pixels are the existing deadzone, so 60px of this 68px
    // gesture contributes exactly half of the 120px degree range.
    await expect(upperGrip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(page.locator(".language-split-projection"))
      .toHaveAttribute("data-stretch-handle", "top");
    await expectContainedByVisualViewport(page, upperGrip);
    await expect(typeDirection).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true }))
      .toHaveCount(0);
    releaseTurnResponses.shift()?.();
    await expect(text).toContainText(EXPANDED_SEGMENT);
    expect(turnRequests).toBe(1);

    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).tap();
    await expect(text).toHaveText(SOURCE_TEXT);
    expect(browserErrors).toEqual([]);
  });
});

async function focusRootByTouch(page: Page): Promise<void> {
  await page.locator(`[data-thought-text-id="${ROOT_ID}"]`).tap();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
}

async function selectFirstSegmentByTouch(page: Page, text: Locator): Promise<void> {
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).tap();
  await drawTouchLoop(page, await segmentProbeRect(text, 0));
  await expect(page.locator('.material-address-layer[data-address-variant="actionable"]'))
    .toHaveAttribute("data-material-address-painted", "true");
  await expect(page.locator(".lasso-selection-fragment").first()).toBeHidden();
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

async function dragByTouch(page: Page, target: Locator, deltaY: number): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error("touch drag target missing");
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1, radiusX: 1, radiusY: 1 }],
    });
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + deltaY * step, id: 1, radiusX: 1, radiusY: 1 }],
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

async function expectNeutralSelection(page: Page): Promise<void> {
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-preview-mode", "neutral");
  await expect(page.locator('.material-address-layer[data-address-variant="actionable"]'))
    .toHaveAttribute("data-material-address-painted", "true");
  await expect(page.locator(".lasso-selection-fragment").first()).toBeHidden();
}

async function expectUpperGripAtSelection(page: Page, grip: Locator): Promise<void> {
  const [gripBox, addressBox] = await Promise.all([
    grip.boundingBox(),
    page.locator(
      '.material-address-layer[data-address-variant="actionable"] .material-address-layer__path',
    ).boundingBox(),
  ]);
  expect(gripBox).not.toBeNull();
  expect(addressBox).not.toBeNull();
  const lowerEdge = gripBox!.y + gripBox!.height;
  expect(lowerEdge).toBeLessThanOrEqual(addressBox!.y + 1);
  expect(lowerEdge).toBeGreaterThanOrEqual(addressBox!.y - 14);
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
    const delimiters = new Set(["，", "。", "；", "：", "！", "？", "、", "…", ",", ".", ";", ":", "!", "?"]);
    const segments: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (let cursor = 0; cursor < content.length; cursor += 1) {
      if (!delimiters.has(content[cursor]!)) continue;
      if (cursor > start) segments.push({ start, end: cursor });
      start = cursor + 1;
      while (content[start] === " ") start += 1;
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
