import { expect, test, type Page } from "@playwright/test";

const ROOT_ID = "thought_fixture_root";
const SOURCE = "我们怀念的也许不是一个真实存在过的过去";
const EXPANDED = "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去";

test("Elastic Language commits one laptop drag, then Undo, Redo, and reload stay exact", async ({ page }) => {
  await runElasticReceipt(page, "drag");
});

test("Elastic Language keeps its keyboard alternative and reduced-motion arrival atomic", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await runElasticReceipt(page, "keyboard");
  await expect(page.locator(".transform-text")).toHaveCount(0);
});

test("both literal grips stay visible in the paper's light and dark appearances", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const grips = page.locator(".stretch-handle");
  const selectedCopy = page.locator(".language-split-selected-copy");
  const appearance = page.locator('[data-chrome-control="appearance"]');
  await expect(grips).toHaveCount(2);
  await appearance.click({ force: true });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-theme", "light");
  expect(await gripColors(grips)).toEqual(["rgb(22, 29, 39)", "rgb(22, 29, 39)"]);
  await expect(selectedCopy).toHaveCSS("background-color", "rgba(22, 29, 39, 0.1)");

  await appearance.click({ force: true });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-theme", "dark");
  expect(await gripColors(grips)).toEqual(["rgb(240, 242, 243)", "rgb(240, 242, 243)"]);
  await expect(selectedCopy).toHaveCSS("background-color", "rgba(240, 242, 243, 0.08)");

  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await lower.press("End");
  const surfaceReceipt = await page.locator(".elastic-preview").evaluate((preview) => {
    const projection = document.querySelector<HTMLElement>(".language-split-projection");
    const pocket = preview.querySelector<HTMLElement>(".language-pocket");
    const handle = preview.querySelector<HTMLElement>(".stretch-handle");
    if (projection === null || pocket === null || handle === null) {
      throw new Error("elastic visual receipt missing");
    }
    const pocketColor = getComputedStyle(pocket).backgroundColor;
    const pocketAlpha = Number(pocketColor.match(/[\d.]+\)$/)?.[0].slice(0, -1) ?? "1");
    return {
      pocketAlpha,
      projectionBackground: getComputedStyle(projection, "::before").backgroundColor,
      handleShadow: getComputedStyle(handle, "::after").boxShadow,
    };
  });
  expect(surfaceReceipt.pocketAlpha).toBeLessThanOrEqual(.04);
  expect(surfaceReceipt.projectionBackground).toBe("rgba(0, 0, 0, 0)");
  expect(surfaceReceipt.handleShadow).toContain("4px");
});

test("the upper grip keeps its upper boundary fixed and pushes selected language down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 1));

  const upper = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const beforeCopy = page.locator(".language-split-before-copy");
  const selectedCopy = page.locator(".language-split-block--selected");
  const [before, selected, lowerBefore] = await Promise.all([
    beforeCopy.boundingBox(),
    selectedCopy.boundingBox(),
    lower.boundingBox(),
  ]);
  if (before === null || selected === null || lowerBefore === null) {
    throw new Error("upper projection receipt missing");
  }

  await upper.press("End");
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-stretch-handle", "top");
  const [beforeAfter, selectedAfter, lowerAfter] = await Promise.all([
    beforeCopy.boundingBox(),
    selectedCopy.boundingBox(),
    lower.boundingBox(),
  ]);
  if (beforeAfter === null || selectedAfter === null || lowerAfter === null) {
    throw new Error("expanded upper projection receipt missing");
  }
  expect(Math.abs(beforeAfter.y - before.y)).toBeLessThanOrEqual(1);
  expect(selectedAfter.y).toBeGreaterThan(selected.y + 120);
  expect(lowerAfter.y).toBeGreaterThan(lowerBefore.y + 120);
  await expect(upper).toHaveAttribute("aria-valuenow", "1");
  await expect(lower).toHaveAttribute("aria-valuenow", "1");
});

test("the upper grip on the opening segment pushes every lower material row down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const selected = page.locator(".language-split-block--selected");
  const upper = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const sourceOwner = page.locator(`[data-layout-node-id="${ROOT_ID}"]`);
  const [selectedBefore, sourceBefore, rowsBefore] = await Promise.all([
    selected.boundingBox(),
    sourceOwner.boundingBox(),
    layoutRowTops(page),
  ]);
  if (selectedBefore === null || sourceBefore === null) {
    throw new Error("opening-segment projection receipt is missing");
  }

  await upper.press("End");
  await expect.poll(async () => (await selected.boundingBox())?.y ?? Number.NEGATIVE_INFINITY)
    .toBeGreaterThan(selectedBefore.y + 120);
  const [sourceAfter, rowsAfter] = await Promise.all([
    sourceOwner.boundingBox(),
    layoutRowTops(page),
  ]);
  if (sourceAfter === null) throw new Error("source owner disappeared during expansion");
  expect(Math.abs(sourceAfter.y - sourceBefore.y)).toBeLessThanOrEqual(1);

  for (const [nodeId, beforeY] of Object.entries(rowsBefore)) {
    const afterY = rowsAfter[nodeId];
    if (afterY === undefined) throw new Error(`layout row ${nodeId} disappeared`);
    if (beforeY > sourceBefore.y + 1) {
      expect(afterY).toBeGreaterThan(beforeY + 120);
    } else {
      expect(Math.abs(afterY - beforeY)).toBeLessThanOrEqual(1);
    }
  }
});

test("Elastic Language cancels below-threshold and late turns without changing material", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    const envelope = route.request().postDataJSON() as {
      protocolVersion: "0.2";
      requestVersion: "transform/2";
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await new Promise((resolve) => setTimeout(resolve, 450));
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
          text: EXPANDED,
          intent: "expand",
        },
        presentation: { motionHint: "grow" },
      }),
    }).catch(() => undefined);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const upperGrip = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const box = await grip.boundingBox();
  if (box === null) throw new Error("lower stretch grip missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 12);
  await page.mouse.up();
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(upperGrip).toHaveAttribute("aria-valuenow", "0");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  expect(turnRequests).toBe(0);

  await grip.focus();
  await page.keyboard.press("PageUp");
  await page.keyboard.press("Enter");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await page.waitForTimeout(550);
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
});

test("Elastic Language provider failure stays quiet and leaves material unchanged", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
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
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await grip.focus();
  await page.keyboard.press("PageUp");
  await page.keyboard.press("Enter");

  await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
  await expect(page.locator(".matter-guidance__next")).not.toHaveText("暂时无法展开。");
  await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
  await expectLowerSpaceBeforeSuffix(page);
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
  await expect(page.locator("main.matter-shell"))
    .not.toHaveAttribute("data-transform-phase", "requesting");
  await page.keyboard.press("Enter");
  await expect.poll(() => turnRequests).toBe(2);
});

test("Voice admission suspends both selected-language grips and re-arms them after cancel", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  await expect(page.locator(".stretch-handle")).toHaveCount(2);

  const voice = page.getByRole("button", {
    name: /Record a (?:top-level thought|thought below the selected material)/,
  });
  await voice.click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await expect(page.locator("main.matter-shell"))
    .toHaveAttribute("data-interaction-pending", "true");
  await expect(page.locator("main.matter-shell"))
    .not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.locator(".stretch-handle")).toHaveCount(0);
  await page.keyboard.press("Enter");
  expect(turnRequests).toBe(0);

  await page.locator(".admission-feedback")
    .getByRole("button", { name: "取消录音", exact: true })
    .click();
  await expect(page.locator("main.matter-shell"))
    .not.toHaveAttribute("data-interaction-pending", "true");
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Circle-select language", exact: true })).toBeVisible();
  expect(turnRequests).toBe(0);
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("Elastic Language keeps both grips touch-sized without a hidden third control", async ({ page }) => {
    await runElasticReceipt(page, "touch");
  });
});

async function runElasticReceipt(
  page: Page,
  input: "drag" | "touch" | "keyboard",
): Promise<void> {
  const browserErrors: string[] = [];
  let turnRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });

  if (input !== "touch") await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, input === "touch");
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await expect(text).toContainText(SOURCE);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const lowerGrip = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const upperGrip = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const grip = input === "drag" ? upperGrip : lowerGrip;
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(upperGrip).toHaveAttribute("aria-valuenow", "0");
  await expect(lowerGrip).toHaveAttribute("aria-valuenow", "0");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".stretch-amount-rail")).toHaveCount(0);
  await expectUpperGripAtSelection(page, upperGrip);
  await expectNeutralSelection(page);

  if (input === "drag") {
    const box = await grip.boundingBox();
    if (box === null) throw new Error("upper stretch grip missing");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 5 });
    await page.mouse.up();
  } else if (input === "touch") {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const gripBox = await grip.boundingBox();
    if (gripBox === null) throw new Error("touch lower grip missing");
    expect(gripBox.width).toBeGreaterThanOrEqual(48);
    expect(gripBox.height).toBeGreaterThanOrEqual(48);
    await dragByTouch(page, grip, 60);
  } else {
    await grip.focus();
    await page.keyboard.press("PageUp");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    expect(turnRequests).toBe(0);
    await page.keyboard.press("Enter");
  }

  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  await expect(page.locator(".stretch-status-marker")).toHaveCount(0);
  await expect(page.locator(".stretch-handle__ratio")).toHaveCount(0);
  if (input === "drag") {
    await expect(page.locator(".language-split-projection"))
      .toHaveAttribute("data-stretch-handle", "top");
  } else {
    await expectLowerSpaceBeforeSuffix(page);
  }
  await expect(lowerGrip).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  await expect(text).toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
  if (input === "keyboard") {
    const animations = await page.locator(".transform-text__group").evaluateAll((groups) =>
      groups.map((group) => getComputedStyle(group).animationName),
    );
    expect(animations.every((name) => name === "none")).toBe(true);
  } else {
    const groupCount = Number(await page.locator(".transform-text").getAttribute("data-transform-reveal-groups"));
    expect(groupCount).toBeGreaterThanOrEqual(2);
    expect(groupCount).toBeLessThanOrEqual(4);
  }
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.getByRole("button", { name: "Undo last change", exact: true }).click();
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  await expect(page.locator(".transform-text")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+Z");
  await expect(text).toContainText(EXPANDED);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toContainText(EXPANDED);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  expect(turnRequests).toBe(1);
  expect(browserErrors).toEqual([]);
}

async function expectLowerSpaceBeforeSuffix(page: Page): Promise<void> {
  const suffix = page.locator(".language-split-block--after");
  const selection = page.locator(".language-split-block--selected");
  await expect(page.locator(".language-split-projection")).toHaveAttribute(
    "data-stretch-handle",
    "bottom",
  );
  const [selectionBox, suffixBox] = await Promise.all([
    selection.boundingBox(),
    suffix.boundingBox(),
  ]);
  expect(selectionBox).not.toBeNull();
  expect(suffixBox).not.toBeNull();
  expect(suffixBox!.y).toBeGreaterThan(selectionBox!.y + selectionBox!.height + 20);
}

async function expectNeutralSelection(page: Page): Promise<void> {
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-preview-mode", "neutral");
  await expect(page.locator(".lasso-selection-fragment").first()).toBeVisible();
}

async function expectUpperGripAtSelection(
  page: Page,
  grip: ReturnType<Page["locator"]>,
): Promise<void> {
  const [gripBox, firstFragment] = await Promise.all([
    grip.boundingBox(),
    page.locator(".lasso-selection-fragment").first().boundingBox(),
  ]);
  expect(gripBox).not.toBeNull();
  expect(firstFragment).not.toBeNull();
  const lowerEdge = gripBox!.y + gripBox!.height;
  expect(lowerEdge).toBeLessThanOrEqual(firstFragment!.y + 1);
  expect(lowerEdge).toBeGreaterThanOrEqual(firstFragment!.y - 14);
}

async function gripColors(grips: ReturnType<Page["locator"]>): Promise<readonly string[]> {
  return grips.evaluateAll((controls) => controls.map((control) =>
    getComputedStyle(control).color,
  ));
}

async function layoutRowTops(page: Page): Promise<Readonly<Record<string, number>>> {
  return page.locator("[data-layout-node-id]").evaluateAll((elements) =>
    Object.fromEntries(elements.flatMap((element) => {
      const nodeId = element.getAttribute("data-layout-node-id");
      return nodeId === null ? [] : [[nodeId, element.getBoundingClientRect().y]];
    })),
  );
}

async function dragByTouch(
  page: Page,
  target: ReturnType<Page["locator"]>,
  deltaY: number,
): Promise<void> {
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

async function focusRoot(page: Page, narrow: boolean): Promise<void> {
  const rootText = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  if (narrow) await rootText.click();
  else await rootText.hover();
  await page.getByRole("toolbar", { name: "Thought actions" })
    .getByRole("button", { name: "Focus this thought" })
    .click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
  await expect(page.locator(`[data-thought-id="${ROOT_ID}"]`))
    .toHaveAttribute("data-focused", "true");
  // Focus publishes navigation before its render-edge measurement cache and
  // Lasso target snapshot settle. Two frames cross that ownership boundary
  // without a fixed delay or a production-only state hook.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function segmentProbeRect(
  text: ReturnType<Page["locator"]>,
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
