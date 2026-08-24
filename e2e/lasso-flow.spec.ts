import { expect, test, type Page } from "@playwright/test";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const rootId = "thought_fixture_root";
const imaginedLivesId = "thought_fixture_imagined_lives";
const imaginedTimeId = "thought_fixture_imagined_time";
const presentDistanceId = "thought_fixture_present_distance";

async function focusRoot(page: Page, narrow: boolean): Promise<void> {
  const rootText = page.locator(`[data-thought-text-id="${rootId}"]`);
  if (narrow) await rootText.click();
  else await rootText.hover();
  await page.getByRole("toolbar", { name: "Thought actions" })
    .getByRole("button", { name: "Focus this thought" })
    .click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
}

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

    const lasso = page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true });
    await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true })).toBeEnabled();
    await lasso.click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    const move = page.getByRole("button", { name: fixtureUiCopy.toolRail.returnToCanvasPan, exact: true });
    await expect(move).toBeEnabled();
    await move.click();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator('[data-tool-id="move"]')).toHaveAttribute("aria-pressed", "true");
    const cameraBeforeMovePan = await page.locator("main.matter-shell").evaluate((main) => ({
      x: Number(main.getAttribute("data-viewport-x")),
      y: Number(main.getAttribute("data-viewport-y")),
    }));
    await page.mouse.move(viewport.width * 0.72, viewport.height * 0.34);
    await page.mouse.down();
    await page.mouse.move(viewport.width * 0.72 + 24, viewport.height * 0.34 + 18, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => page.locator("main.matter-shell").evaluate((main) => ({
      x: Number(main.getAttribute("data-viewport-x")),
      y: Number(main.getAttribute("data-viewport-y")),
    }))).toEqual({ x: cameraBeforeMovePan.x + 24, y: cameraBeforeMovePan.y + 18 });
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan, exact: true }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-canvas-mode", "material");
    await focusRoot(page, viewport.name === "narrow");
    await lasso.click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
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

    const text = page.locator(`[data-thought-text-id="${rootId}"] .spatial-thought__label`);
    const fragment = await segmentProbeRect(text, 0);
    // This receipt exercises wrapped-language selection, not early release.
    // Complete the simple rectangle so a loaded browser cannot turn a
    // near-closure threshold into an unrelated geometry failure.
    await drawClosedLoop(page, fragment);
    await expect(page.locator(".lasso-layer[data-selected=true]")).toBeVisible();
    await expect(page.locator(".lasso-selection-fragment")).not.toHaveCount(0);
    await expect(page.locator(".lasso-selection-count")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
      .toContainText("已选文字");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("向下拉动任一把手展开。");
    const rewriteField = page.getByRole("textbox", {
      name: "输入所选文字的改写方向",
      exact: true,
    });
    await expect(rewriteField).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole("button", { name: "输入所选文字的改写方向", exact: true }))
      .toHaveCount(0);
    await expect(page.locator(".lasso-layer")).not.toContainText(/≈|15%|原文保留/);
    const gripSkin = await page.locator(".stretch-handle").evaluateAll((grips) =>
      grips.map((grip) => {
        const style = getComputedStyle(grip, "::after");
        return { width: style.width, height: style.height, color: style.backgroundColor };
      }),
    );
    expect(gripSkin).toHaveLength(2);
    expect(gripSkin.every((grip) => grip.width === "22px" && grip.height === "2px")).toBe(true);
    expect(new Set(gripSkin.map((grip) => grip.color)).size).toBe(1);
    expect(gripSkin[0]?.color).not.toBe("rgba(0, 0, 0, 0)");
    const sourceLayout = await sourceLayoutReceipt(page, text);
    const handle = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
    const lastPink = await page.locator(".lasso-selection-fragment").last().boundingBox();
    const bottomHandleInitial = await handle.boundingBox();
    if (lastPink === null || bottomHandleInitial === null) throw new Error("selection-aligned handle missing");
    expect(Math.abs(
      bottomHandleInitial.x + bottomHandleInitial.width / 2 - (lastPink.x + lastPink.width / 2),
    )).toBeLessThanOrEqual(3.1);
    await page.evaluate(() => {
      const original = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function failCaptureOnce(pointerId) {
        Element.prototype.setPointerCapture = original;
        void pointerId;
        throw new DOMException("synthetic detached target", "InvalidStateError");
      };
    });
    await page.mouse.move(
      bottomHandleInitial.x + bottomHandleInitial.width / 2,
      bottomHandleInitial.y + bottomHandleInitial.height / 2,
    );
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-stretching", "true");
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
    const handleBox = await handle.boundingBox();
    if (handleBox === null) throw new Error("stretch handle missing");
    const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 2);
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "0");

    // Hover before pressing. Measuring the settled handle and pressing that
    // point races the layout that follows `Home`: under load the press landed
    // beside the re-grabbed handle and no drag began, which read as a product
    // flake for as long as CI retried it away.
    await handle.hover();
    const secondHandleBox = await handle.boundingBox();
    if (secondHandleBox === null) throw new Error("settled stretch handle missing");
    const secondStart = {
      x: secondHandleBox.x + secondHandleBox.width / 2,
      y: secondHandleBox.y + secondHandleBox.height / 2,
    };
    // `hover()` targeted the previous layout sample. Re-aim at the box we just
    // measured so a busy parallel run cannot press beside a handle that moved
    // between actionability and the fresh receipt.
    await page.mouse.move(secondStart.x, secondStart.y);
    await page.mouse.down();
    await expect(page.locator(".text-swap-composer")).toHaveCount(0);
    await page.mouse.move(secondStart.x, secondStart.y + 60, { steps: 5 });
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-stretching", "true");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("再拉开一点。");
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
    const liveLayout = await sourceLayoutReceipt(page, text);
    expect(sourceTextReceipt(liveLayout)).toEqual(sourceTextReceipt(sourceLayout));
    expect(liveLayout.node).toEqual(sourceLayout.node);
    expect(liveLayout.canvas.height).toBeGreaterThan(sourceLayout.canvas.height);
    await handle.dispatchEvent("pointercancel", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "0");
    await handle.press("PageUp");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.5");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("按回车键展开。");
    const settledLayout = await sourceLayoutReceipt(page, text);
    expect(sourceTextReceipt(settledLayout)).toEqual(sourceTextReceipt(sourceLayout));
    expect(settledLayout.node).toEqual(sourceLayout.node);
    expect(settledLayout.canvas.height).toBeGreaterThanOrEqual(sourceLayout.canvas.height);

    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.6");
    await page.keyboard.press("ArrowUp");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.7");
    await page.keyboard.press("ArrowDown");
    await expect(handle).toHaveAttribute("aria-valuenow", "0.6");
    await page.keyboard.press("ArrowUp");
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
    if (boundedHandle === null) throw new Error("bounded handle missing");
    expect(boundedHandle.x).toBeGreaterThanOrEqual(visibleViewport.left);
    expect(boundedHandle.y).toBeGreaterThanOrEqual(visibleViewport.top);
    expect(boundedHandle.x + boundedHandle.width).toBeLessThanOrEqual(visibleViewport.right);
    expect(boundedHandle.y + boundedHandle.height).toBeLessThanOrEqual(visibleViewport.bottom);

    const settledBeforeInvalidation = await handle.getAttribute("aria-valuenow");
    for (const eventSource of ["window", "visualViewport", "fonts"] as const) {
      await handle.hover();
      await expect.poll(async () => {
        const box = await handle.boundingBox();
        if (box === null) return false;
        return page.evaluate(({ x, y }) => {
          const target = document.elementFromPoint(x, y);
          return target instanceof Element && target.closest(".stretch-handle") !== null;
        }, {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        });
      }).toBe(true);
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
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("按回车键展开。");
    const selected = await page.getByRole("status")
      .filter({ hasText: "已选文字" })
      .textContent();
    expect(selected).toContain("已选文字");

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
    await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
      .toHaveText(selectionBeforeCancel!);

    await page.mouse.move(fragment.x - 12, fragment.y - 12);
    await page.mouse.down();
    await page.mouse.move(fragment.x + 12, fragment.y + 12, { steps: 3 });
    await page.setViewportSize({ width: viewport.width, height: viewport.height - 24 });
    await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", "");
    await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", "");
    await page.mouse.up();

    await expect(page.locator(".lasso-selection-fragment")).not.toHaveCount(0);
    // The Lasso control is also the explicit exit: pointer mode and every
    // transient language address leave together.
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitLanguageSelection, exact: true }).click();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator(".lasso-selection-fragment")).toHaveCount(0);
    await expect(page.locator(".stretch-handle")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });

  test(`lasso shows closure only for a releasable selection at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
    const fragment = await segmentProbeRect(page.locator(`[data-thought-text-id="${rootId}"]`), 0);

    const empty = { x: viewport.width - 72, y: viewport.height - 116, width: 44, height: 36 };
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("闭合圈选这段文字。");
    await page.mouse.move(empty.x + empty.width, empty.y, { steps: 3 });
    await page.mouse.move(empty.x + empty.width, empty.y + empty.height, { steps: 3 });
    await page.mouse.move(empty.x, empty.y + empty.height, { steps: 3 });
    await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", / Q /);
    await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", "");
    await page.mouse.up();
    await expect(page.locator(".lasso-layer[data-selected=true]")).toHaveCount(0);
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("圈住一段连续文字，边界停在标点处。");

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
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("圈住一段连续文字，边界停在标点处。");
  });

  test(`lasso does not add a sidebar hint at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
    await expect(page.locator(".lasso-hint")).toHaveCount(0);
  });

  test(`selected language stays quiet until expansion opens a local lane at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.getByRole("button", { name: /Apply v[123] fixture version/ })).toHaveCount(0);
    await focusRoot(page, viewport.name === "narrow");
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("圈住一段连续文字，边界停在标点处。");

    const text = page.locator(`[data-thought-text-id="${rootId}"] .spatial-thought__label`);
    const selectedSegment = await segmentProbeRect(text, 0);
    await drawEarlyReleaseLoop(page, selectedSegment);
    await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
      .toContainText("已选文字");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("向下拉动任一把手展开。");
    await expect(page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" }))
      .toBeVisible();

    const before = page.locator(".language-split-before-copy");
    const selected = page.locator(".language-split-block--selected");
    const after = page.locator(".language-split-block--after");
    await expect(before).toHaveCount(1);
    await expect(selected).toHaveCount(1);
    await expect(after).toHaveCount(1);
    const sourceBefore = await sourceLayoutReceipt(page, text);
    await expect(page.locator(".language-split-projection"))
      .toHaveAttribute("data-preview-mode", "neutral");
    await expect(page.locator(".lasso-selection-fragment").first()).toBeVisible();
    const sourceGlyphsBefore = await sourceGlyphReceipt(text, 0, "，");
    const projectionParity = await selectionProjectionParity(page, text, "，");
    expect(projectionParity.typography.projection).toEqual(projectionParity.typography.source);
    expect(projectionParity.sourceRects).toHaveLength(projectionParity.projectionRects.length);
    for (let index = 0; index < projectionParity.sourceRects.length; index += 1) {
      const sourceRect = projectionParity.sourceRects[index]!;
      const projectionRect = projectionParity.projectionRects[index]!;
      expect(Math.abs(projectionRect.x - sourceRect.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(projectionRect.y - sourceRect.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(projectionRect.width - sourceRect.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(projectionRect.height - sourceRect.height)).toBeLessThanOrEqual(1);
    }

    const bottom = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
    await bottom.press("End");
    await expect(bottom).toHaveAttribute("aria-valuenow", "1");
    await expect(page.locator(".matter-guidance__next"))
      .toHaveText("按回车键展开。");
    const expanded = await projectionReceipt(page);
    const sourceGlyphsExpanded = await sourceGlyphReceipt(text, 0, "，");
    await expect(page.locator(".language-split-projection"))
      .toHaveAttribute("data-preview-mode", "expand");
    expect(Math.abs(expanded.before.centerX - expanded.columnCenterX)).toBeLessThanOrEqual(1);
    expect(expanded.selected.left).toBeGreaterThanOrEqual(expanded.columnLeft - 1);
    expect(expanded.selected.right).toBeLessThanOrEqual(expanded.columnRight + 1);
    expect(Math.abs(expanded.after.centerX - expanded.columnCenterX)).toBeLessThanOrEqual(1);
    expect(expanded.slot.height).toBeGreaterThan(120);
    expect(sourceGlyphsExpanded).toEqual(sourceGlyphsBefore);
    const sourceAfter = await sourceLayoutReceipt(page, text);
    expect(sourceTextReceipt(sourceAfter)).toEqual(sourceTextReceipt(sourceBefore));
    expect(sourceAfter.node).toEqual(sourceBefore.node);
    expect(sourceAfter.canvas.height).toBeGreaterThanOrEqual(sourceBefore.canvas.height);

    await bottom.press("Home");
    await expect(page.locator(".language-split-projection"))
      .toHaveAttribute("data-preview-mode", "neutral");
    await expect(page.locator(".lasso-selection-fragment").first()).toBeVisible();
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitLanguageSelection, exact: true }).click();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator(".stretch-handle")).toHaveCount(0);
  });
}

test("keyboard addresses exact segments and Escape or the narrow index returns Lasso authority", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, true);

  const shell = page.locator("main.matter-shell");
  await expect(shell).toHaveAttribute("lang", "zh-CN");
  const lasso = page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true });
  const rootText = page.locator(`[data-thought-text-id="${rootId}"]`);
  await lasso.click();
  await rootText.focus();
  await expect(rootText).toHaveAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
  await expect(rootText).toHaveAttribute("aria-describedby", /.+/u);
  await rootText.press("ArrowRight");
  const selectedStatus = page.getByRole("status").filter({ hasText: "已选文字" });
  const firstAnnouncement = await selectedStatus.textContent();
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await rootText.press("ArrowRight");
  const secondAnnouncement = await selectedStatus.textContent();
  expect(secondAnnouncement).not.toBe(firstAnnouncement);
  await rootText.press("ArrowLeft");
  await expect(selectedStatus).toHaveText(firstAnnouncement ?? "");

  await page.keyboard.press("Escape");
  await expect(shell).not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.locator(".stretch-handle")).toHaveCount(0);

  await lasso.click();
  const paper = page.getByRole("region", { name: "Thought material" });
  const paperBox = await paper.boundingBox();
  if (paperBox === null) throw new Error("paper missing");
  await page.mouse.move(paperBox.x + 40, paperBox.y + 80);
  await page.mouse.down();
  await expect(page.locator(".lasso-layer")).toHaveAttribute("data-drawing", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(shell).not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.locator(".lasso-layer")).not.toHaveAttribute("data-drawing", "true");

  await lasso.click();
  await page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles, exact: true }).click();
  await expect(page.locator("#material-files")).toHaveAttribute("data-open", "true");
  await expect(shell).not.toHaveAttribute("data-lasso-mode", "true");
});

test("lasso keeps its outside-paper particle echo visual-only", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const paper = await page.getByRole("region", { name: "Thought material" }).boundingBox();
  if (paper === null) throw new Error("paper is not visible");
  await page.mouse.move(paper.x + 40, paper.y + 120);
  await page.mouse.down();
  await page.mouse.move(paper.x - 36, paper.y + 150, { steps: 12 });
  await expect.poll(async () => (await particleAlpha(page, paper)).outside).toBeGreaterThan(0);
  expect((await particleAlpha(page, paper)).inside).toBe(0);

  // The stroke still carries every sampled point, including the ones off the
  // paper; only the drawn line stops at the paper's edge.
  const ink = await page.evaluate(() => {
    const element = document.querySelector<SVGSVGElement>(".lasso-ink");
    const trace = document.querySelector<SVGPathElement>(".lasso-ink__trace");
    if (element === null || trace === null) return null;
    const style = getComputedStyle(element);
    return {
      clip: style.clipPath,
      length: trace.getTotalLength(),
      strokeWidth: (trace.getAttribute("d") ?? "").length,
    };
  });
  if (ink === null) throw new Error("the lasso ink layer is not rendered");
  expect(ink.clip).toMatch(/inset\(/);
  expect(ink.clip).not.toBe("none");
  expect(ink.length).toBeGreaterThan(0);
  expect(ink.strokeWidth).toBeGreaterThan(0);

  await page.mouse.up();
  await expect.poll(async () => (await particleAlpha(page, paper)).outside).toBe(0);
  await expect.poll(async () => page.evaluate(() => {
    const element = document.querySelector<SVGSVGElement>(".lasso-ink");
    return element === null ? "none" : getComputedStyle(element).clipPath;
  })).toBe("none");
});

test("lasso keeps its echo through the paper's rounded corner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const paper = await page.getByRole("region", { name: "Thought material" }).boundingBox();
  if (paper === null) throw new Error("paper is not visible");

  // A stroke through the corner cutout sits outside the rounded paper while
  // still inside its bounding rectangle. Ink stops there and the echo starts,
  // so the two layers must share one boundary or the corner shows neither.
  await page.mouse.move(paper.x + 90, paper.y + 90);
  await page.mouse.down();
  await expect(page.locator(".lasso-layer")).toHaveAttribute("data-drawing", "true");
  for (let step = 1; step <= 14; step += 1) {
    const t = step / 14;
    await page.mouse.move(paper.x + 90 - t * 88, paper.y + 90 - t * 88);
  }
  // The cutout is inside the paper's bounding box, so the rectangle-based
  // helper cannot see it; sample the corner itself.
  await expect.poll(() => cornerParticleAlpha(page, paper), { timeout: 5_000 })
    .toBeGreaterThan(0);
  await page.mouse.up();
});

test("a loop across two passages enters selection mode without Elastic grips", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();

  const passages = page.locator(".spatial-thought__text");
  const first = await passages.nth(0).boundingBox();
  const second = await passages.nth(1).boundingBox();
  if (first === null || second === null) throw new Error("two visible passages are required");
  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  await drawEarlyReleaseLoop(page, {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, true);

  await expect(page.locator(".lasso-selection-count")).toHaveAttribute("data-selection-count", "2");
  await expect(page.locator(".lasso-selection-count")).toContainText("已选 2 段文字");
  await expect(page.locator(".lasso-layer[data-selected=true]")).toBeVisible();
  await expect(page.locator(".stretch-handle")).toHaveCount(0);
  await expect(page.locator(`.material-file[data-node-id="${rootId}"]`))
    .toHaveAttribute("data-lasso-selected", "true");
  await expect(page.locator(`.material-file[data-node-id="${imaginedLivesId}"]`))
    .toHaveAttribute("data-lasso-selected", "true");
  await expect(page.locator("aside.material-files .material-files__tree"))
    .toHaveAttribute("aria-multiselectable", "true");
  await expect(page.locator(`.material-file[data-node-id="${rootId}"]`))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`.material-file[data-node-id="${imaginedLivesId}"]`))
    .toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(page.locator(".lasso-selection-count")).toHaveAttribute("data-selection-count", "2");
  await expect(page.locator(".stretch-handle")).toHaveCount(0);

  const firstText = await passages.nth(0).boundingBox();
  if (firstText === null) throw new Error("selected passage disappeared");
  await page.mouse.click(
    firstText.x + firstText.width / 2,
    firstText.y + firstText.height / 2,
  );
  await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
  await expect(passages.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".lasso-selection-count")).toHaveCount(0);
  await expect(page.locator(".material-file[data-lasso-selected=true]")).toHaveCount(0);

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  const paper = await page.getByRole("region", { name: "Thought material" }).boundingBox();
  if (paper === null) throw new Error("paper disappeared");
  await page.mouse.click(paper.x + paper.width - 80, paper.y + paper.height - 90);
  await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.locator(".lasso-layer[data-selected=true]")).toHaveCount(0);
});

test("one Full-view punctuation segment keeps the full canvas and reveals both grips", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
  const visibleThoughts = page.locator(".spatial-thought__text");
  const visibleBefore = await visibleThoughts.count();
  const disclosure = page.locator(
    `.material-file[data-node-id="${rootId}"] .material-file__structure-control`,
  );
  await expect(disclosure).toBeEnabled();
  await expect(disclosure).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  await expect(disclosure).toBeDisabled();
  await expect(disclosure).toHaveCSS("opacity", "1");
  await expect(disclosure.locator(".material-file__disclosure-chevron"))
    .toHaveCSS("opacity", "1");

  const fullText = page.locator(`[data-thought-text-id="${rootId}"]`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(fullText, 0));

  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
  await expect(visibleThoughts).toHaveCount(visibleBefore);
  await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
    .toContainText("已选文字");
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  const rewrite = page.getByRole("textbox", {
    name: "输入所选文字的改写方向",
    exact: true,
  });
  await expect(rewrite).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rewrite selected language", exact: true }))
    .toHaveCount(0);
  const downstream = page.locator(`[data-layout-node-id="${presentDistanceId}"]`);
  const downstreamBefore = await downstream.boundingBox();
  const lowerBox = await lower.boundingBox();
  if (downstreamBefore === null || lowerBox === null) {
    throw new Error("live downstream layout receipt missing");
  }
  const lowerCenter = {
    x: lowerBox.x + lowerBox.width / 2,
    y: lowerBox.y + lowerBox.height / 2,
  };
  await page.mouse.move(lowerCenter.x, lowerCenter.y);
  await page.mouse.down();
  await page.mouse.move(lowerCenter.x, lowerCenter.y + 80, { steps: 5 });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-stretching", "true");
  const downstreamDuring = await downstream.boundingBox();
  if (downstreamDuring === null) throw new Error("live downstream material disappeared");
  expect(downstreamDuring.y).toBeGreaterThan(downstreamBefore.y + 20);
  await lower.dispatchEvent("pointercancel", {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  });
  await page.mouse.up();
  await expect(lower).toHaveAttribute("aria-valuenow", "0");
  await expect.poll(async () => (await downstream.boundingBox())?.y ?? null)
    .toBeCloseTo(downstreamBefore.y, 0);
  await lower.press("PageUp");
  await expect(lower).toHaveAttribute("aria-valuenow", "0.5");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");
  await expect(visibleThoughts).toHaveCount(visibleBefore);
  await expect(page.locator(".language-split-projection"))
    .toHaveAttribute("data-stretch-handle", "bottom");
});

test("activating Lasso adopts the rendered camera during index motion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.addStyleTag({
    // Give the test a real but long-enough motion interval to place the tool
    // click. The lasso itself starts only after it takes ownership of one
    // rendered camera, never by joining coordinates from two animation frames.
    content: '.matter-world[data-camera-motion="index"] { transition-duration: 8000ms !important; }',
  });

  const row = page.locator("aside.material-files .material-file").nth(8);
  const nodeId = await row.getAttribute("data-node-id");
  if (nodeId === null) throw new Error("camera-interrupt lasso fixture is missing");
  const world = page.locator(".matter-world");
  await row.locator(".material-file__open").click();
  await expect(world).toHaveAttribute("data-camera-motion", "index");
  const target = page.locator(
    `[data-layout-node-id="${nodeId}"] .spatial-thought__label`,
  );
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    const worldElement = document.querySelector<HTMLElement>(".matter-world");
    const paper = document.querySelector(".matter-document")?.getBoundingClientRect();
    if (element === null || worldElement?.dataset.cameraMotion !== "index" || paper === undefined) return false;
    const rect = element.getBoundingClientRect();
    return rect.left + rect.width / 2 > paper.left + 24 && rect.left + rect.width / 2 < paper.right - 24;
  }, `[data-layout-node-id="${nodeId}"] .spatial-thought__label`, { polling: "raf" });
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  await expect(world).not.toHaveAttribute("data-camera-motion", "index");
  await expect(target).toBeInViewport();
  const fragment = await segmentProbeRect(target, 0);
  const margin = 9;
  await page.mouse.move(fragment.x - margin, fragment.y - margin);
  await page.mouse.down();
  await page.mouse.move(fragment.x + fragment.width + margin, fragment.y - margin, { steps: 5 });
  await page.mouse.move(
    fragment.x + fragment.width + margin,
    fragment.y + fragment.height + margin,
    { steps: 4 },
  );
  await page.mouse.move(fragment.x - margin, fragment.y + fragment.height + margin, { steps: 5 });
  // Assert the live seam before pointer-up clears transient ink. The path is
  // measured after Lasso has frozen the rendered camera, so it cannot splice
  // coordinates from two camera epochs.
  await page.mouse.move(fragment.x - margin, fragment.y + Math.min(18, fragment.height * .45), { steps: 2 });
  await expect(page.locator(".lasso-ink__trace")).toHaveAttribute("d", / Q /);
  await expect(page.locator(".lasso-ink__closure")).toHaveAttribute("d", / L /);
  await page.mouse.up();
  await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
    .toHaveCount(1);
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
});

test("circling a few off-centre words snaps to their single punctuation segment", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();

  const text = page.locator(`[data-thought-text-id="${rootId}"]`);
  await drawEarlyReleaseLoop(page, await textSliceProbeRect(text, 2, 6));

  await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
    .toContainText("我们怀念的也许不是一个真实存在过的过去");
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
});

test("Focus lasso authority belongs only to the exact focused thought", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const child = page.locator(`[data-thought-text-id="${imaginedTimeId}"]`);
  await selectThoughtThroughMaterialIndex(page, imaginedTimeId);
  await child.hover();
  await expect(child).toHaveAttribute("aria-pressed", "true");
  const thoughtActions = page.locator(
    `[data-node-action-lens][data-node-id="${imaginedTimeId}"]`,
  );
  // Selection state publishes before the shared render-edge lens finishes
  // retargeting. The action's own node receipt is the authority for this click.
  await expect(thoughtActions).toHaveAttribute("data-node-id", imaginedTimeId);
  await thoughtActions.getByRole("button", { name: "Focus this thought" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
  await expect(page.locator(`[data-thought-text-id="${rootId}"]`)).toBeVisible();
  await expect(child).toBeVisible();

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  await drawEarlyReleaseLoop(
    page,
    await segmentProbeRect(page.locator(`[data-thought-text-id="${rootId}"]`), 0),
  );
  await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
    .toHaveCount(0);
  await expect(page.locator(".lasso-layer[data-selected=true]")).toHaveCount(0);
  await expect(page.locator(".stretch-handle")).toHaveCount(0);
  await expect(page.getByRole("textbox", {
    name: "输入所选文字的改写方向",
    exact: true,
  })).toHaveCount(0);

  await child.scrollIntoViewIfNeeded();
  await drawEarlyReleaseLoop(
    page,
    await segmentProbeRect(child.locator(".spatial-thought__label"), 0),
  );
  await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
    .toContainText("已选文字");
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(page.getByRole("textbox", {
    name: "输入所选文字的改写方向",
    exact: true,
  })).toHaveCount(0);
});

test("a non-root upper grip pulls upward while its fixed seam pushes the selection down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const child = page.locator(`[data-thought-text-id="${imaginedTimeId}"]`);
  await selectThoughtThroughMaterialIndex(page, imaginedTimeId);
  await child.hover();
  await expect(child).toHaveAttribute("aria-pressed", "true");
  await page.locator(`[data-node-action-lens][data-node-id="${imaginedTimeId}"]`)
    .getByRole("button", { name: "Focus this thought" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  await child.scrollIntoViewIfNeeded();
  await drawEarlyReleaseLoop(
    page,
    await segmentProbeRect(child.locator(".spatial-thought__label"), 1),
  );

  const upper = page.getByRole("slider", {
    name: "用上握点设置所选文字的展开程度",
  });
  const lower = page.getByRole("slider", {
    name: "用下握点设置所选文字的展开程度",
  });
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  const beforeCopy = page.locator(".language-split-before-copy");
  const selectedCopy = page.locator(".language-split-block--selected");
  const [prefixBefore, selectedBefore, lowerBefore] = await Promise.all([
    beforeCopy.boundingBox(),
    selectedCopy.boundingBox(),
    lower.boundingBox(),
  ]);
  if (prefixBefore === null || selectedBefore === null || lowerBefore === null) {
    throw new Error("upper live projection receipt is missing");
  }

  const box = await upper.boundingBox();
  if (box === null) throw new Error("upper grip is missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 80, { steps: 5 });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-stretching", "true");
  await expect(upper).not.toHaveAttribute("aria-valuenow", "0");

  const [prefixDuring, selectedDuring, lowerDuring] = await Promise.all([
    beforeCopy.boundingBox(),
    selectedCopy.boundingBox(),
    lower.boundingBox(),
  ]);
  if (prefixDuring === null || selectedDuring === null || lowerDuring === null) {
    throw new Error("upper live projection disappeared");
  }
  expect(Math.abs(prefixDuring.y - prefixBefore.y)).toBeLessThanOrEqual(1);
  expect(selectedDuring.y).toBeGreaterThan(selectedBefore.y + 20);
  expect(lowerDuring.y).toBeGreaterThan(lowerBefore.y + 20);

  await upper.dispatchEvent("lostpointercapture", {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  });
  await page.mouse.up();
  await expect(upper).toHaveAttribute("aria-valuenow", "0");
  await expect.poll(async () => (await beforeCopy.boundingBox())?.y ?? null)
    .toBeCloseTo(prefixBefore.y, 0);
  await expect.poll(async () => (await selectedCopy.boundingBox())?.y ?? null)
    .toBeCloseTo(selectedBefore.y, 0);
});

test("a whole multi-segment main thought becomes one contiguous Elastic range", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();

  const text = page.locator(`[data-thought-text-id="${rootId}"] .spatial-thought__label`);
  const first = await segmentRect(page, text, 0);
  const second = await segmentRect(page, text, 1);
  await drawEarlyReleaseLoop(page, {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.max(first.x + first.width, second.x + second.width) - Math.min(first.x, second.x),
    height: Math.max(first.y + first.height, second.y + second.height) - Math.min(first.y, second.y),
  });

  await expect(page.getByRole("status").filter({ hasText: "已选文字" }))
    .toContainText("我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活");
  await expect(page.locator(".lasso-selection-count")).toHaveCount(0);
  await expect(page.locator(".lasso-layer[data-selected=true]")).toBeVisible();
  await expect(page.locator(".stretch-handle")).toHaveCount(2);
  await expect(page.getByRole("textbox", {
    name: "输入所选文字的改写方向",
    exact: true,
  })).toHaveCount(0);
});

async function cornerParticleAlpha(page: Page, paper: { x: number; y: number }) {
  return page.locator(".lasso-particles").evaluate((canvas, bounds) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (context === null) return 0;
    const ratio = target.width / document.documentElement.clientWidth;
    const left = Math.max(0, Math.round((bounds.x - 4) * ratio));
    const top = Math.max(0, Math.round((bounds.y - 4) * ratio));
    const size = Math.round(30 * ratio);
    const pixels = context.getImageData(left, top, size, size).data;
    let total = 0;
    for (let index = 3; index < pixels.length; index += 4) total += pixels[index] ?? 0;
    return total;
  }, paper);
}

async function particleAlpha(page: Page, paper: { x: number; y: number; width: number; height: number }) {
  return page.locator(".lasso-particles").evaluate((canvas, bounds) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (context === null) return { outside: 0, inside: 0 };
    const ratio = target.width / document.documentElement.clientWidth;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    let outside = 0;
    let inside = 0;
    for (let y = 0; y < target.height; y += 2) {
      for (let x = 0; x < target.width; x += 2) {
        const alpha = pixels[(y * target.width + x) * 4 + 3] ?? 0;
        if (alpha === 0) continue;
        const clientX = x / ratio;
        const clientY = y / ratio;
        if (clientX >= bounds.x && clientX <= bounds.x + bounds.width && clientY >= bounds.y && clientY <= bounds.y + bounds.height) inside += alpha;
        else outside += alpha;
      }
    }
    return { outside, inside };
  }, paper);
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
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // One fragment center addresses the whole semantic punctuation segment.
    return { x: centerX - 2, y: centerY - 2, width: 4, height: 4 };
  }, segmentIndex);
}

async function textSliceProbeRect(
  text: ReturnType<Page["locator"]>,
  start: number,
  end: number,
) {
  return text.evaluate((element, rangeInput) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const range = document.createRange();
    range.setStart(textNode, rangeInput.start);
    range.setEnd(textNode, rangeInput.end);
    const rect = Array.from(range.getClientRects())[0];
    if (rect === undefined) throw new Error("text slice fragment missing");
    return {
      x: rect.left + rect.width / 2 - 2,
      y: rect.top + rect.height / 2 - 2,
      width: 4,
      height: 4,
    };
  }, { start, end });
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

async function selectionProjectionParity(
  page: Page,
  source: ReturnType<Page["locator"]>,
  delimiter: string,
) {
  return page.evaluate(({ selector, delimiter }) => {
    const sourceElement = document.querySelector<HTMLElement>(selector);
    const projectionElement = document.querySelector<HTMLElement>(".language-split-selected-copy");
    if (sourceElement === null || projectionElement === null) {
      throw new Error("selection typography receipt is missing");
    }
    const sourceNode = sourceElement.firstChild;
    const projectionNode = projectionElement.firstChild;
    if (!(sourceNode instanceof Text) || !(projectionNode instanceof Text)) {
      throw new Error("selection typography text is missing");
    }
    const end = sourceNode.data.indexOf(delimiter);
    if (end < 0) throw new Error("selection typography delimiter is missing");
    const sourceRange = document.createRange();
    sourceRange.setStart(sourceNode, 0);
    sourceRange.setEnd(sourceNode, end);
    const projectionRange = document.createRange();
    projectionRange.selectNodeContents(projectionNode);
    const box = (rect: DOMRect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    const typography = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
      };
    };
    return {
      typography: {
        source: typography(sourceElement),
        projection: typography(projectionElement),
      },
      sourceRects: Array.from(sourceRange.getClientRects(), box),
      projectionRects: Array.from(projectionRange.getClientRects(), box),
    };
  }, { selector: await source.evaluate((element) => {
    const id = element.closest<HTMLElement>("[data-thought-text-id]")?.dataset.thoughtTextId;
    if (id === undefined) throw new Error("source thought id is missing");
    return `[data-thought-text-id="${CSS.escape(id)}"] .spatial-thought__label`;
  }), delimiter });
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
        left: rect.left,
        right: rect.right,
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
      columnLeft: column.left,
      columnRight: column.right,
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

async function drawEarlyReleaseLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
  requireDrawing = false,
) {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  if (requireDrawing) {
    await expect(page.locator(".lasso-layer")).toHaveAttribute("data-drawing", "true");
  }
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  // Release before returning to the start; the visible seam is the exact final edge.
  await page.mouse.move(rect.x - margin, rect.y + Math.min(18, rect.height * .45), { steps: 2 });
  await page.mouse.up();
}

async function drawClosedLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
) {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  await page.mouse.move(rect.x - margin, rect.y - margin, { steps: 4 });
  await page.mouse.up();
}
