import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "compact-phone", width: 320, height: 720 },
]) {
  test(`Pan exposes one stable canonical zoom readout at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const shell = page.locator("main.matter-shell");
    const guidance = page.locator(".matter-guidance");
    const ordinaryGuidance = await guidance.locator(".matter-guidance__next").textContent();
    const move = page.getByRole("button", {
      name: fixtureUiCopy.toolRail.canvasPan,
      exact: true,
    });

    await move.click();
    await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
    await expect(guidance).toHaveAttribute("data-guidance-kind", "readout");
    await expect(guidance).toHaveAttribute("data-guidance-state", "canvas-zoom");

    const readout = guidance.locator("[data-canvas-zoom-value]");
    await expect(readout).toHaveText("100%");
    await expect(readout).toHaveAttribute("data-canvas-zoom-value", "100");
    await expect(guidance.locator("p")).toHaveCount(1);
    await expect(guidance.locator("[aria-live], [role=status]")).toHaveCount(0);

    const initial = await readReadout(readout);
    expect(initial.textAlign).toBe("end");
    expect(initial.fontVariantNumeric).toContain("tabular-nums");
    expect(initial.animationName).toBe("none");
    expect(initial.transitionDuration).toBe("0s");
    expect(initial.pointerEvents).toBe("none");
    expect(initial.lineHeight).toBe(viewport.width <= 767 ? "16px" : "20px");
    expect(initial.overflows).toBe(false);
    expect(initial.animations).toBe(0);
    await readout.evaluate((element) => {
      (element as HTMLElement).dataset.identityProbe = "stable";
    });

    await zoomToBoundary(page, -1_000_000);
    await expect.poll(() => readCanonicalPercent(shell)).toBe(180);
    await expect(readout).toHaveText("180%");
    await expect(readout).toHaveAttribute("data-canvas-zoom-value", "180");
    const maximum = await readReadout(readout);
    expectStableReadout(initial, maximum);

    await zoomToBoundary(page, 1_000_000);
    await expect.poll(() => readCanonicalPercent(shell)).toBe(60);
    await expect(readout).toHaveText("60%");
    await expect(readout).toHaveAttribute("data-canvas-zoom-value", "60");
    await expect(readout).toHaveAttribute("data-identity-probe", "stable");
    const minimum = await readReadout(readout);
    expectStableReadout(initial, minimum);
    expect(minimum.overflows).toBe(false);
    expect(minimum.animations).toBe(0);

    const railBox = await page.getByRole("navigation", {
      name: fixtureUiCopy.toolRail.editingTools,
    }).boundingBox();
    if (railBox === null) throw new Error("tool rail is not visible");
    expect(minimum.right).toBeLessThan(railBox.x - 8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

    await page.getByRole("button", {
      name: fixtureUiCopy.toolRail.exitCanvasPan,
      exact: true,
    }).click();
    await expect(shell).toHaveAttribute("data-canvas-mode", "material");
    await expect(guidance).not.toHaveAttribute("data-guidance-kind", "readout");
    await expect(guidance.locator(".matter-guidance__next")).toHaveText(ordinaryGuidance ?? "");

    await move.click();
    await expect(guidance.locator("[data-canvas-zoom-value]")).toHaveText("60%");
  });
}

async function zoomToBoundary(page: Page, deltaY: number): Promise<void> {
  await page.locator("main.matter-shell").dispatchEvent("wheel", {
    clientX: 180,
    clientY: 240,
    ctrlKey: true,
    deltaMode: 0,
    deltaX: 0,
    deltaY,
  });
}

async function readCanonicalPercent(shell: Locator): Promise<number> {
  const zoom = Number(await shell.getAttribute("data-viewport-zoom"));
  return Math.round(zoom * 100);
}

async function readReadout(readout: Locator) {
  return readout.evaluate((element, guidanceSelector) => {
    const guidanceElement = document.querySelector<HTMLElement>(guidanceSelector);
    if (guidanceElement === null) throw new Error("guidance is not visible");
    const rect = element.getBoundingClientRect();
    const textRange = document.createRange();
    textRange.selectNodeContents(element);
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      animations: element.getAnimations({ subtree: true }).length,
      fontVariantNumeric: style.fontVariantNumeric,
      height: rect.height,
      left: rect.left,
      lineHeight: style.lineHeight,
      overflows: textRange.getBoundingClientRect().width > rect.width + 1,
      pointerEvents: getComputedStyle(guidanceElement).pointerEvents,
      right: rect.right,
      textAlign: style.textAlign,
      transitionDuration: style.transitionDuration,
      width: rect.width,
    };
  }, ".matter-guidance");
}

function expectStableReadout(
  initial: Awaited<ReturnType<typeof readReadout>>,
  current: Awaited<ReturnType<typeof readReadout>>,
): void {
  expect(current.left).toBeCloseTo(initial.left, 1);
  expect(current.right).toBeCloseTo(initial.right, 1);
  expect(current.width).toBeCloseTo(initial.width, 1);
  expect(current.height).toBeCloseTo(initial.height, 1);
  expect(current.lineHeight).toBe(initial.lineHeight);
}
