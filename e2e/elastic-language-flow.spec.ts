import { expect, test, type Page } from "@playwright/test";
import { fixtureUiCopy, fixtureVoiceAdmissionName } from "./matter-ui-copy";

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
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const grips = page.locator(".stretch-handle");
  const selectedCopy = page.locator(".language-split-selected-copy");
  const addressPath = page.locator('.material-address-layer[data-address-variant="actionable"] .material-address-layer__path');
  const appearance = page.locator('[data-chrome-control="appearance"]');
  await expect(grips).toHaveCount(2);
  await appearance.click({ force: true });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-theme", "light");
  expect(await gripColors(grips)).toEqual(["rgb(22, 29, 39)", "rgb(22, 29, 39)"]);
  await expect(selectedCopy).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(addressPath).toHaveCSS("fill", "rgba(22, 29, 39, 0.18)");

  await appearance.click({ force: true });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-theme", "dark");
  expect(await gripColors(grips)).toEqual(["rgb(240, 242, 243)", "rgb(240, 242, 243)"]);
  await expect(selectedCopy).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(addressPath).toHaveCSS("fill", "rgba(240, 242, 243, 0.1)");

  const neutralAddressBox = await addressPath.boundingBox();
  expect(neutralAddressBox).not.toBeNull();
  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await lower.press("End");
  await expect.poll(async () => (await addressPath.boundingBox())?.height ?? 0).toBeGreaterThan(
    neutralAddressBox!.height + 100,
  );
  const surfaceReceipt = await addressPath.evaluate((path) => {
    const projection = document.querySelector<HTMLElement>(".language-split-projection");
    const handle = document.querySelector<HTMLElement>(".stretch-handle");
    if (projection === null || handle === null) {
      throw new Error("elastic visual receipt missing");
    }
    return {
      addressFill: getComputedStyle(path).fill,
      projectionBackground: getComputedStyle(projection, "::before").backgroundColor,
      handleShadow: getComputedStyle(handle, "::after").boxShadow,
    };
  });
  expect(surfaceReceipt.addressFill).toBe("rgba(240, 242, 243, 0.1)");
  expect(surfaceReceipt.projectionBackground).toBe("rgba(0, 0, 0, 0)");
  expect(surfaceReceipt.handleShadow).toContain("4px");
});

test("native copy releases stale paint before measuring a new range", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const native = page.locator('.material-address-layer[data-address-variant="native"]');
  const nativePath = native.locator(".material-address-layer__path");
  const setRootRange = async (start: number, end: number) => page.evaluate(
    ({ endOffset, nodeId, startOffset }) => {
      const root = document.querySelector<HTMLElement>(`[data-thought-text-id="${nodeId}"]`);
      const text = root === null
        ? null
        : document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode();
      const selection = window.getSelection();
      if (!(text instanceof Text) || selection === null) throw new Error("native fixture text missing");
      const range = document.createRange();
      range.setStart(text, startOffset);
      range.setEnd(text, endOffset);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return document.querySelector(
        '.material-address-layer[data-address-variant="native"]',
      )?.hasAttribute("data-material-address-painted") ?? false;
    },
    { endOffset: end, nodeId: ROOT_ID, startOffset: start },
  );

  expect(await setRootRange(0, 6)).toBe(false);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  const firstPath = await nativePath.getAttribute("d");
  expect(firstPath).not.toBeNull();

  // selectionchange must synchronously stop the old path from suppressing the
  // browser's new range; the replacement custom path arrives on the next rAF.
  expect(await setRootRange(9, 16)).toBe(false);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  await expect.poll(() => nativePath.getAttribute("d")).not.toBe(firstPath);

  const collapsedPainted = await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    return document.querySelector(
      '.material-address-layer[data-address-variant="native"]',
    )?.hasAttribute("data-material-address-painted") ?? false;
  });
  expect(collapsedPainted).toBe(false);
  await expect(native).not.toHaveAttribute("data-material-address-painted", "true");

  await setRootRange(0, 6);
  await expect(native).toHaveAttribute("data-material-address-painted", "true");
  const crossNode = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-thought-text-id]"));
    const first = roots[0] === undefined
      ? null
      : document.createTreeWalker(roots[0], NodeFilter.SHOW_TEXT).nextNode();
    const second = roots[1] === undefined
      ? null
      : document.createTreeWalker(roots[1], NodeFilter.SHOW_TEXT).nextNode();
    const selection = window.getSelection();
    if (!(first instanceof Text) || !(second instanceof Text) || selection === null) {
      throw new Error("cross-node fixture text missing");
    }
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(second, Math.min(5, second.length));
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return {
      collapsed: selection.isCollapsed,
      painted: document.querySelector(
        '.material-address-layer[data-address-variant="native"]',
      )?.hasAttribute("data-material-address-painted") ?? false,
    };
  });
  expect(crossNode).toEqual({ collapsed: false, painted: false });
  await expect(native).not.toHaveAttribute("data-material-address-painted", "true");
});

test("one outline owns the address from neutral through both grips", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);

  // A whole-node structural selection reads as one outline, not per-row pills.
  const structural = page.locator('.material-address-layer[data-address-variant="structural"]');
  await expect(structural).toHaveAttribute("data-material-address-painted", "true");
  const structuralPath = structural.locator(".material-address-layer__path");
  const structuralD = await structuralPath.getAttribute("d");
  expect(structuralD ?? "").not.toBe("");
  expect((structuralD ?? "").match(/M/g) ?? []).toHaveLength(1);
  expect(await structuralPath.evaluate((node) => getComputedStyle(node).stroke)).not.toBe("none");
  await expect(structuralPath).toHaveCSS("stroke-width", "1px");
  expect(await structural.evaluate((node) => getComputedStyle(node).clipPath)).not.toBe("none");
  // The label pill only steps aside once that path exists.
  await expect(page.locator('.spatial-thought[data-selected="true"] .spatial-thought__label'))
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const actionable = page.locator('.material-address-layer[data-address-variant="actionable"]');
  const actionablePath = actionable.locator(".material-address-layer__path");
  await expect(actionable).toHaveAttribute("data-material-address-painted", "true");
  const neutralFill = await actionablePath.evaluate((node) => getComputedStyle(node).fill);
  const neutralD = await actionablePath.getAttribute("d");
  expect((neutralD ?? "").match(/M/g) ?? []).toHaveLength(1);
  // Painted means the single-selection fallback is released, so the two never
  // stack and no frame can show grips over an unpainted address.
  await expect(page.locator(".material-address-selection-set--fallback[data-single-address-fallback]"))
    .toBeHidden();

  const lower = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
  const upper = page.getByRole("slider", { name: "用上握点设置所选文字的展开程度" });
  for (const grip of [lower, upper]) {
    await grip.press("Home");
    await grip.press("End");
    await expect(actionable).toHaveAttribute("data-material-address-painted", "true");
    const engagedD = await actionablePath.getAttribute("d");
    expect((engagedD ?? "").match(/M/g) ?? []).toHaveLength(1);
    expect(engagedD).not.toBe(neutralD);
    // The address keeps one colour across neutral and both grips.
    expect(await actionablePath.evaluate((node) => getComputedStyle(node).fill)).toBe(neutralFill);
    // Grips stay present and keep their physical rule while the outline owns paint.
    await expect(page.locator(".stretch-handle")).toHaveCount(2);
    await grip.press("Home");
  }
});

test("a structural address settles with the narrow index transition", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);

  const path = page.locator(
    '.material-address-layer[data-address-variant="structural"] .material-address-layer__path',
  );
  const label = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  const [pathBefore, labelBefore] = await Promise.all([path.boundingBox(), label.boundingBox()]);
  expect(pathBefore).not.toBeNull();
  expect(labelBefore).not.toBeNull();
  const inlineOffset = pathBefore!.x - labelBefore!.x;

  await page.locator(".material-files-toggle").click({ force: true });
  await expect(page.locator(".matter-material-plane"))
    .toHaveAttribute("data-index-disclosure", "open");
  await expect.poll(async () => (await label.boundingBox())?.x ?? 0)
    .toBeGreaterThan(labelBefore!.x + 100);
  await expect.poll(async () => {
    const [nextPath, nextLabel] = await Promise.all([path.boundingBox(), label.boundingBox()]);
    if (nextPath === null || nextLabel === null) return Number.POSITIVE_INFINITY;
    return Math.abs((nextPath.x - nextLabel.x) - inlineOffset);
  }).toBeLessThan(2);
});

test("forced colors keeps selected text readable above a system outline", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);

  const path = page.locator('.material-address-layer[data-address-variant="structural"] .material-address-layer__path');
  const label = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await expect(path).toHaveCSS("fill", "rgba(0, 0, 0, 0)");
  expect(await path.evaluate((node) => getComputedStyle(node).stroke)).not.toBe("none");
  expect(await label.evaluate((node) => getComputedStyle(node).color)).not.toBe("rgba(0, 0, 0, 0)");
});

test("the upper moving partition reflows in the full column and never splits a line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  // A segment that starts mid-line, so the prefix and the moving partition
  // share a canonical line and the split has to be real.
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 1));

  const projection = page.locator(".language-split-projection");
  const witness = projection.locator(".language-split-block--before");
  const moving = projection.locator(".language-split-moving");
  const upper = page.getByRole("slider", { name: "用上握点设置所选文字的展开程度" });

  const witnessBefore = await witness.evaluate((node) =>
    [...node.getClientRects()].map((rect) => [Math.round(rect.x), Math.round(rect.y)]));

  await upper.press("End");
  await expect(projection).toHaveAttribute("data-stretch-handle", "top");
  const rendererHandoff = await projection.evaluate((node) => {
    const canonical = node.parentElement?.querySelector<HTMLElement>(".spatial-thought__text");
    const tail = node.querySelector<HTMLElement>(".language-split-witness-tail");
    return {
      canonicalColor: canonical === undefined || canonical === null
        ? null
        : getComputedStyle(canonical).color,
      tailVisibility: tail === null ? null : getComputedStyle(tail).visibility,
    };
  });
  expect(rendererHandoff).toEqual({
    canonicalColor: "rgba(0, 0, 0, 0)",
    tailVisibility: "hidden",
  });

  const geometry = await projection.evaluate((node) => {
    const column = node.closest(".spatial-thought")!
      .querySelector<HTMLElement>(".spatial-thought__text")!.getBoundingClientRect();
    const slot = node.querySelector<HTMLElement>(".language-split-slot")!.getBoundingClientRect();
    const movingBox = node.querySelector<HTMLElement>(".language-split-moving")!.getBoundingClientRect();
    const before = node.querySelector<HTMLElement>(".language-split-block--before")!;
    const lastPrefixLine = [...before.getClientRects()].at(-1)!;
    const lines = [...node.querySelectorAll<HTMLElement>(".language-split-moving span")]
      .flatMap((span) => [...span.getClientRects()])
      .map((rect) => ({ bottom: rect.bottom, top: rect.top, x: rect.x }));
    return {
      column: { left: column.left, right: column.right },
      lines,
      moving: { left: movingBox.left, right: movingBox.right },
      prefixRight: lastPrefixLine.right,
      slot: { bottom: slot.bottom, top: slot.top },
    };
  });

  // The moving partition owns the whole column, so its first line starts at the
  // column's logical start instead of trailing the prefix's last line.
  expect(Math.round(geometry.moving.left)).toBe(Math.round(geometry.column.left));
  expect(Math.round(geometry.moving.right)).toBe(Math.round(geometry.column.right));
  expect(Math.abs(geometry.lines[0]!.x - geometry.prefixRight)).toBeGreaterThan(24);

  // Nothing is painted across the opened gap.
  for (const line of geometry.lines) {
    expect(line.bottom <= geometry.slot.top + 1 || line.top >= geometry.slot.bottom - 1).toBe(true);
  }

  // The witness is the fixed partition and may not move at all.
  const witnessAfter = await witness.evaluate((node) =>
    [...node.getClientRects()].map((rect) => [Math.round(rect.x), Math.round(rect.y)]));
  expect(witnessAfter).toEqual(witnessBefore);

  // Degree changes the slot, never the moving partition's line breaking.
  const linesAt = async () => moving.evaluate((node) =>
    [...node.querySelectorAll<HTMLElement>("span")]
      .flatMap((span) => [...span.getClientRects()])
      .map((rect) => [Math.round(rect.x), Math.round(rect.width)]));
  const full = await linesAt();
  await upper.press("Home");
  await upper.press("ArrowUp");
  await expect(upper).toHaveAttribute("aria-valuenow", "0.1");
  expect(await linesAt()).toEqual(full);
});

test("the upper grip keeps its upper boundary fixed and pushes selected language down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
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
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
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
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
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
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
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

test("Voice recording suspends selected-language grips while both stop controls remain reachable", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  await expect(page.locator(".stretch-handle")).toHaveCount(2);

  // Both controls deliberately finish the same recording: the rail preserves
  // the fixed instrument, while local feedback keeps the live state reachable.
  const toolRail = page.locator(".tool-rail");
  const voice = toolRail.getByRole("button", { name: fixtureVoiceAdmissionName });
  await voice.click();
  await expect(toolRail.getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", {
    name: fixtureUiCopy.voiceTool.stopRecording,
    exact: true,
  })).toHaveCount(2);
  await expect(page.locator("main.matter-shell"))
    .toHaveAttribute("data-interaction-pending", "true");
  await expect(page.locator("main.matter-shell"))
    .not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.locator(".stretch-handle")).toHaveCount(0);
  await page.keyboard.press("Enter");
  expect(turnRequests).toBe(0);
  // The admission-flow receipt owns Stop, transcription, commit, and Undo.
  // Ending an uncontrolled fake-device recording here would make this Elastic
  // boundary depend on whether a 250 ms MediaRecorder chunk happened to land.
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
  await selectRoot(page);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
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
  // The transform presentation is intentionally short-lived. Start observing
  // before the gesture so a loaded browser cannot complete the durable change,
  // then let this test begin looking after the reveal has already retired.
  // This still requires the perceptible multi-group arrival for pointer input.
  const revealGroupCount = input === "keyboard"
    ? null
    : page.locator(".transform-text").getAttribute("data-transform-reveal-groups");

  if (input === "drag") {
    const box = await grip.boundingBox();
    if (box === null) throw new Error("upper stretch grip missing");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Four pixels are the mouse deadzone; 64px of physical travel therefore
    // commits the fixture's exact 0.5 degree rather than an adjacent length.
    await page.mouse.move(x, y - 64, { steps: 5 });
    await page.mouse.up();
  } else if (input === "touch") {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const gripBox = await grip.boundingBox();
    if (gripBox === null) throw new Error("touch lower grip missing");
    expect(gripBox.width).toBeGreaterThanOrEqual(48);
    expect(gripBox.height).toBeGreaterThanOrEqual(48);
    // Touch owns an eight-pixel deadzone, so 68px reaches the same 0.5 degree.
    await dragByTouch(page, grip, 68);
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
    const groupCount = Number(await revealGroupCount);
    expect(groupCount).toBeGreaterThanOrEqual(2);
    expect(groupCount).toBeLessThanOrEqual(4);
  }
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
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
  const address = page.locator(
    '.material-address-layer[data-address-variant="actionable"]',
  );
  await expect(address).toHaveAttribute("data-material-address-painted", "true");
  await expect(address.locator(".material-address-layer__path")).toBeVisible();
  await expect(page.locator(
    ".material-address-selection-set--fallback[data-single-address-fallback]",
  )).toBeHidden();
}

async function expectUpperGripAtSelection(
  page: Page,
  grip: ReturnType<Page["locator"]>,
): Promise<void> {
  const [gripBox, addressBox] = await Promise.all([
    grip.boundingBox(),
    page.locator(
      '.material-address-layer[data-address-variant="actionable"] .material-address-layer__path',
    ).boundingBox(),
  ]);
  expect(gripBox).not.toBeNull();
  expect(addressBox).not.toBeNull();
  const lowerEdge = gripBox!.y + gripBox!.height;
  // The invisible hit target sits just above the painted address; the visible
  // 22x2 grip grows from that edge without becoming part of its geometry.
  expect(Math.abs(addressBox!.y - lowerEdge)).toBeLessThanOrEqual(18);
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

async function selectRoot(page: Page): Promise<void> {
  const rootText = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await rootText.click();
  await expect(rootText).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
  // Canvas geometry and lasso target snapshots settle at the rendering edge.
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
