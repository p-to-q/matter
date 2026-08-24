import { expect, test, type Page } from "@playwright/test";
import {
  hoverExposedMaterial,
  selectThoughtThroughMaterialIndex,
} from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";
import { CORNER_GLYPH_DESCENT } from "../features/matter/components/node-handle-position";

const PREFERENCES_KEY = "matter.canvas-preferences.v1";
const ROOT_ID = "thought_fixture_root";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800, cell: { width: "636px", height: "196px" }, column: { width: "520px", gap: "116px" }, horizontalInset: 50, lens: { width: 118, height: 66 } },
  { name: "narrow", width: 390, height: 844, cell: { width: "344px", height: "172px" }, column: { width: "280px", gap: "64px" }, horizontalInset: 24, lens: { width: 126, height: 70 } },
]) {
  test(`structural paper and one local action lens remain bounded at ${viewport.name}`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.addInitScript(({ key }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        language: "zh-CN",
        leafFx: false,
        appearance: "light",
      }));
    }, { key: PREFERENCES_KEY });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const ruling = page.locator("[data-canvas-ruling='structural']");
    const root = page.locator(`[data-thought-id="${ROOT_ID}"]`);
    const rootText = root.locator("[data-thought-text-id]");
    await expect(ruling).toHaveCount(1);
    await expect(ruling).toHaveAttribute("data-active", "true");
    await expect(ruling).toHaveCSS("pointer-events", "none");
    await expect(ruling).toHaveCSS("opacity", "0.16");
    const rulingStyle = await ruling.evaluate((element) => {
      const style = getComputedStyle(element);
      const pattern = element.querySelector("pattern");
      const paths = Array.from(element.querySelectorAll<SVGPathElement>("path"));
      if (pattern === null || paths.length !== 2) return null;
      const [vertical, horizontal] = paths;
      const box = (path: SVGPathElement) => {
        const bounds = path.getBBox();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      };
      const count = (path: SVGPathElement, command: string) =>
        (path.getAttribute("d") ?? "").split(" ").filter((token) => token === command).length;
      return {
        animationDuration: style.animationDuration,
        animationName: style.animationName,
        cellHeight: Number.parseFloat(style.getPropertyValue("--canvas-ruling-cell-height")),
        cellWidth: Number.parseFloat(style.getPropertyValue("--canvas-ruling-cell-width")),
        curveTensions: paths.map((path) => Number(path.dataset.curveTension)),
        dash: Number.parseFloat(style.getPropertyValue("--canvas-ruling-dash")),
        fills: paths.map((path) => path.getAttribute("fill")),
        horizontalBox: box(horizontal),
        horizontalCloseCount: count(horizontal, "Z"),
        horizontalDashCount: Number(horizontal.dataset.dashCount),
        horizontalGap: Number.parseFloat(style.getPropertyValue("--canvas-ruling-horizontal-gap")),
        intersectionClearance: Number.parseFloat(style.getPropertyValue("--canvas-ruling-intersection-clearance")),
        lineWidth: Number.parseFloat(style.getPropertyValue("--canvas-ruling-line-width")),
        patternHeight: Number(pattern.getAttribute("height")),
        patternWidth: Number(pattern.getAttribute("width")),
        strokes: paths.map((path) => path.getAttribute("stroke")),
        strokeDasharrays: paths.map((path) => path.getAttribute("stroke-dasharray")),
        strokeLinecaps: paths.map((path) => path.getAttribute("stroke-linecap")),
        verticalBox: box(vertical),
        verticalCloseCount: count(vertical, "Z"),
        verticalDashCount: Number(vertical.dataset.dashCount),
        verticalGap: Number.parseFloat(style.getPropertyValue("--canvas-ruling-vertical-gap")),
      };
    });
    expect(rulingStyle).not.toBeNull();
    expect(rulingStyle!.cellHeight).toBe(Number.parseFloat(viewport.cell.height));
    expect(rulingStyle!.cellWidth).toBe(Number.parseFloat(viewport.cell.width));
    expect(rulingStyle!.patternHeight).toBe(rulingStyle!.cellHeight);
    expect(rulingStyle!.patternWidth).toBe(rulingStyle!.cellWidth);
    expect(rulingStyle!.dash).toBe(6);
    expect(rulingStyle!.lineWidth).toBe(1.4);
    expect(rulingStyle!.curveTensions).toEqual([0.72, 0.72]);
    expect(rulingStyle!.fills).toEqual([
      "var(--canvas-ruling-line)",
      "var(--canvas-ruling-line)",
    ]);
    expect(rulingStyle!.strokes).toEqual([null, null]);
    expect(rulingStyle!.strokeDasharrays).toEqual([null, null]);
    expect(rulingStyle!.strokeLinecaps).toEqual([null, null]);
    expect(rulingStyle!.horizontalCloseCount).toBe(rulingStyle!.horizontalDashCount);
    expect(rulingStyle!.verticalCloseCount).toBe(rulingStyle!.verticalDashCount);
    expect(rulingStyle!.horizontalBox.height).toBeCloseTo(rulingStyle!.lineWidth, 3);
    expect(rulingStyle!.verticalBox.width).toBeCloseTo(rulingStyle!.lineWidth, 3);
    expect(rulingStyle!.horizontalBox.x - rulingStyle!.lineWidth / 2)
      .toBeCloseTo(rulingStyle!.intersectionClearance, 1);
    expect(rulingStyle!.cellWidth - rulingStyle!.horizontalBox.x - rulingStyle!.horizontalBox.width + rulingStyle!.lineWidth / 2)
      .toBeCloseTo(rulingStyle!.intersectionClearance, 1);
    expect(rulingStyle!.verticalBox.y - rulingStyle!.lineWidth / 2)
      .toBeCloseTo(rulingStyle!.intersectionClearance, 1);
    expect(rulingStyle!.cellHeight - rulingStyle!.verticalBox.y - rulingStyle!.verticalBox.height + rulingStyle!.lineWidth / 2)
      .toBeCloseTo(rulingStyle!.intersectionClearance, 1);
    expect(rulingStyle!.animationName).toBe("canvas-ruling-arrive");
    expect(rulingStyle!.animationDuration).toBe("0.3s");
    expect(await page.locator(".matter-canvas").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        gap: style.getPropertyValue("--matter-column-gap").trim(),
        width: style.getPropertyValue("--matter-column-width").trim(),
      };
    })).toEqual(viewport.column);

    const rulingGeometry = await page.evaluate(({ rootId }) => {
      const rulingElement = document.querySelector<HTMLElement>("[data-canvas-ruling]");
      const rootElement = document.querySelector<HTMLElement>(`[data-thought-text-id="${rootId}"]`);
      const paperElement = document.querySelector<HTMLElement>(".matter-document");
      if (rulingElement === null || rootElement === null || paperElement === null) return null;
      const style = getComputedStyle(rulingElement);
      const rootRect = rootElement.getBoundingClientRect();
      const paperRect = paperElement.getBoundingClientRect();
      const cellWidth = Number.parseFloat(style.getPropertyValue("--canvas-ruling-cell-width"));
      const cellHeight = Number.parseFloat(style.getPropertyValue("--canvas-ruling-cell-height"));
      const originX = Number.parseFloat(style.getPropertyValue("--canvas-ruling-origin-x"));
      const originY = Number.parseFloat(style.getPropertyValue("--canvas-ruling-origin-y"));
      const modulo = (value: number, step: number) => ((value % step) + step) % step;
      const leftInset = modulo(rootRect.left - paperRect.left - originX, cellWidth);
      const topInset = modulo(rootRect.top - paperRect.top - originY, cellHeight);
      return {
        bottomInset: cellHeight - topInset - rootRect.height,
        leftInset,
        rightInset: cellWidth - leftInset - rootRect.width,
        topInset,
      };
    }, { rootId: ROOT_ID });
    expect(rulingGeometry).not.toBeNull();
    expect(rulingGeometry!.leftInset).toBeGreaterThanOrEqual(viewport.horizontalInset);
    expect(rulingGeometry!.rightInset).toBeGreaterThanOrEqual(viewport.horizontalInset);
    expect(rulingGeometry!.topInset).toBeGreaterThanOrEqual(6);
    expect(rulingGeometry!.bottomInset).toBeGreaterThanOrEqual(4);

    if (viewport.name === "narrow") await rootText.click();
    else await rootText.hover();
    const lens = page.getByRole("toolbar", { name: "Thought context" });
    await expect(lens).toBeVisible();
    await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
    await expect(lens).toHaveAttribute("aria-orientation", "horizontal");
    await expect(lens).toHaveAttribute("data-relation", "corner");
    await expect(lens.getByRole("button")).toHaveCount(2);
    const rewriteMaterial = lens.getByRole("button", { name: "Rewrite this material with AI" });
    await expect(rewriteMaterial).toBeVisible();
    await expect(rewriteMaterial).toBeEnabled();
    await expect(lens.getByRole("button", { name: "Set this material branch aside" })).toBeVisible();
    const expectedTarget = viewport.name === "narrow" ? 48 : 44;
    expect(await lens.getByRole("button").evaluateAll((buttons, target) => buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return Math.round(rect.width) === target && Math.round(rect.height) === target;
    }), expectedTarget)).toBe(true);
    expect(await lens.evaluate((element) => {
      const lensRect = element.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll("button"), (button) => button.getBoundingClientRect());
      return {
        width: Math.round(lensRect.width),
        height: Math.round(lensRect.height),
        centers: buttons.map((button) => ({
          x: Math.round((button.left + button.width / 2 - lensRect.left) * 10) / 10,
          y: Math.round((button.top + button.height / 2 - lensRect.top) * 10) / 10,
        })),
      };
    })).toEqual({
      ...viewport.lens,
      centers: viewport.name === "narrow"
        ? [{ x: 36, y: 35 }, { x: 90, y: 35 }]
        : [{ x: 34, y: 33 }, { x: 84, y: 33 }],
    });
    expect(await lensBoundsAreLawful(page)).toBe(true);
    expect(await lens.evaluate((element) => getComputedStyle(element, "::before").backdropFilter))
      .toContain("blur(28px)");
    expect(await lens.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return {
        bottom: style.bottom,
        contactSize: style.maskSize.split(",").at(-1)?.trim(),
        contactIsUniform: style.maskImage.includes("linear-gradient"),
        coreIsStable: style.maskImage.includes("58%"),
        left: style.left,
        masked: style.maskImage !== "none",
        maskSubtractsUniformRegion: style.maskComposite.split(",")
          .every((operation) => operation.trim() === "subtract"),
        pointerEvents: style.pointerEvents,
        right: style.right,
        top: style.top,
      };
    })).toEqual({
      bottom: "-12px",
      contactSize: viewport.name === "narrow" ? "24px 24px" : "22px 22px",
      contactIsUniform: true,
      coreIsStable: true,
      left: "-16px",
      masked: true,
      maskSubtractsUniformRegion: true,
      pointerEvents: "none",
      right: "-16px",
      top: "-12px",
    });
    // How far the field may descend is owned by lensBoundsAreLawful above;
    // restating it here would give one rule two definitions to drift between.
    expect(await page.evaluate((rootId) => {
      const text = document.querySelector<HTMLElement>(`[data-thought-text-id="${rootId}"]`);
      const field = document.querySelector<HTMLElement>("[data-node-action-lens]");
      if (text === null || field === null) return false;
      return field.getBoundingClientRect().left <= text.getBoundingClientRect().left;
    }, ROOT_ID)).toBe(true);

    await rewriteMaterial.click();
    const pointTalk = page.locator(".point-talk");
    await expect(pointTalk).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pointTalk).toBeHidden();
    await rootText.hover();
    await lens.getByRole("button", { name: "Set this material branch aside" }).click();
    await expect(page.locator(`[data-thought-id="${ROOT_ID}"]`)).toHaveAttribute("data-context-excluded", "true");
    await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
    await rootText.hover({ force: true });
    await expect(lens.getByRole("button", { name: "Include this material branch" })).toBeVisible();
    await lens.getByRole("button", { name: "Include this material branch" }).click();
    await expect(page.locator(`[data-thought-id="${ROOT_ID}"]`)).not.toHaveAttribute("data-context-excluded", "true");

    await rootText.hover();
    await expect(lens).toBeVisible();
    await page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage }).click();
    await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
    await page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.exitLanguageSelection }).click();

    if (viewport.name === "laptop") {
      await page.locator('[data-chrome-control="appearance"]').click();
      await expect(page.locator(".matter-document")).toHaveAttribute("data-canvas-theme", "dark");
      await expect(ruling).toHaveCSS("opacity", "0.13");
      await rootText.hover();
      await expect(lens).toBeVisible();
      await expect(lens).toHaveCSS("color", "rgb(243, 244, 241)");
      expect(await lens.evaluate((element) => getComputedStyle(element, "::before").backdropFilter))
        .toContain("blur(28px)");
      await page.locator('[data-chrome-control="fx"]').click();
      await expect(ruling).not.toHaveAttribute("data-active", "true");
      await expect(ruling).toHaveCSS("opacity", "0");
      await expect(page.locator("[data-matter-ambient='leaf-shadows']")).toHaveAttribute("data-fx", "on");
    }

    expect(browserErrors).toEqual([]);
  });
}

test("the ruling entry breath yields to reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      language: "zh-CN",
      leafFx: false,
      appearance: "light",
    }));
  }, { key: PREFERENCES_KEY });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  const ruling = page.locator("[data-canvas-ruling='structural']");
  await expect(ruling).toHaveAttribute("data-active", "true");
  await expect(ruling).toHaveCSS("animation-duration", "0.001s");
  await expect(ruling).toHaveCSS("animation-iteration-count", "1");
  await expect(ruling).toHaveCSS("opacity", "0.16");
});

test("the action fog becomes one system capsule in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, language: "zh-CN", leafFx: false, appearance: "light" }));
  }, { key: PREFERENCES_KEY });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`).hover();
  const lens = page.getByRole("toolbar", { name: "Thought context" });
  await expect(lens).toBeVisible();
  expect(await lens.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return style.content !== "none" && style.borderTopWidth === "1px" && style.backdropFilter === "none";
  })).toBe(true);
  await expect(lens).toHaveCSS("animation-duration", "0.001s");
  await expect(lens.getByRole("button")).toHaveCount(2);
});

test("the action lens is hoverable across its clear gap and yields to pan and chrome overlays", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, language: "zh-CN", leafFx: false, appearance: "light" }));
  }, { key: PREFERENCES_KEY });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const rootText = page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`);
  const lens = page.getByRole("toolbar", { name: "Thought context" });
  await rootText.hover();
  await expect(lens).toBeVisible();
  const textBox = await rootText.boundingBox();
  const lensBox = await lens.boundingBox();
  if (textBox === null || lensBox === null) throw new Error("thought and action lens must be measurable");
  const gapPoint = nearestGapPoint(textBox, lensBox);
  await page.mouse.move(gapPoint.x, gapPoint.y);
  await page.waitForTimeout(80);
  await page.mouse.move(lensBox.x + lensBox.width / 2, lensBox.y + lensBox.height / 2);
  await expect(lens).toBeVisible();

  const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
  await pan.click();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  const beforePan = await rulingCameraReceipt(page);
  const paper = await page.locator(".matter-document").boundingBox();
  if (paper === null) throw new Error("paper must be measurable");
  await page.mouse.move(paper.x + paper.width * .46, paper.y + paper.height * .7);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * .46 + 64, paper.y + paper.height * .7 + 38);
  await page.mouse.up();
  const afterPan = await rulingCameraReceipt(page);
  expect(afterPan.viewportX - beforePan.viewportX).toBeCloseTo(64, 0);
  expect(afterPan.viewportY - beforePan.viewportY).toBeCloseTo(38, 0);
  expect(afterPan.originX - beforePan.originX)
    .toBeCloseTo(afterPan.viewportX - beforePan.viewportX, 1);
  expect(afterPan.originY - beforePan.originY)
    .toBeCloseTo(afterPan.viewportY - beforePan.viewportY, 1);
  expect(afterPan.patternOriginX)
    .toBeCloseTo(positiveModulo(afterPan.originX, afterPan.cellWidth), 1);
  expect(afterPan.patternOriginY)
    .toBeCloseTo(positiveModulo(afterPan.originY, afterPan.cellHeight), 1);
  expect(afterPan.screenCadence).toEqual(beforePan.screenCadence);
  expect(afterPan.paths).toEqual(beforePan.paths);
  expect(afterPan.cellWidth).toBeCloseTo(beforePan.cellWidth, 4);
  expect(afterPan.cellHeight).toBeCloseTo(beforePan.cellHeight, 4);

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await rootText.hover();
  await expect(lens).toBeVisible();

  await page.locator('[data-chrome-control="settings"]').click();
  await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "settings");
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await rootText.hover();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "none");
  await page.mouse.move(0, 0);
  await rootText.focus();
  await expect(lens).toBeVisible();
});

test("zoom scales one world ruling around the paper-local pointer pivot", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, language: "zh-CN", leafFx: false, appearance: "light" }));
  }, { key: PREFERENCES_KEY });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan }).click();

  const beforeZoom = await rulingCameraReceipt(page);
  const surfacePivot = await page.locator(".matter-document").evaluate((paper) => {
    const bounds = paper.getBoundingClientRect();
    return {
      x: 640 - bounds.left - paper.clientLeft,
      y: 400 - bounds.top - paper.clientTop,
    };
  });
  await page.locator("main.matter-shell").dispatchEvent("wheel", {
    clientX: 640,
    clientY: 400,
    ctrlKey: true,
    deltaMode: 0,
    deltaY: -120,
  });
  await expect.poll(async () => (await rulingCameraReceipt(page)).viewportZoom)
    .toBeGreaterThan(beforeZoom.viewportZoom);
  const afterZoom = await rulingCameraReceipt(page);
  const zoomRatio = afterZoom.viewportZoom / beforeZoom.viewportZoom;
  expect(afterZoom.cellWidth / beforeZoom.cellWidth).toBeCloseTo(zoomRatio, 3);
  expect(afterZoom.cellHeight / beforeZoom.cellHeight).toBeCloseTo(zoomRatio, 3);
  expect(afterZoom.worldRhythm.dash / beforeZoom.worldRhythm.dash).toBeCloseTo(zoomRatio, 3);
  expect(afterZoom.worldRhythm.clearance / beforeZoom.worldRhythm.clearance).toBeCloseTo(zoomRatio, 3);
  expect(afterZoom.screenThickness).toBe(beforeZoom.screenThickness);
  expect(afterZoom.paths).not.toEqual(beforeZoom.paths);
  expect(afterZoom.patternOriginX)
    .toBeCloseTo(positiveModulo(afterZoom.originX, afterZoom.cellWidth), 3);
  expect(afterZoom.patternOriginY)
    .toBeCloseTo(positiveModulo(afterZoom.originY, afterZoom.cellHeight), 3);
  expect((surfacePivot.x - afterZoom.viewportX) / afterZoom.viewportZoom)
    .toBeCloseTo((surfacePivot.x - beforeZoom.viewportX) / beforeZoom.viewportZoom, 3);
  expect((surfacePivot.y - afterZoom.viewportY) / afterZoom.viewportZoom)
    .toBeCloseTo((surfacePivot.y - beforeZoom.viewportY) / beforeZoom.viewportZoom, 3);
});

test("the action lens has one direct keyboard path and restores the thought focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const rootText = page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`);
  const lens = page.getByRole("toolbar", { name: "Thought context" });
  const rewriteMaterial = lens.getByRole("button", { name: "Rewrite this material with AI" });
  const setAside = lens.getByRole("button", { name: "Set this material branch aside" });
  await page.waitForTimeout(100);
  await rootText.focus();
  await expect(rootText).toBeFocused();
  await expect(lens).toBeVisible();
  await rootText.press("ArrowRight");
  await expect(rewriteMaterial).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(setAside).toBeFocused();
  await page.keyboard.press("End");
  await expect(setAside).toBeFocused();
  await page.keyboard.press("Home");
  await expect(rewriteMaterial).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(rootText).toBeFocused();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
});

test("a held root exposes only local recovery", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const heldRow = page.locator("aside.material-files .material-file").nth(1);
  const heldId = await heldRow.getAttribute("data-node-id");
  if (heldId === null) throw new Error("fixture held-aside branch is missing");
  const heldThought = page.locator(`[data-thought-id="${heldId}"]`);
  const heldText = heldThought.locator("[data-thought-text-id]");
  await selectThoughtThroughMaterialIndex(page, heldId);
  await heldText.hover();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
  await heldRow.hover();
  await heldRow.locator(".material-file__context-control--set-aside").click();
  await expect(heldThought).toHaveAttribute("data-context-excluded", "true");
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await heldText.hover({ force: true });
  const lens = page.getByRole("toolbar", { name: "Thought context" });
  await expect(lens.getByRole("button", { name: "Include this material branch" })).toBeVisible();
  await expect(lens.getByRole("button", { name: "Rewrite this material with AI" })).toBeDisabled();
});

test.describe("coarse pointer action lens", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("uses selection rather than hover and retains the 48px target floor", async ({ page }) => {
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const rootText = page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`);
    await rootText.tap();
    const lens = page.getByRole("toolbar", { name: "Thought context" });
    await expect(lens).toBeVisible();
    expect(await lens.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    })).toEqual({ width: 126, height: 70 });
    expect(await lens.locator("button").evaluateAll((buttons) => buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return Math.round(rect.width) === 48 && Math.round(rect.height) === 48;
    }))).toBe(true);
  });
});

test("the 2,000-node canvas still mounts one ruling and one delegated action lens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  await expect(page.locator("[data-thought-id]")).toHaveCount(2_000);
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("[data-canvas-ruling]")).toHaveCount(1);
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);

  const first = page.locator('[data-thought-id="perf_thought_0000"] [data-thought-text-id]');
  const next = page.locator('[data-thought-id="perf_thought_0001"] [data-thought-text-id]');
  await hoverExposedMaterial(page, first);
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
  await expect(page.locator("[data-node-action-lens] button")).toHaveCount(2);
  await expect(page.locator("[data-node-action-lens]")).toHaveAttribute("data-node-id", "perf_thought_0000");
  await hoverExposedMaterial(page, next);
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
  await expect(page.locator("[data-node-action-lens]")).toHaveAttribute("data-node-id", "perf_thought_0001");
});

/**
 * The glyphs rest on the first line by at most CORNER_GLYPH_DESCENT while the
 * field clears the paper inset, the rail and the guidance line entirely. Fog
 * is decorative overflow and yields at the separately measured corner.
 */
async function lensBoundsAreLawful(page: Page): Promise<boolean> {
  return page.evaluate(({ rootId, descent }) => {
    const lens = document.querySelector<HTMLElement>("[data-node-action-lens]");
    const text = document.querySelector<HTMLElement>(`[data-thought-text-id="${rootId}"]`);
    const paper = document.querySelector<HTMLElement>(".matter-document");
    const rail = document.querySelector<HTMLElement>(".tool-rail");
    const guidance = document.querySelector<HTMLElement>(".matter-guidance");
    if (lens === null || text === null || paper === null || rail === null || guidance === null) return false;
    const lensRect = lens.getBoundingClientRect();
    const paperRect = paper.getBoundingClientRect();
    // The placement rule measures the first line's ink, not the element box:
    // comparing against the box would add the line's leading to the descent.
    const range = document.createRange();
    range.selectNodeContents(text);
    const fragments = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    const inkTop = fragments.length === 0
      ? text.getBoundingClientRect().top
      : Math.min(...fragments.map((rect) => rect.top));
    const inkLeft = fragments.length === 0
      ? text.getBoundingClientRect().left
      : Math.min(...fragments.filter((rect) => Math.abs(rect.top - inkTop) <= 2).map((rect) => rect.left));
    const lensStyle = getComputedStyle(lens);
    const materialCornerX = Number.parseFloat(lensStyle.getPropertyValue("--lens-material-x"));
    const materialCornerY = Number.parseFloat(lensStyle.getPropertyValue("--lens-material-y"));
    const overlaps = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return lensRect.left < rect.right && lensRect.right > rect.left &&
        lensRect.top < rect.bottom && lensRect.bottom > rect.top;
    };
    // The bound belongs to the glyphs. The fog descends further by design; it
    // is translucent and the text stays exact underneath.
    const glyphBottom = Math.max(...Array.from(lens.querySelectorAll("button"))
      .map((button) => button.getBoundingClientRect().bottom));
    const descentOntoMaterial = glyphBottom - inkTop;
    return lensRect.left >= paperRect.left + 12 && lensRect.right <= paperRect.right - 12 &&
      lensRect.top >= paperRect.top + 12 && lensRect.bottom <= paperRect.bottom - 12 &&
      // Rounded: the ink measurement is sub-pixel and the bound is a design
      // limit, not a rasteriser guarantee.
      Math.round(descentOntoMaterial) > 0 && Math.round(descentOntoMaterial) <= descent + 1 &&
      Math.abs(lensRect.left + materialCornerX - inkLeft) <= 2 &&
      Math.abs(lensRect.top + materialCornerY - inkTop) <= 2 &&
      lensRect.bottom > inkTop &&
      !overlaps(rail) && !overlaps(guidance);
  }, { rootId: ROOT_ID, descent: CORNER_GLYPH_DESCENT });
}

async function rulingCameraReceipt(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>("main.matter-shell");
    const ruling = document.querySelector<HTMLElement>("[data-canvas-ruling]");
    if (shell === null || ruling === null) throw new Error("camera receipt requires shell and ruling");
    const style = getComputedStyle(ruling);
    const pattern = ruling.querySelector("pattern");
    const paths = Array.from(ruling.querySelectorAll<SVGPathElement>("path"));
    if (pattern === null || paths.length !== 2) throw new Error("ruling pattern must be measurable");
    const lineWidth = Number.parseFloat(style.getPropertyValue("--canvas-ruling-line-width"));
    return {
      cellHeight: Number.parseFloat(style.getPropertyValue("--canvas-ruling-cell-height")),
      cellWidth: Number.parseFloat(style.getPropertyValue("--canvas-ruling-cell-width")),
      originX: Number.parseFloat(style.getPropertyValue("--canvas-ruling-origin-x")),
      originY: Number.parseFloat(style.getPropertyValue("--canvas-ruling-origin-y")),
      patternOriginX: Number(pattern.getAttribute("x")) + lineWidth / 2,
      patternOriginY: Number(pattern.getAttribute("y")) + lineWidth / 2,
      paths: paths.map((path) => path.getAttribute("d")),
      screenThickness: lineWidth,
      screenCadence: {
        curveTension: paths.map((path) => Number(path.dataset.curveTension)),
        lineWidth,
      },
      worldRhythm: {
        clearance: Number.parseFloat(style.getPropertyValue("--canvas-ruling-intersection-clearance")),
        dash: Number.parseFloat(style.getPropertyValue("--canvas-ruling-dash")),
      },
      viewportX: Number.parseFloat(shell.dataset.viewportX ?? "NaN"),
      viewportY: Number.parseFloat(shell.dataset.viewportY ?? "NaN"),
      viewportZoom: Number.parseFloat(shell.dataset.viewportZoom ?? "NaN"),
    };
  });
}

function positiveModulo(value: number, step: number): number {
  return ((value % step) + step) % step;
}

function nearestGapPoint(
  text: Readonly<{ x: number; y: number; width: number; height: number }>,
  lens: Readonly<{ x: number; y: number; width: number; height: number }>,
) {
  const textRight = text.x + text.width;
  const textBottom = text.y + text.height;
  const lensRight = lens.x + lens.width;
  const lensBottom = lens.y + lens.height;
  if (lens.x >= textRight) return { x: (textRight + lens.x) / 2, y: lens.y + lens.height / 2 };
  if (lensRight <= text.x) return { x: (lensRight + text.x) / 2, y: lens.y + lens.height / 2 };
  if (lens.y >= textBottom) return { x: lens.x + lens.width / 2, y: (textBottom + lens.y) / 2 };
  return { x: lens.x + lens.width / 2, y: (lensBottom + text.y) / 2 };
}
