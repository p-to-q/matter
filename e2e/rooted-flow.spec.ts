import { expect, test, type Locator, type Page } from "@playwright/test";

const rootId = "thought_fixture_root";
const originalText =
  "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`rooted material and geometry stay handleable at ${viewport.name} width`, async ({ page }) => {
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
    const guidance = page.locator(".matter-guidance[aria-label='Matter guidance']");
    await expect(guidance.locator(".matter-guidance__next"))
      .toHaveText("选择一段想法。");
    await expect(guidance.locator("p")).toHaveCount(1);
    await expect(guidance.locator("[aria-live]")).toHaveCount(0);
    await expectOneLineGuidance(guidance);
    await expect(thought(rootId)).toContainText(originalText);
    await expect(page.locator(".fixture-rail")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Apply v[123] fixture version/ })).toHaveCount(0);
    const initialIds = await visibleIds(page);
    expect(initialIds).toHaveLength(10);
    expect(initialIds[0]).toBe(rootId);
    await expect(thought(rootId)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(".spatial-thought svg")).toHaveCount(0);
    expect(await page.getByRole("navigation", { name: "Editing tools" }).locator("[data-tool-id]").evaluateAll(
      (buttons) => buttons.map((button) => button.getAttribute("data-tool-id")),
    )).toEqual(["voice", "lasso", "branch", "move", "undo"]);
    await expect(page.getByRole("navigation", { name: "Editing tools" }).getByRole("button", { name: "Focus" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Selected thought actions" })).toHaveCount(0);
    const ambientVideo = page.locator("video.matter-ambient__video");
    await expect(ambientVideo).toHaveCount(1);
    await expect(ambientVideo).toHaveCSS("object-fit", "cover");
    await expect.poll(() => ambientVideo.evaluate((video: HTMLVideoElement) => ({
      loop: video.loop,
      muted: video.muted,
      playbackRate: video.playbackRate,
      preload: video.preload,
      ready: video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      source: video.currentSrc,
      width: video.videoWidth,
    }))).toEqual({
      loop: true,
      muted: true,
      playbackRate: 0.72,
      preload: "none",
      ready: true,
      source: expect.stringContaining("/matter/matter-ui/shadows-loop."),
      width: 1280,
    });
    expect(await page.locator(".matter-header").evaluate(async (header) => {
      await document.fonts.ready;
      const family = getComputedStyle(header).fontFamily.split(",")[0] ?? "";
      return document.fonts.status === "loaded" && document.fonts.check(`12px ${family}`);
    })).toBe(true);
    const initialSurface = await page.locator(".matter-document").boundingBox();
    const initialRail = await page.getByRole("navigation", { name: "Editing tools" }).boundingBox();
    const initialRoot = await thought(rootId).boundingBox();
    if (initialSurface === null || initialRail === null || initialRoot === null) {
      throw new Error("workbench geometry is not visible");
    }
    if (viewport.name !== "laptop") {
      expect(initialSurface.x).toBeGreaterThan(0);
      expect(initialSurface.y).toBeGreaterThanOrEqual(60);
      expect(initialRoot.x + initialRoot.width).toBeLessThanOrEqual(initialRail.x);
      expect(await page.locator(".tool-rail__button").evaluateAll((buttons) =>
        buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width >= 48 && rect.height >= 48;
        }),
      )).toBe(true);
    } else {
      expect(initialSurface.x).toBeGreaterThan(300);
      expect(initialSurface.x + initialSurface.width).toBeLessThan(viewport.width);
      expect(initialRail.width).toBeCloseTo(60, 0);
      const voiceTool = page.locator('.tool-rail__button[data-tool-id="voice"]');
      await expect(voiceTool).toHaveCSS("width", "44px");
      await expect(voiceTool.locator("svg")).toHaveCSS("width", "20px");
      await voiceTool.hover();
      await expect.poll(() => voiceTool.evaluate((button) =>
        getComputedStyle(button, "::before").backgroundColor,
      )).toBe("rgb(245, 245, 242)");
    }

    await tool("Extend related thought").click();
    const defaultRootChildId = (await visibleIds(page)).at(-1);
    if (defaultRootChildId === undefined) throw new Error("default root child missing");
    expect(defaultRootChildId).not.toBe(rootId);
    await tool("Undo").click();
    await expect.poll(() => visibleIds(page)).toEqual(initialIds);

    await selectThought(rootId);
    await expect(guidance.locator(".matter-guidance__next"))
      .toHaveText("说话，让想法向下生长。");
    await expect(page.getByRole("navigation", { name: "Selected thought actions" })).toHaveCount(0);
    const rootBeforeGrowth = await thought(rootId).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    await tool("Extend related thought").click();
    const firstChildId = (await visibleIds(page)).at(-1);
    if (firstChildId === undefined) throw new Error("first child missing");
    await selectThought(rootId);
    await tool("Extend related thought").click();
    const idsAfterTwoChildren = await visibleIds(page);
    const secondChildId = idsAfterTwoChildren.at(-1);
    if (secondChildId === undefined) throw new Error("second child missing");

    const geometry = await readGeometry(page);
    const initialTreeBottom = Math.max(...initialIds.map((nodeId) => geometry[nodeId]!.bottom));
    expect(geometry[rootId]!.x).toBeCloseTo(rootBeforeGrowth.x, 0);
    expect(geometry[rootId]!.y).toBeCloseTo(rootBeforeGrowth.y, 0);
    expect(geometry[firstChildId]!.x).toBeGreaterThan(geometry[rootId]!.x);
    expect(geometry[firstChildId]!.y).toBeGreaterThan(initialTreeBottom);
    expect(Math.abs(geometry[firstChildId]!.x - geometry[secondChildId]!.x)).toBeLessThanOrEqual(1);
    expect(geometry[secondChildId]!.y).toBeGreaterThan(geometry[firstChildId]!.bottom);

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

    const textPanStart = await page.locator("[data-thought-text-id]").evaluateAll((buttons) => {
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const target = document.elementFromPoint(x, y);
        if (target?.closest("[data-thought-text-id]") === button) return { x, y };
      }
      return null;
    });
    if (textPanStart === null) throw new Error("no visible thought text is available for canvas drag");
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
    await expect.poll(async () => (await readViewportAndGeometry(page)).zoom)
      .toBeGreaterThan(afterTextPan.zoom);
    await selectThought(rootId);
    await tool("Extend related thought").click();
    const idsAfterZoomGrowth = await visibleIds(page);
    const thirdChildId = idsAfterZoomGrowth.at(-1);
    if (thirdChildId === undefined) throw new Error("third child missing");
    const zoomGeometry = await readGeometry(page);
    expect(Math.abs(zoomGeometry[firstChildId]!.x - zoomGeometry[thirdChildId]!.x)).toBeLessThanOrEqual(1);
    expect(zoomGeometry[thirdChildId]!.y).toBeGreaterThan(zoomGeometry[secondChildId]!.bottom);

    const railPosition = await page
      .getByRole("navigation", { name: "Editing tools" })
      .evaluate((rail) => {
        const rect = rail.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right };
      });
    if (viewport.name !== "laptop") {
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

test("compact workbench keeps material clear of coarse controls", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const surface = await page.locator(".matter-document").boundingBox();
  const root = await page.locator(`[data-thought-id="${rootId}"]`).boundingBox();
  const rail = await page.getByRole("navigation", { name: "Editing tools" }).boundingBox();
  if (surface === null || root === null || rail === null) {
    throw new Error("compact workbench geometry is not visible");
  }

  expect(surface.x).toBeGreaterThan(0);
  expect(surface.y).toBeGreaterThanOrEqual(60);
  expect(root.x + root.width).toBeLessThanOrEqual(rail.x);
  expect(rail.x + rail.width).toBeLessThanOrEqual(320);
  expect(await page.locator(".tool-rail__button").evaluateAll((buttons) =>
    buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width >= 48 && rect.height >= 48;
    }),
  )).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expectOneLineGuidance(page.locator(".matter-guidance"));
  await page.locator(`[data-thought-id="${rootId}"]`).locator("[data-thought-text-id]").click();
  await expect(page.getByRole("navigation", { name: "Selected thought actions" })).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

async function expectOneLineGuidance(guidance: Locator): Promise<void> {
  const receipt = await guidance.evaluate((element) => {
    const text = element.querySelector<HTMLElement>(".matter-guidance__next");
    if (text === null) throw new Error("guidance text missing");
    const style = getComputedStyle(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    const lineTops = new Set(
      Array.from(range.getClientRects(), (rect) => Math.round(rect.top * 10) / 10),
    );
    return {
      lineCount: lineTops.size,
      overflows: text.scrollWidth > element.clientWidth + 1,
      whiteSpace: style.whiteSpace,
    };
  });
  expect(receipt.whiteSpace).toBe("nowrap");
  expect(receipt.lineCount).toBe(1);
  expect(receipt.overflows).toBe(false);
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
