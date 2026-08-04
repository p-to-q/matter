import { expect, test, type Page } from "@playwright/test";

const rootId = "thought_fixture_root";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`lasso addresses wrapped language at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const lasso = page.getByRole("button", { name: "Circle-select language", exact: true });
    await lasso.click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    await expect(page.getByRole("button", { name: "Move through canvas", exact: true })).toBeDisabled();
    const cameraBeforeWheel = await page.locator("main.matter-shell").evaluate((main) => ({
      x: main.getAttribute("data-viewport-x"),
      y: main.getAttribute("data-viewport-y"),
      zoom: main.getAttribute("data-viewport-zoom"),
    }));
    await page.locator("main.matter-shell").dispatchEvent("wheel", {
      clientX: viewport.width / 2,
      clientY: viewport.height / 2,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -160,
    });
    await expect.poll(() => page.locator("main.matter-shell").evaluate((main) => ({
      x: main.getAttribute("data-viewport-x"),
      y: main.getAttribute("data-viewport-y"),
      zoom: main.getAttribute("data-viewport-zoom"),
    }))).toEqual(cameraBeforeWheel);

    const text = page.locator(`[data-thought-text-id="${rootId}"]`);
    const fragment = await firstSegmentRect(page, text);
    await drawEarlyReleaseLoop(page, fragment);
    await expect(page.locator(".lasso-layer[data-selected=true]")).toBeVisible();
    await expect(page.locator(".lasso-selection-fragment")).not.toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Selected language:");
    const gripSkin = await page.locator(".stretch-handle").evaluateAll((grips) =>
      grips.map((grip) => {
        const style = getComputedStyle(grip, "::after");
        return { width: style.width, height: style.height, color: style.backgroundColor };
      }),
    );
    expect(gripSkin).toEqual([
      { width: "22px", height: "2px", color: "rgb(189, 88, 71)" },
      { width: "22px", height: "2px", color: "rgb(189, 88, 71)" },
    ]);
    const sourceLayout = await sourceLayoutReceipt(page, text);
    const topHandle = page.getByRole("slider", { name: "Expand selected language from its top edge" });
    const handle = page.getByRole("slider", { name: "Expand selected language from its bottom edge" });
    await expect(topHandle).toHaveAttribute("aria-valuenow", "0");
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
    const firstPink = await page.locator(".lasso-selection-fragment").first().boundingBox();
    const lastPink = await page.locator(".lasso-selection-fragment").last().boundingBox();
    const topHandleInitial = await topHandle.boundingBox();
    const bottomHandleInitial = await handle.boundingBox();
    if (firstPink === null || lastPink === null || topHandleInitial === null || bottomHandleInitial === null) {
      throw new Error("selection-aligned handles missing");
    }
    expect(Math.abs(
      topHandleInitial.x + topHandleInitial.width / 2 - (firstPink.x + firstPink.width / 2),
    )).toBeLessThanOrEqual(3.1);
    expect(Math.abs(
      bottomHandleInitial.x + bottomHandleInitial.width / 2 - (lastPink.x + lastPink.width / 2),
    )).toBeLessThanOrEqual(3.1);
    // Both controls extend away from the selected language, so even a
    // single-line selection has deterministic pointer ownership.
    expect(topHandleInitial.y + topHandleInitial.height)
      .toBeLessThanOrEqual(bottomHandleInitial.y);
    await page.evaluate(() => {
      const original = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function failCaptureOnce(pointerId) {
        Element.prototype.setPointerCapture = original;
        void pointerId;
        throw new DOMException("synthetic detached target", "InvalidStateError");
      };
    });
    await page.mouse.move(
      topHandleInitial.x + topHandleInitial.width / 2,
      topHandleInitial.y + topHandleInitial.height / 2,
    );
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-stretching", "true");
    await expect(topHandle).toHaveAttribute("aria-valuenow", "0");
    const topHandleAfterRecovery = await topHandle.boundingBox();
    if (topHandleAfterRecovery === null) throw new Error("recovered top handle missing");
    await page.mouse.move(
      topHandleAfterRecovery.x + topHandleAfterRecovery.width / 2,
      topHandleAfterRecovery.y + topHandleAfterRecovery.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      topHandleAfterRecovery.x + topHandleAfterRecovery.width / 2,
      topHandleAfterRecovery.y + topHandleAfterRecovery.height / 2 - 60,
      { steps: 5 },
    );
    await expect(page.locator(".elastic-preview")).toHaveAttribute("data-stretch-handle", "top");
    await expect(page.locator(".lasso-selection-fragment").first()).toHaveCSS("opacity", "0");
    await expect(page.locator(".lasso-selection-fragment").last()).toHaveCSS("opacity", "0");
    await expect(page.locator(".language-split-projection")).toHaveAttribute("data-preview-mode", "expand");
    await page.mouse.up();
    await expect(topHandle).toHaveAttribute("aria-valuenow", "0.5");
    await topHandle.press("Home");
    await expect(topHandle).toHaveAttribute("aria-valuenow", "0");
    const handleBox = await handle.boundingBox();
    if (handleBox === null) throw new Error("stretch handle missing");
    const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 2);
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "0");

    const secondHandleBox = await handle.boundingBox();
    if (secondHandleBox === null) throw new Error("settled stretch handle missing");
    const secondStart = {
      x: secondHandleBox.x + secondHandleBox.width / 2,
      y: secondHandleBox.y + secondHandleBox.height / 2,
    };
    await page.mouse.move(secondStart.x, secondStart.y);
    await page.mouse.down();
    await page.mouse.move(secondStart.x, secondStart.y + 60, { steps: 5 });
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-stretching", "true");
    await expect(page.locator(".elastic-preview")).toHaveAttribute("data-preview-mode", "expand");
    await expect(page.locator(".language-split-slot")).toBeVisible();
    const surface = await page.locator(".language-split-slot").boundingBox();
    const movingHandle = await handle.boundingBox();
    const lastFragment = await page.locator(".lasso-selection-fragment[data-last-fragment=true]").boundingBox();
    if (surface === null || movingHandle === null || lastFragment === null) {
      throw new Error("continuous material geometry missing");
    }
    expect(surface.height).toBeGreaterThan(0);
    expect(movingHandle.y).toBeGreaterThan(lastFragment.y);
    expect(await sourceLayoutReceipt(page, text)).toEqual(sourceLayout);
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "0.5");
    const settledLayout = await sourceLayoutReceipt(page, text);
    expect(sourceTextReceipt(settledLayout)).toEqual(sourceTextReceipt(sourceLayout));
    expect(settledLayout.node).toEqual(sourceLayout.node);
    expect(settledLayout.canvas.height).toBeGreaterThanOrEqual(sourceLayout.canvas.height);

    await handle.focus();
    await page.keyboard.press("ArrowDown");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.6");
    await page.keyboard.press("ArrowDown");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.7");
    await page.keyboard.press("PageUp");
    await expect(handle).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("PageDown");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.5");
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.9");
    await page.keyboard.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "1");
    await handle.press("Home");
    await handle.press("PageUp");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.5");

    await handle.press("End");

    const visibleViewport = await page.evaluate(() => {
      const visual = window.visualViewport;
      return visual === null
        ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        : {
            left: visual.offsetLeft,
            top: visual.offsetTop,
            right: visual.offsetLeft + visual.width,
            bottom: visual.offsetTop + visual.height,
          };
    });
    const boundedHandle = await handle.boundingBox();
    const boundedTopHandle = await topHandle.boundingBox();
    if (boundedHandle === null || boundedTopHandle === null) {
      throw new Error("bounded handles missing");
    }
    for (const bounded of [boundedTopHandle, boundedHandle]) {
      expect(bounded.x).toBeGreaterThanOrEqual(visibleViewport.left);
      expect(bounded.y).toBeGreaterThanOrEqual(visibleViewport.top);
      expect(bounded.x + bounded.width).toBeLessThanOrEqual(visibleViewport.right);
      expect(bounded.y + bounded.height).toBeLessThanOrEqual(visibleViewport.bottom);
    }

    const settledBeforeInvalidation = await handle.getAttribute("aria-valuenow");
    for (const eventSource of ["window", "visualViewport", "fonts"] as const) {
      const activeHandleBox = await handle.boundingBox();
      if (activeHandleBox === null) throw new Error(`stretch handle missing before ${eventSource}`);
      await page.mouse.move(
        activeHandleBox.x + activeHandleBox.width / 2,
        activeHandleBox.y + activeHandleBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(activeHandleBox.x + activeHandleBox.width / 2, activeHandleBox.y + 45);
      await expect(page.locator("main.matter-shell")).toHaveAttribute("data-stretching", "true");
      await page.evaluate((source) => {
        if (source === "window") window.dispatchEvent(new Event("resize"));
        else if (source === "visualViewport") window.visualViewport?.dispatchEvent(new Event("resize"));
        else document.fonts.dispatchEvent(new Event("loadingdone"));
      }, eventSource);
      await page.mouse.up();
      await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-stretching", "true");
      await expect(handle).toHaveAttribute("aria-valuenow", settledBeforeInvalidation!);
      await expect(handle).toBeVisible();
    }

    const committedDegree = await handle.getAttribute("aria-valuenow");
    const movedHandleBox = await handle.boundingBox();
    if (movedHandleBox === null) throw new Error("moved stretch handle missing");
    await page.mouse.move(movedHandleBox.x + movedHandleBox.width / 2, movedHandleBox.y + movedHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 105, { steps: 3 });
    await handle.dispatchEvent("pointercancel", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", committedDegree!);
    const selected = await page.getByRole("status").textContent();
    expect(selected).toContain("Selected language:");

    const selectionBeforeCancel = selected;
    await page.mouse.move(fragment.x - 10, fragment.y - 10);
    await page.mouse.down();
    await page.mouse.move(fragment.x + 5, fragment.y + 5);
    await page.locator("main.matter-shell").dispatchEvent("pointercancel", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    // Synthetic pointercancel does not release Playwright's physical mouse.
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText(selectionBeforeCancel!);

    await page.mouse.move(fragment.x - 12, fragment.y - 12);
    await page.mouse.down();
    await page.mouse.move(fragment.x + 12, fragment.y + 12, { steps: 3 });
    await page.setViewportSize({ width: viewport.width, height: viewport.height - 24 });
    await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", "");
    await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", "");
    await page.mouse.up();

    await expect(page.locator(".lasso-selection-fragment")).not.toHaveCount(0);
    await page.getByRole("button", { name: "Leave language selection", exact: true }).click();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
    expect(browserErrors).toEqual([]);
  });

  test(`lasso shows closure only for a releasable selection at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
    const fragment = await firstSegmentRect(page, page.locator(`[data-thought-text-id="${rootId}"]`));

    const empty = { x: viewport.width - 72, y: viewport.height - 116, width: 44, height: 36 };
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + empty.width, empty.y, { steps: 3 });
    await page.mouse.move(empty.x + empty.width, empty.y + empty.height, { steps: 3 });
    await page.mouse.move(empty.x, empty.y + empty.height, { steps: 3 });
    await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", / Q /);
    await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", "");
    await page.mouse.up();
    await expect(page.locator(".lasso-layer[data-selected=true]")).toHaveCount(0);

    const margin = 9;
    await page.mouse.move(fragment.x - margin, fragment.y - margin);
    await page.mouse.down();
    await page.mouse.move(fragment.x + fragment.width + margin, fragment.y - margin, { steps: 3 });
    await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", "");
    await expect(page.locator(".lasso-ink__trace")).toHaveCSS("stroke-width", "2px");
    await page.mouse.move(fragment.x + fragment.width + margin, fragment.y + fragment.height + margin, { steps: 3 });
    await page.mouse.move(fragment.x - margin, fragment.y + fragment.height + margin, { steps: 3 });
    await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", / Q /);
    await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", / L /);
    await page.locator("main.matter-shell").dispatchEvent("pointercancel", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    await page.mouse.up();
    await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", "");
    await expect(page.locator(".lasso-layer[data-selected=true]")).toHaveCount(0);
  });

  test(`lasso hint stays at the lower-left at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
    const hint = page.getByText("Draw around a phrase", { exact: true });
    const rect = await hint.boundingBox();
    if (rect === null) throw new Error("lasso hint missing");
    expect(rect.x).toBeLessThan(viewport.width * 0.25);
    expect(rect.y).toBeGreaterThan(viewport.height * 0.72);
    expect(rect.x).toBeGreaterThanOrEqual(16);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
  });

  test(`middle language becomes three centered flow blocks at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await page.getByRole("button", { name: "Apply v3 fixture version", exact: true }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-tree-revision", "2");
    await page.getByRole("button", { name: "Circle-select language", exact: true }).click();

    const text = page.locator(`[data-thought-text-id="${rootId}"]`);
    const middle = await segmentProbeRect(text, 1);
    await drawEarlyReleaseLoop(page, middle);
    await expect(page.getByRole("status")).toContainText("Selected language: 而是它在今天仍然保留的一点余地");

    const before = page.locator(".language-split-before-copy");
    const selected = page.locator(".language-split-block--selected");
    const after = page.locator(".language-split-block--after");
    await expect(before).toHaveCount(1);
    await expect(selected).toHaveCount(1);
    await expect(after).toHaveCount(1);
    const sourceBefore = await sourceLayoutReceipt(page, text);
    const natural = await projectionReceipt(page);
    const sourceSuffixTop = await sourceRangeTop(text, "让另一种生活");
    expect(natural.afterGlyphTop).toBeCloseTo(sourceSuffixTop, 1);
    const sourceGlyphsBefore = await sourceGlyphReceipt(text, 0, "：");

    const bottom = page.getByRole("slider", { name: "Expand selected language from its bottom edge" });
    await bottom.press("End");
    await expect(bottom).toHaveAttribute("aria-valuenow", "1");
    const expanded = await projectionReceipt(page);
    const sourceGlyphsExpanded = await sourceGlyphReceipt(text, 0, "：");
    expect(Math.abs(expanded.before.centerX - expanded.columnCenterX)).toBeLessThanOrEqual(1);
    expect(Math.abs(expanded.selected.centerX - expanded.columnCenterX)).toBeLessThanOrEqual(1);
    expect(Math.abs(expanded.after.centerX - expanded.columnCenterX)).toBeLessThanOrEqual(1);
    expect(expanded.before.top).toBeCloseTo(natural.before.top, 1);
    expect(expanded.selected.top).toBeCloseTo(natural.selected.top, 1);
    expect(expanded.afterGlyphTop - natural.afterGlyphTop).toBeCloseTo(expanded.slot.height, 1);
    expect(expanded.slot.height).toBeGreaterThan(100);
    expect(sourceGlyphsExpanded).toEqual(sourceGlyphsBefore);
    const sourceAfter = await sourceLayoutReceipt(page, text);
    expect(sourceTextReceipt(sourceAfter)).toEqual(sourceTextReceipt(sourceBefore));
    expect(sourceAfter.node).toEqual(sourceBefore.node);
    expect(sourceAfter.canvas.height).toBeGreaterThan(sourceBefore.canvas.height);

    await bottom.press("Home");
    const top = page.getByRole("slider", { name: "Expand selected language from its top edge" });
    const neutralAgain = await projectionReceipt(page);
    await top.press("End");
    await expect(top).toHaveAttribute("aria-valuenow", "1");
    const upward = await projectionReceipt(page);
    expect(upward.before.top).toBeCloseTo(neutralAgain.before.top, 1);
    expect(upward.selected.top).toBeCloseTo(neutralAgain.selected.top, 1);
    expect(upward.afterGlyphTop - neutralAgain.afterGlyphTop).toBeCloseTo(upward.slot.height, 1);
  });
}

async function firstSegmentRect(page: Page, text: ReturnType<Page["locator"]>) {
  return segmentRect(page, text, 0);
}

async function segmentRect(
  page: Page,
  text: ReturnType<Page["locator"]>,
  segmentIndex: number,
) {
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
    const rects = Array.from(range.getClientRects());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, segmentIndex);
}

async function segmentProbeRect(
  text: ReturnType<Page["locator"]>,
  segmentIndex: number,
) {
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
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // The semantic target uses the fragment center. A compact loop around one
    // center proves that a wrapped middle segment can be addressed without
    // accidentally enclosing its neighbours.
    return { x: centerX - 2, y: centerY - 2, width: 4, height: 4 };
  }, segmentIndex);
}

async function sourceLayoutReceipt(page: Page, text: ReturnType<Page["locator"]>) {
  return text.evaluate((element) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const own = element.getBoundingClientRect();
    const layoutNode = element.closest<HTMLElement>("[data-layout-node-id]");
    const canvas = element.closest<HTMLElement>(".matter-canvas");
    if (layoutNode === null || canvas === null) throw new Error("layout receipt roots missing");
    const node = layoutNode.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 100) / 100;
    const box = (rect: DOMRect) => ({
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    });
    return {
      text: box(own),
      node: box(node),
      canvas: box(canvasRect),
      rangeRects: Array.from(range.getClientRects(), box),
      textContent: textNode.data,
      childNodes: element.childNodes.length,
    };
  });
}

function sourceTextReceipt(receipt: Awaited<ReturnType<typeof sourceLayoutReceipt>>) {
  return {
    text: receipt.text,
    rangeRects: receipt.rangeRects,
    textContent: receipt.textContent,
    childNodes: receipt.childNodes,
  };
}

async function projectionReceipt(page: Page) {
  return page.locator(".language-split-projection").evaluate((projection) => {
    const read = (selector: string) => {
      const element = projection.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`projection block missing: ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
      };
    };
    const column = projection.getBoundingClientRect();
    const afterElement = projection.querySelector<HTMLElement>(".language-split-block--after");
    if (afterElement === null) throw new Error("projection after block missing");
    const afterText = afterElement.firstChild;
    if (!(afterText instanceof Text)) throw new Error("projection after text missing");
    const afterRange = document.createRange();
    afterRange.selectNodeContents(afterText);
    const afterGlyphRect = Array.from(afterRange.getClientRects()).find(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    if (afterGlyphRect === undefined) throw new Error("projection after glyph missing");
    return {
      columnCenterX: column.left + column.width / 2,
      before: read(".language-split-source"),
      selected: read(".language-split-block--selected"),
      after: read(".language-split-block--after"),
      afterGlyphTop: afterGlyphRect.top,
      slot: read(".language-split-slot"),
    };
  });
}

async function sourceGlyphReceipt(
  text: ReturnType<Page["locator"]>,
  start: number,
  endDelimiter: string,
) {
  return text.evaluate((element, input) => {
    const node = element.firstChild;
    if (!(node instanceof Text)) throw new Error("plain text node missing");
    const end = node.data.indexOf(input.endDelimiter);
    if (end < 0) throw new Error("fixture delimiter missing");
    const range = document.createRange();
    range.setStart(node, input.start);
    range.setEnd(node, end);
    return Array.from(range.getClientRects()).map((rect) => ({
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    }));
  }, { start, endDelimiter });
}

async function sourceRangeTop(
  text: ReturnType<Page["locator"]>,
  phrase: string,
) {
  return text.evaluate((element, selectedPhrase) => {
    const node = element.firstChild;
    if (!(node instanceof Text)) throw new Error("plain text node missing");
    const start = node.data.indexOf(selectedPhrase);
    if (start < 0) throw new Error("fixture suffix missing");
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, node.data.length);
    const first = range.getClientRects()[0];
    if (first === undefined) throw new Error("fixture suffix geometry missing");
    return first.top;
  }, phrase);
}


async function drawEarlyReleaseLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
) {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  // Release before returning to the start; the visible seam is the exact final edge.
  await page.mouse.move(rect.x - margin, rect.y + Math.min(18, rect.height * .45), { steps: 2 });
  await page.mouse.up();
}
