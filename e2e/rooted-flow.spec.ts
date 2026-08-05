import { expect, test, type Page } from "@playwright/test";

const rootId = "thought_fixture_root";
const originalText =
  "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`hackathon surface and rooted geometry stay handleable at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const thought = (nodeId: string) => page.locator(`[data-thought-id="${nodeId}"]`);
    const selectThought = (nodeId: string) =>
      thought(nodeId).locator("[data-thought-text-id]").click();
    const tool = (name: string) =>
      page.getByRole("navigation", { name: "Editing tools" }).getByRole("button", { name, exact: true });

    await expect(page.getByRole("link", { name: "p to q home" })).toHaveText("[p → q]");
    await expect(page.getByText("Make thought matter.", { exact: true })).toBeVisible();
    await expect(thought(rootId)).toContainText(originalText);
    await expect(page.locator(".fixture-rail")).toContainText("fixtureAI adjustablev1v2v3");
    expect(await visibleIds(page)).toEqual([rootId]);
    await expect(page.locator(".spatial-thought")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(".matter-document svg")).toHaveCount(0);

    await selectThought(rootId);
    const rootBeforeGrowth = await thought(rootId).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    await tool("Extend related thought").click();
    const firstChildId = (await visibleIds(page))[1];
    if (firstChildId === undefined) throw new Error("first child missing");
    await selectThought(rootId);
    await tool("Extend related thought").click();
    const idsAfterTwoChildren = await visibleIds(page);
    const secondChildId = idsAfterTwoChildren[2];
    if (secondChildId === undefined) throw new Error("second child missing");

    const geometry = await readGeometry(page);
    expect(geometry[rootId]!.x).toBeCloseTo(rootBeforeGrowth.x, 0);
    expect(geometry[rootId]!.y).toBeCloseTo(rootBeforeGrowth.y, 0);
    expect(geometry[firstChildId]!.x).toBeGreaterThan(geometry[rootId]!.x);
    expect(Math.abs(geometry[rootId]!.y - geometry[firstChildId]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry[firstChildId]!.x - geometry[secondChildId]!.x)).toBeLessThanOrEqual(1);
    expect(geometry[secondChildId]!.y).toBeGreaterThan(geometry[firstChildId]!.bottom);

    await selectThought(rootId);
    await tool("Fold").click();
    expect(await visibleIds(page)).toEqual([rootId]);
    await tool("Unfold").click();

    await selectThought(firstChildId);
    await tool("Focus").click();
    await expect(page.locator("main[data-view=focus]")).toBeVisible();
    expect(await visibleIds(page)).toEqual([rootId, firstChildId]);
    await expect(tool("Extend related thought")).toBeDisabled();
    await tool("Show all").click();

    const panStart = {
      x: viewport.width * 0.48,
      y: viewport.height * 0.7,
    };
    const beforeFailedCapture = await readViewportAndGeometry(page);
    await page.evaluate(() => {
      const original = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function failCaptureOnce(pointerId) {
        Element.prototype.setPointerCapture = original;
        void pointerId;
        throw new DOMException("synthetic detached target", "InvalidStateError");
      };
    });
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 42, panStart.y + 31, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-dragging", "true");
    const afterFailedCapture = await readViewportAndGeometry(page);
    expect(afterFailedCapture.x).toBe(beforeFailedCapture.x);
    expect(afterFailedCapture.y).toBe(beforeFailedCapture.y);

    const beforePan = await readViewportAndGeometry(page);
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down();
    await page.mouse.move(panStart.x + 42, panStart.y + 31, { steps: 4 });
    await page.mouse.up();
    const afterPan = await readViewportAndGeometry(page);
    expect(afterPan.revision).toBe(beforePan.revision);
    expect(afterPan.x - beforePan.x).toBeCloseTo(42, 0);
    expect(afterPan.y - beforePan.y).toBeCloseTo(31, 0);
    expect(afterPan.nodes[rootId]!.x - beforePan.nodes[rootId]!.x).toBeCloseTo(42, 0);
    expect(afterPan.nodes[firstChildId]!.x - beforePan.nodes[firstChildId]!.x).toBeCloseTo(42, 0);

    const rootRectBeforeTextPan = await thought(rootId).boundingBox();
    if (rootRectBeforeTextPan === null) throw new Error("root is not visible");
    const textPanStart = {
      x: rootRectBeforeTextPan.x + rootRectBeforeTextPan.width * 0.5,
      y: rootRectBeforeTextPan.y + rootRectBeforeTextPan.height * 0.5,
    };
    const beforeTextPan = await readViewportAndGeometry(page);
    await page.mouse.move(textPanStart.x, textPanStart.y);
    await page.mouse.down();
    await page.mouse.move(textPanStart.x + 24, textPanStart.y + 18, { steps: 3 });
    await page.mouse.up();
    const afterTextPan = await readViewportAndGeometry(page);
    expect(afterTextPan.revision).toBe(beforeTextPan.revision);
    expect(afterTextPan.x - beforeTextPan.x).toBeCloseTo(24, 0);
    expect(afterTextPan.y - beforeTextPan.y).toBeCloseTo(18, 0);

    await page.locator("main.matter-shell").dispatchEvent("wheel", {
      clientX: viewport.width * 0.5,
      clientY: viewport.height * 0.45,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -120,
    });
    const afterZoom = await readViewportAndGeometry(page);
    expect(afterZoom.zoom).toBeGreaterThan(afterTextPan.zoom);
    await selectThought(rootId);
    await tool("Extend related thought").click();
    const idsAfterZoomGrowth = await visibleIds(page);
    const thirdChildId = idsAfterZoomGrowth[3];
    if (thirdChildId === undefined) throw new Error("third child missing");
    const zoomGeometry = await readGeometry(page);
    expect(Math.abs(zoomGeometry[firstChildId]!.x - zoomGeometry[thirdChildId]!.x)).toBeLessThanOrEqual(1);
    expect(zoomGeometry[thirdChildId]!.y).toBeGreaterThan(zoomGeometry[secondChildId]!.bottom);

    const v2 = page.getByRole("button", { name: "Apply v2 fixture version" });
    await v2.click();
    await expect(thought(rootId)).not.toContainText(originalText);
    await tool("Undo last change").click();
    await expect(thought(rootId)).toContainText(originalText);

    const railPosition = await page
      .getByRole("navigation", { name: "Editing tools" })
      .evaluate((rail) => {
        const rect = rail.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right };
      });
    if (viewport.name === "narrow") {
      expect(railPosition.bottom).toBeLessThanOrEqual(viewport.height);
      expect(railPosition.left).toBeGreaterThan(0);
      expect(railPosition.right).toBeLessThan(viewport.width);
    } else {
      expect(railPosition.right).toBeLessThanOrEqual(viewport.width);
      expect(railPosition.left).toBeGreaterThan(viewport.width - 120);
    }

    expect(browserErrors).toEqual([]);
  });
}

async function visibleIds(page: Page): Promise<string[]> {
  return page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id") ?? ""),
  );
}

async function readGeometry(page: Page) {
  return page.locator("[data-thought-id]").evaluateAll((nodes) =>
    Object.fromEntries(nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return [node.getAttribute("data-thought-id") ?? "", { x: rect.x, y: rect.y, bottom: rect.bottom }];
    })),
  );
}

async function readViewportAndGeometry(page: Page) {
  return page.locator("main.matter-shell").evaluate((main) => ({
    x: Number(main.getAttribute("data-viewport-x")),
    y: Number(main.getAttribute("data-viewport-y")),
    zoom: Number(main.getAttribute("data-viewport-zoom")),
    revision: Number(main.getAttribute("data-tree-revision")),
    nodes: Object.fromEntries(Array.from(main.querySelectorAll<HTMLElement>("[data-thought-id]")).map((node) => {
      const rect = node.getBoundingClientRect();
      return [node.dataset.thoughtId ?? "", { x: rect.x, y: rect.y }];
    })),
  }));
}
