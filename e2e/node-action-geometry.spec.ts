import { expect, test, type Page } from "@playwright/test";
import { hoverExposedMaterial, selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const ROOT = "thought_fixture_root";
const CHILD = "thought_fixture_imagined_lives";
const PREFERENCES_KEY = "matter.canvas-preferences.v1";
const previewBranch = process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH === "true";

for (const surface of [
  { name: "desktop", viewport: { width: 1440, height: 900 }, hasTouch: false, target: 44 },
  { name: "compact", viewport: { width: 390, height: 844 }, hasTouch: false, target: 48 },
  { name: "coarse", viewport: { width: 1024, height: 768 }, hasTouch: true, target: 48 },
]) {
  test.describe(surface.name, () => {
    test.use({ viewport: surface.viewport, hasTouch: surface.hasTouch });

    test("local controls keep screen size and their fog stays behind material", async ({ page }) => {
      await page.addInitScript(({ key }) => {
        localStorage.setItem(key, JSON.stringify({
          version: 1, language: "zh-CN", leafFx: false, appearance: "light",
        }));
      }, { key: PREFERENCES_KEY });
      await page.goto("/matter");
      await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(surface.hasTouch);
      const beforeText = await page.locator("[data-thought-text-id]").allTextContents();

      for (const nodeId of [ROOT, CHILD]) {
        await selectThoughtThroughMaterialIndex(page, nodeId);
        for (const zoom of [1.25, 0.65]) {
          await zoomAroundPassage(page, nodeId, zoom);
          const lens = page.locator(`[data-node-action-lens][data-node-id="${nodeId}"]`);
          const fog = page.locator(`[data-node-action-fog][data-node-id="${nodeId}"]`);
          await expect(lens).toBeVisible();
          await expect(fog).toHaveCount(1);
          await expect(page.locator("[data-node-action-fog]")).toHaveCount(1);
          await expect(fog).toHaveAttribute("aria-hidden", "true");
          await expect(fog).toHaveCSS("pointer-events", "none");
          await expect(fog).toHaveCSS("opacity", "1");
          await expect(fog).toHaveAttribute("data-relation", (await lens.getAttribute("data-relation"))!);
          const receipt = await lens.evaluate((element) => {
            const fog = document.querySelector<HTMLElement>("[data-node-action-fog]")!;
            const world = document.querySelector<HTMLElement>(".matter-world")!;
            const material = document.querySelector<HTMLElement>(
              `[data-thought-text-id="${(element as HTMLElement).dataset.nodeId}"]`,
            )!;
            const range = document.createRange();
            range.selectNodeContents(material);
            const firstLineTop = Math.min(...Array.from(range.getClientRects())
              .filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => rect.top));
            const rect = (target: Element) => {
              const r = target.getBoundingClientRect();
              return { left: r.left, top: r.top, width: r.width, height: r.height };
            };
            return {
              buttons: Array.from(element.querySelectorAll("button"), (button) => rect(button)),
              fog: rect(fog),
              fogLayer: Number(getComputedStyle(fog).zIndex),
              overlap: Math.max(...Array.from(element.querySelectorAll("button"),
                (button) => button.getBoundingClientRect().bottom)) - firstLineTop,
              lens: rect(element),
              samePlane: fog.parentElement === world.parentElement && element.parentElement === world.parentElement,
              toolbarLayer: Number(getComputedStyle(element).zIndex),
              worldLayer: Number(getComputedStyle(world).zIndex),
            };
          });
          expect(receipt.samePlane).toBe(true);
          expect(receipt.fog).toEqual(receipt.lens);
          expect(receipt.fogLayer).toBeLessThan(receipt.worldLayer);
          expect(receipt.toolbarLayer).toBeGreaterThan(receipt.worldLayer);
          if (await lens.getAttribute("data-relation") === "corner") {
            expect(receipt.overlap).toBeGreaterThanOrEqual(5);
            expect(receipt.overlap).toBeLessThanOrEqual(7);
          }
          expect(receipt.buttons).toHaveLength(previewBranch ? 2 : 3);
          for (const button of receipt.buttons) {
            expect(button.width).toBe(surface.target);
            expect(button.height).toBe(surface.target);
          }
        }
      }

      // Actual page captures accompany the layer receipt; this is a candidate,
      // not a substitute for the owner's visual acceptance or other browsers.
      await test.info().attach(`${surface.name}-fixed-controls-light-candidate`, {
        body: await page.screenshot({ animations: "disabled", path: test.info().outputPath("fixed-controls-light.png") }),
        contentType: "image/png",
      });
      if (surface.name === "desktop") {
        const contextMark = page.locator("[data-node-action=set-aside]");
        await contextMark.hover();
        await expect(contextMark).toHaveCSS("color", "rgb(245, 245, 242)");
        await expect.poll(() => contextMark.evaluate((element) => getComputedStyle(element, "::before").opacity))
          .toBe("1");
        await test.info().attach("desktop-fixed-controls-context-hover-light-candidate", {
          body: await page.screenshot({ animations: "disabled", path: test.info().outputPath("context-hover-light.png") }),
          contentType: "image/png",
        });
        await page.locator('[data-chrome-control="appearance"]').click();
        await expect(page.locator(".matter-document")).toHaveAttribute("data-canvas-theme", "dark");
        await expect(page.locator("[data-node-action-lens]")).toBeVisible();
        await test.info().attach("desktop-fixed-controls-dark-candidate", {
          body: await page.screenshot({ animations: "disabled", path: test.info().outputPath("fixed-controls-dark.png") }),
          contentType: "image/png",
        });
        await page.locator('[data-chrome-control="fx"]').click();
        await expect(page.locator(".matter-document")).toHaveAttribute("data-leaf-fx", "on");
        // Use the native reduced-motion poster for a stable, actually decoded
        // atmosphere frame; an FX attribute alone is not paint evidence.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator("[data-matter-ambient]")).toHaveAttribute("data-presentation", "poster");
        expect(await page.locator(".matter-ambient__poster").evaluate(async (element) => {
          const background = getComputedStyle(element).backgroundImage;
          if (!background.startsWith('url("') || !background.endsWith('")')) return false;
          const image = new Image();
          image.src = background.slice(5, -2);
          await image.decode();
          return image.naturalWidth > 0;
        })).toBe(true);
        await hoverExposedMaterial(page, page.locator(`[data-thought-text-id="${CHILD}"]`));
        await contextMark.hover();
        await expect(page.locator("[data-node-action-lens]")).toBeVisible();
        await expect(contextMark).toHaveCSS("color", "rgb(32, 40, 49)");
        await expect.poll(() => contextMark.evaluate((element) => getComputedStyle(element, "::before").opacity))
          .toBe("1");
        await test.info().attach("desktop-fixed-controls-context-hover-dark-fx-candidate", {
          body: await page.screenshot({ animations: "disabled", path: test.info().outputPath("context-hover-dark-fx.png") }),
          contentType: "image/png",
        });
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
      await expect(page.locator("[data-node-action-fog]")).toHaveCount(0);
      expect(await page.locator("[data-thought-text-id]").allTextContents()).toEqual(beforeText);
    });
  });
}

async function zoomAroundPassage(page: Page, nodeId: string, target: number): Promise<void> {
  await page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan }).click();
  const shell = page.locator("main.matter-shell");
  const pivot = await page.locator(`[data-thought-text-id="${nodeId}"]`).evaluate((element) => {
    const r = element.getBoundingClientRect();
    const paper = document.querySelector(".matter-document")!.getBoundingClientRect();
    return {
      x: Math.max(paper.left + 24, Math.min(paper.right - 24, r.left + r.width / 2)),
      y: Math.max(paper.top + 90, Math.min(paper.bottom - 90, r.top)),
    };
  });
  for (let step = 0; step < 60; step += 1) {
    const zoom = Number(await shell.getAttribute("data-viewport-zoom"));
    if (Math.abs(zoom - target) / target < 0.05) break;
    await shell.dispatchEvent("wheel", {
      clientX: pivot.x, clientY: pivot.y, ctrlKey: true, deltaMode: 0,
      deltaY: zoom > target ? 40 : -40,
    });
    // Wheel policy consumes one frame at a time, rather than summing synthetic
    // events sent in the same frame; the zoom receipt is checked afterwards.
    await page.waitForTimeout(30);
  }
  await expect.poll(async () => Number(await shell.getAttribute("data-viewport-zoom")))
    .toBeGreaterThan(target * 0.95);
  await expect.poll(async () => Number(await shell.getAttribute("data-viewport-zoom")))
    .toBeLessThan(target * 1.05);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
}
