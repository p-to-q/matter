import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

type Point = Readonly<{ x: number; y: number }>;

test.describe("mobile canvas Pan", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("keeps one real touch owner through repeated moves and beyond the paper", async ({ page }) => {
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const shell = page.locator("main.matter-shell");
    const paper = page.locator(".matter-document");
    await expect(page.locator(".matter-material-plane")).toHaveCSS("touch-action", "auto");
    await page.getByRole("button", {
      name: fixtureUiCopy.toolRail.canvasPan,
      exact: true,
    }).tap();
    await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
    await expect(page.locator(".matter-material-plane")).toHaveCSS("touch-action", "none");

    await observePointerLifecycle(shell);
    const paperBox = await paper.boundingBox();
    if (paperBox === null) throw new Error("mobile paper is not visible");
    const start = { x: paperBox.x + 48, y: paperBox.y + 180 };
    const points = [
      { x: start.x + 4, y: start.y + 3 },
      { x: start.x + 14, y: start.y + 10 },
      { x: start.x + 48, y: start.y + 22 },
      { x: start.x + 92, y: paperBox.y + 24 },
      { x: start.x + 138, y: paperBox.y - 18 },
    ];
    const before = await viewportReceipt(shell);

    await withTouchSession(page, async (session) => {
      await touchStart(session, start);
      for (const point of points) await touchMove(session, point);
      await touchEnd(session);
    });

    const final = points.at(-1)!;
    await expect.poll(async () => (await viewportReceipt(shell)).x - before.x)
      .toBeCloseTo(final.x - start.x, 0);
    await expect.poll(async () => (await viewportReceipt(shell)).y - before.y)
      .toBeCloseTo(final.y - start.y, 0);
    await expect(shell).not.toHaveAttribute("data-dragging", "true");
    await expect(shell).toHaveAttribute("data-observed-pointer-cancels", "0");
    expect(Number(await shell.getAttribute("data-observed-pointer-moves"))).toBeGreaterThanOrEqual(points.length);
    expect((await viewportReceipt(shell)).revision).toBe(before.revision);
  });

  test("ends cleanly on cancellation and when Lasso takes the gesture owner", async ({ page }) => {
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const shell = page.locator("main.matter-shell");
    const paper = page.locator(".matter-document");
    const move = page.locator('[data-tool-id="move"]');
    const lasso = page.locator('[data-tool-id="lasso"]');
    await move.tap();
    await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
    await observePointerLifecycle(shell);
    const paperBox = await paper.boundingBox();
    if (paperBox === null) throw new Error("mobile paper is not visible");
    const start = { x: paperBox.x + 52, y: paperBox.y + 210 };

    await withTouchSession(page, async (session) => {
      await touchStart(session, start);
      await touchMove(session, { x: start.x + 30, y: start.y + 18 });
      await expect(shell).toHaveAttribute("data-dragging", "true");
      await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    });
    const afterCancel = await viewportReceipt(shell);
    await expect(shell).not.toHaveAttribute("data-dragging", "true");
    expect(Number(await shell.getAttribute("data-observed-pointer-cancels"))).toBeGreaterThanOrEqual(1);

    await withTouchSession(page, async (session) => {
      await touchStart(session, start);
      await touchMove(session, { x: start.x + 26, y: start.y + 16 });
      await expect(shell).toHaveAttribute("data-dragging", "true");
      await lasso.evaluate((button: HTMLButtonElement) => button.click());
      await expect(shell).toHaveAttribute("data-canvas-mode", "lasso");
      await expect(shell).not.toHaveAttribute("data-dragging", "true");
      const afterSwitch = await viewportReceipt(shell);
      expect(afterSwitch.x).toBeCloseTo(afterCancel.x + 26, 0);
      expect(afterSwitch.y).toBeCloseTo(afterCancel.y + 16, 0);
      await touchMove(session, { x: start.x + 110, y: start.y + 90 });
      await touchEnd(session);
      await expect.poll(() => viewportReceipt(shell)).toEqual(afterSwitch);
    });

    expect(Number(await shell.getAttribute("data-observed-lost-captures"))).toBeGreaterThanOrEqual(1);
    await move.tap();
    await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
    await expect(page.locator(".matter-material-plane")).toHaveCSS("touch-action", "none");

    const textStart = await visibleThoughtTextPoint(page);
    const beforeMoveExit = await viewportReceipt(shell);
    const selectedBeforeMoveExit = await page.locator(".spatial-thought[data-selected=true]").count();
    await withTouchSession(page, async (session) => {
      await touchStart(session, textStart);
      await touchMove(session, { x: textStart.x + 24, y: textStart.y + 14 });
      await expect(shell).toHaveAttribute("data-dragging", "true");
      await move.evaluate((button: HTMLButtonElement) => button.click());
      await expect(shell).toHaveAttribute("data-canvas-mode", "material");
      await expect(shell).not.toHaveAttribute("data-dragging", "true");
      await expect(page.locator(".matter-material-plane")).toHaveCSS("touch-action", "auto");
      const afterMoveExit = await viewportReceipt(shell);
      expect(afterMoveExit.x).toBeCloseTo(beforeMoveExit.x + 24, 0);
      expect(afterMoveExit.y).toBeCloseTo(beforeMoveExit.y + 14, 0);
      await touchMove(session, { x: textStart.x + 120, y: textStart.y + 96 });
      await touchEnd(session);
      await expect.poll(() => viewportReceipt(shell)).toEqual(afterMoveExit);
    });

    expect(Number(await shell.getAttribute("data-observed-lost-captures"))).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".spatial-thought[data-selected=true]")).toHaveCount(selectedBeforeMoveExit);
  });
});

async function observePointerLifecycle(shell: Locator): Promise<void> {
  await shell.evaluate((element) => {
    element.dataset.observedPointerMoves = "0";
    element.dataset.observedPointerCancels = "0";
    element.dataset.observedLostCaptures = "0";
    element.addEventListener("pointermove", () => {
      element.dataset.observedPointerMoves = String(Number(element.dataset.observedPointerMoves) + 1);
    });
    element.addEventListener("pointercancel", () => {
      element.dataset.observedPointerCancels = String(Number(element.dataset.observedPointerCancels) + 1);
    });
    element.addEventListener("lostpointercapture", () => {
      element.dataset.observedLostCaptures = String(Number(element.dataset.observedLostCaptures) + 1);
    });
  });
}

async function viewportReceipt(shell: Locator) {
  return {
    x: Number(await shell.getAttribute("data-viewport-x")),
    y: Number(await shell.getAttribute("data-viewport-y")),
    revision: Number(await shell.getAttribute("data-tree-revision")),
  };
}

async function visibleThoughtTextPoint(page: Page): Promise<Point> {
  const point = await page.locator("[data-thought-text-id]").evaluateAll((buttons) => {
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const candidate = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      if (document.elementFromPoint(candidate.x, candidate.y)?.closest("[data-thought-text-id]") === button) {
        return candidate;
      }
    }
    return null;
  });
  if (point === null) throw new Error("no visible thought text is available for mobile Pan");
  return point;
}

async function withTouchSession(
  page: Page,
  run: (session: CDPSession) => Promise<void>,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await run(session);
  } finally {
    await session.detach();
  }
}

async function touchStart(session: CDPSession, point: Point): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1, radiusX: 1, radiusY: 1 }],
  });
}

async function touchMove(session: CDPSession, point: Point): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...point, id: 1, radiusX: 1, radiusY: 1 }],
  });
}

async function touchEnd(session: CDPSession): Promise<void> {
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
