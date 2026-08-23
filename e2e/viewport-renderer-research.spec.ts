import { expect, test } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

test("C3b publishes one bounded research window over the complete 2,000-node layout", async ({ page }) => {
  test.skip(
    process.env.MATTER_VIEWPORT_RENDERER_FIXTURE !== "true",
    "Run only against the explicit viewport-renderer performance build.",
  );
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  const serverResponse = await page.request.get("/matter/performance");
  expect(serverResponse.ok()).toBe(true);
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain("data-viewport-bootstrap");
  expect(serverHtml).not.toContain("data-layout-node-id=");
  expect(serverHtml).not.toContain("data-thought-id=");

  const hydrationErrors: string[] = [];
  await page.addInitScript(() => {
    const receipt = {
      firstContentfulPaint: null as number | null,
      layoutReady: null as number | null,
      longTasks: [] as Array<Readonly<{ duration: number; startTime: number }>>,
      readyAcknowledged: null as boolean | null,
    };
    (window as Window & { __matterViewportResearchReceipt?: typeof receipt })
      .__matterViewportResearchReceipt = receipt;
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            receipt.firstContentfulPaint ??= entry.startTime;
          }
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          receipt.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {
      // Layout readiness and production marks remain authoritative when an
      // engine does not expose the optional performance entry types.
    }
    const observeReady = () => {
      if (receipt.layoutReady !== null) return;
      const canvas = document.querySelector<HTMLElement>(
        ".matter-canvas[data-layout-ready='true']",
      );
      if (canvas !== null) {
        receipt.layoutReady = performance.now();
        receipt.readyAcknowledged =
          Number(canvas.dataset.completeLayoutNodeCount) === 2_000 &&
          Number(canvas.dataset.viewportNodeCount) > 0 &&
          Number(canvas.dataset.viewportWindowEpoch) > 0;
      }
    };
    new MutationObserver(observeReady).observe(document, {
      attributeFilter: ["data-layout-ready"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    observeReady();
  });
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|didn't match/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.goto("/matter/performance");
  const canvas = page.locator(".matter-canvas");
  await expect(canvas).toHaveAttribute("data-renderer-source", "viewport-research");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).toHaveAttribute("data-complete-layout-node-count", "2000");
  await expect(canvas).not.toHaveAttribute("data-viewport-renderer-error", /.+/);
  await expect(page.locator("[data-viewport-bootstrap]")).toHaveCount(0);
  await expect(page.locator("[data-typography-authority-measurement]")).toHaveCount(0);
  await expect(page.locator("[data-typography-authority-probes]")).toHaveCount(1);

  const receipt = await canvas.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const rows = Array.from(
      element.querySelectorAll<HTMLElement>("[data-layout-node-id]"),
    );
    const ids = rows.map((row) => row.dataset.layoutNodeId ?? "");
    const declaredWindowCount = Number(element.dataset.viewportNodeCount);
    const width = Number.parseFloat(element.style.getPropertyValue("--matter-canvas-width"));
    const height = Number.parseFloat(element.style.getPropertyValue("--matter-canvas-height"));
    const performanceReceipt = (window as Window & {
      __matterViewportResearchReceipt?: Readonly<{
        firstContentfulPaint: number | null;
        layoutReady: number | null;
        longTasks: readonly Readonly<{ duration: number; startTime: number }>[];
        readyAcknowledged: boolean | null;
      }>;
    }).__matterViewportResearchReceipt;
    const markNames = [
      "matter:performance:initial-canvas-committed",
      "matter:performance:height-read-start",
      "matter:performance:height-read-complete",
      "matter:performance:pure-layout-start",
      "matter:performance:pure-layout-complete",
      "matter:performance:geometry-dom-published",
      "matter:performance:published-canvas-commit",
    ];
    return {
      bounds: { height, width },
      completeCount: Number(element.dataset.completeLayoutNodeCount),
      declaredWindowCount,
      distinctIds: new Set(ids).size,
      firstId: ids[0] ?? null,
      lastId: ids.at(-1) ?? null,
      materialButtons: element.querySelectorAll("[data-thought-text-id]").length,
      performance: {
        elementCount: document.querySelectorAll("*").length,
        firstContentfulPaint: performanceReceipt?.firstContentfulPaint ?? null,
        layoutReady: performanceReceipt?.layoutReady ?? null,
        longTaskMax: Math.max(0, ...(performanceReceipt?.longTasks.map(({ duration }) => duration) ?? [])),
        readyAcknowledged: performanceReceipt?.readyAcknowledged ?? null,
        marks: Object.fromEntries(markNames.map((name) => [
          name,
          performance.getEntriesByName(name, "mark")[0]?.startTime ?? null,
        ])),
      },
      ready: element.dataset.layoutReady === "true",
      rowCount: rows.length,
      windowEpoch: Number(element.dataset.viewportWindowEpoch),
    };
  });

  console.log(`Matter C3b viewport receipt: ${JSON.stringify(receipt)}`);
  await test.info().attach("viewport-renderer-research.json", {
    body: JSON.stringify(receipt, null, 2),
    contentType: "application/json",
  });

  expect(receipt.completeCount).toBe(2_000);
  expect(receipt.rowCount).toBeGreaterThan(0);
  expect(receipt.rowCount).toBeLessThan(400);
  expect(receipt.declaredWindowCount).toBe(receipt.rowCount);
  expect(receipt.materialButtons).toBe(receipt.rowCount);
  expect(receipt.distinctIds).toBe(receipt.rowCount);
  expect(receipt.firstId).toBe("perf_thought_0000");
  expect(receipt.lastId).not.toBe("perf_thought_1999");
  expect(receipt.bounds.width).toBeGreaterThan(0);
  expect(receipt.bounds.height).toBeGreaterThan(0);
  expect(receipt.windowEpoch).toBeGreaterThan(0);
  expect(receipt.ready).toBe(true);
  expect(receipt.performance.layoutReady).not.toBeNull();
  expect(receipt.performance.readyAcknowledged).toBe(true);
  expect(receipt.performance.elementCount).toBeLessThan(1_000);
  expect(receipt.performance.longTaskMax).toBeLessThan(100);
  const orderedMarks = Object.values(receipt.performance.marks);
  expect(orderedMarks.every((mark) => mark !== null)).toBe(true);
  expect(orderedMarks).toEqual([...orderedMarks].sort((left, right) =>
    (left ?? 0) - (right ?? 0)
  ));
  expect(hydrationErrors).toEqual([]);
});

test("the ordinary Matter route never creates viewport research ownership", async ({ page }) => {
  test.skip(
    process.env.MATTER_VIEWPORT_RENDERER_FIXTURE !== "true",
    "Run only beside the explicit viewport-renderer performance build.",
  );
  await page.goto("/matter");
  const canvas = page.locator(".matter-canvas");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).not.toHaveAttribute("data-renderer-source", /.+/);
  await expect(page.locator("[data-viewport-bootstrap]")).toHaveCount(0);
  await expect(page.locator("[data-typography-authority-probes]")).toHaveCount(0);
  await expect(page.locator("[data-layout-node-id]")).toHaveCount(10);
});

test("selected and focused offscreen material mounts before viewport acknowledgement", async ({ page }) => {
  test.skip(
    process.env.MATTER_VIEWPORT_RENDERER_FIXTURE !== "true",
    "Run only against the explicit viewport-renderer performance build.",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  const canvas = page.locator(".matter-canvas");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  const initialEpoch = await canvas.getAttribute("data-viewport-window-epoch");

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __matterPerformanceNavigation?: { select: (nodeId: string) => void };
    }).__matterPerformanceNavigation;
    if (bridge === undefined) throw new Error("Performance navigation is unavailable.");
    bridge.select("perf_thought_1999");
  });
  const deep = page.locator('[data-thought-id="perf_thought_1999"]');
  await expect(deep).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).toHaveAttribute("data-complete-layout-node-count", "2000");
  await expect(canvas).not.toHaveAttribute("data-viewport-window-epoch", initialEpoch ?? "");
  await expect(deep).toHaveAttribute("data-selected", "true");
  expect(await deep.evaluate((element) => element.style.transform)).toMatch(/^translate3d\(/);
  expect(await page.locator("[data-layout-node-id]").count()).toBeLessThan(10);

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __matterPerformanceNavigation?: { focus: (nodeId: string) => void };
    }).__matterPerformanceNavigation;
    if (bridge === undefined) throw new Error("Performance navigation is unavailable.");
    bridge.focus("perf_thought_1999");
  });
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(deep).toHaveCount(1);
  await expect(deep).toHaveAttribute("data-focused", "true");
  const focusedCompleteCount = Number(await canvas.getAttribute("data-complete-layout-node-count"));
  const focusedMountedCount = await page.locator("[data-layout-node-id]").count();
  expect(focusedCompleteCount).toBeGreaterThanOrEqual(focusedMountedCount);
  expect(focusedCompleteCount).toBeLessThan(2_000);
  expect(focusedMountedCount).toBe(3);

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __matterPerformanceNavigation?: { showFull: () => void };
    }).__matterPerformanceNavigation;
    if (bridge === undefined) throw new Error("Performance navigation is unavailable.");
    bridge.showFull();
  });
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).toHaveAttribute("data-complete-layout-node-count", "2000");
  await expect(deep).toHaveCount(1);

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __matterPerformanceNavigation?: { select: (nodeId: string) => void };
    }).__matterPerformanceNavigation;
    if (bridge === undefined) throw new Error("Performance navigation is unavailable.");
    bridge.select("perf_thought_0000");
  });
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(deep).toHaveCount(0);
  expect(await page.locator("[data-layout-node-id]").count()).toBeLessThan(10);
});

test("pan, zoom and responsive width republish bounded acknowledged windows", async ({ page }) => {
  test.skip(
    process.env.MATTER_VIEWPORT_RENDERER_FIXTURE !== "true",
    "Run only against the explicit viewport-renderer performance build.",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  const shell = page.locator("main.matter-shell");
  const canvas = page.locator(".matter-canvas");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  const initialEpoch = Number(await canvas.getAttribute("data-viewport-window-epoch"));
  const initialX = Number(await shell.getAttribute("data-viewport-x"));
  const initialZoom = Number(await shell.getAttribute("data-viewport-zoom"));

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();
  await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
  await page.mouse.move(640, 560);
  await page.mouse.down();
  await page.mouse.move(820, 680, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await shell.getAttribute("data-viewport-x")))
    .toBeGreaterThan(initialX + 150);
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect.poll(async () => Number(await canvas.getAttribute("data-viewport-window-epoch")))
    .toBeGreaterThan(initialEpoch);

  const pannedEpoch = Number(await canvas.getAttribute("data-viewport-window-epoch"));
  await shell.dispatchEvent("wheel", {
    clientX: 640,
    clientY: 360,
    ctrlKey: true,
    deltaMode: 0,
    deltaY: -120,
  });
  await expect.poll(async () => Number(await shell.getAttribute("data-viewport-zoom")))
    .toBeGreaterThan(initialZoom);
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect.poll(async () => Number(await canvas.getAttribute("data-viewport-window-epoch")))
    .toBeGreaterThan(pannedEpoch);

  const wideEpoch = Number(await canvas.getAttribute("data-viewport-window-epoch"));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Number(await canvas.getAttribute("data-viewport-window-epoch")))
    .toBeGreaterThan(wideEpoch);
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).toHaveAttribute("data-complete-layout-node-count", "2000");
  await expect(canvas).not.toHaveAttribute("data-viewport-renderer-error", /.+/);
  await expect(page.locator("[data-typography-authority-measurement]")).toHaveCount(0);
  const mounted = await page.locator("[data-layout-node-id]").count();
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(100);
});

test("a damaged measurement owner revokes stale geometry before recovery", async ({ page }) => {
  test.skip(
    process.env.MATTER_VIEWPORT_RENDERER_FIXTURE !== "true",
    "Run only against the explicit viewport-renderer performance build.",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  const canvas = page.locator(".matter-canvas");
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).toHaveAttribute("data-complete-layout-node-count", "2000");

  await page.evaluate(() => {
    document.querySelector("[data-typography-authority-probes]")?.remove();
    const bridge = (window as Window & {
      __matterPerformanceNavigation?: { select: (nodeId: string) => void };
    }).__matterPerformanceNavigation;
    if (bridge === undefined) throw new Error("Performance navigation is unavailable.");
    bridge.select("perf_thought_1999");
  });

  await expect(canvas).not.toHaveAttribute("data-layout-ready", /.+/);
  await expect(canvas).toHaveAttribute("data-viewport-renderer-error", "window-geometry-rejected");
  await expect(canvas).not.toHaveAttribute("data-complete-layout-node-count", /.+/);
  await expect(canvas).not.toHaveAttribute("data-viewport-node-count", /.+/);
  await expect(canvas).not.toHaveAttribute("data-viewport-window-epoch", /.+/);
  await expect(canvas).toHaveJSProperty("inert", true);
  await expect(page.locator("[data-layout-node-id]")).toHaveCount(0);
  await expect(page.locator("[data-viewport-bootstrap]")).toHaveCount(1);

  await page.reload();
  await expect(canvas).toHaveAttribute("data-layout-ready", "true");
  await expect(canvas).toHaveAttribute("data-complete-layout-node-count", "2000");
  await expect(canvas).not.toHaveAttribute("data-viewport-renderer-error", /.+/);
  await expect(canvas).toHaveJSProperty("inert", false);
  const mounted = await page.locator("[data-layout-node-id]").count();
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(400);
});
