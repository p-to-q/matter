import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";

type Point = Readonly<{ x: number; y: number }>;

// Real Chromium pen and touch input through CDP. A palm that lands while the
// pen writes is primary for its own pointer type, so only the canvas gesture
// owner keeps it out of the camera.
test.describe("pen-active palm rejection", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test("a palm during a pen pan never moves the camera", async ({ page }) => {
    const { paper, shell, session } = await openPanCanvas(page);
    try {
      const box = await paperBox(paper);
      const penStart = { x: box.x + box.width / 2, y: box.y + 200 };
      const palm = { x: box.x + 80, y: box.y + box.height - 120 };
      const before = await viewportReceipt(shell);

      await pen(session, "mousePressed", penStart);
      await pen(session, "mouseMoved", { x: penStart.x + 12, y: penStart.y + 6 });
      await touch(session, "touchStart", palm);
      await touch(session, "touchMove", { x: palm.x + 160, y: palm.y - 90 });
      await pen(session, "mouseMoved", { x: penStart.x + 40, y: penStart.y + 20 });
      await touch(session, "touchEnd");
      await pen(session, "mouseReleased", { x: penStart.x + 40, y: penStart.y + 20 });

      await expect.poll(async () => (await viewportReceipt(shell)).x - before.x).toBeCloseTo(40, 0);
      await expect.poll(async () => (await viewportReceipt(shell)).y - before.y).toBeCloseTo(20, 0);
      expect((await viewportReceipt(shell)).zoom).toBe(before.zoom);
    } finally {
      await session.detach();
    }
  });

  test("a pen that lands just after a palm takes over and restores the camera", async ({ page }) => {
    const { paper, shell, session } = await openPanCanvas(page);
    try {
      const box = await paperBox(paper);
      const palm = { x: box.x + 80, y: box.y + box.height - 120 };
      const penStart = { x: box.x + box.width / 2, y: box.y + 200 };
      const before = await viewportReceipt(shell);

      await touch(session, "touchStart", palm);
      await touch(session, "touchMove", { x: palm.x + 60, y: palm.y - 30 });
      await pen(session, "mousePressed", penStart);
      // The palm's pan is revoked: the camera returns to where it began.
      await expect.poll(async () => (await viewportReceipt(shell)).x).toBe(before.x);
      await touch(session, "touchMove", { x: palm.x + 120, y: palm.y - 60 });
      await pen(session, "mouseMoved", { x: penStart.x - 30, y: penStart.y + 10 });
      await touch(session, "touchEnd");
      await pen(session, "mouseReleased", { x: penStart.x - 30, y: penStart.y + 10 });

      await expect.poll(async () => (await viewportReceipt(shell)).x - before.x).toBeCloseTo(-30, 0);
      await expect.poll(async () => (await viewportReceipt(shell)).y - before.y).toBeCloseTo(10, 0);
    } finally {
      await session.detach();
    }
  });

  test("two fingers still pinch when no pen is touching", async ({ page }) => {
    const { paper, shell, session } = await openPanCanvas(page);
    try {
      const box = await paperBox(paper);
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const before = await viewportReceipt(shell);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: center.x - 40, y: center.y, id: 1, radiusX: 1, radiusY: 1 },
          { x: center.x + 40, y: center.y, id: 2, radiusX: 1, radiusY: 1 },
        ],
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: center.x - 90, y: center.y, id: 1, radiusX: 1, radiusY: 1 },
          { x: center.x + 90, y: center.y, id: 2, radiusX: 1, radiusY: 1 },
        ],
      });
      await expect.poll(async () => (await viewportReceipt(shell)).zoom).toBeGreaterThan(before.zoom);
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } finally {
      await session.detach();
    }
  });
});

async function openPanCanvas(page: Page) {
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const shell = page.locator("main.matter-shell");
  await page.locator('[data-tool-id="move"]').click();
  await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
  const session = await page.context().newCDPSession(page);
  return { paper: page.locator(".matter-document"), shell, session };
}

async function paperBox(paper: Locator) {
  const box = await paper.boundingBox();
  if (box === null) throw new Error("paper is not visible");
  return box;
}

async function pen(
  session: CDPSession,
  type: "mousePressed" | "mouseMoved" | "mouseReleased",
  point: Point,
): Promise<void> {
  await session.send("Input.dispatchMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
    pointerType: "pen",
  });
}

async function touch(
  session: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  point?: Point,
): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: point === undefined ? [] : [{ ...point, id: 7, radiusX: 1, radiusY: 1 }],
  });
}

async function viewportReceipt(shell: Locator) {
  return {
    x: Number(await shell.getAttribute("data-viewport-x")),
    y: Number(await shell.getAttribute("data-viewport-y")),
    zoom: Number(await shell.getAttribute("data-viewport-zoom")),
  };
}
