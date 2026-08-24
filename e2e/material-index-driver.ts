import { expect, type Locator, type Page } from "@playwright/test";
import { fixtureMaterialFilesToggleName } from "./matter-ui-copy";

/**
 * Selects material through the public index before a receipt exercises a
 * canvas-local action. The paper is deliberately not a scroll container, so
 * tests must not depend on Playwright's scrollIntoView side effect to move an
 * absolute material plane. On a narrow screen the drawer is opened and closed
 * through its real control; its camera projection remains the product path.
 */
export async function selectThoughtThroughMaterialIndex(
  page: Page,
  nodeId: string,
): Promise<void> {
  const narrow = await page.evaluate(() => matchMedia("(max-width: 959px)").matches);
  const sidebar = page.locator("aside.material-files");
  const toggle = page.getByRole("button", {
    name: fixtureMaterialFilesToggleName,
  }).first();

  if (narrow && await sidebar.getAttribute("data-open") !== "true") {
    await toggle.click();
    await expect(sidebar).toHaveAttribute("data-open", "true");
  }

  const row = sidebar.locator(`.material-file[data-node-id="${nodeId}"]`);
  await expect(row).toBeAttached();
  await row.locator(".material-file__open").click();
  await expect(page.locator(".matter-world")).not.toHaveAttribute(
    "data-camera-motion",
    "index",
  );
  await expect(page.locator(`[data-thought-id="${nodeId}"]`)).toHaveAttribute(
    "data-selected",
    "true",
  );

  if (narrow) {
    await toggle.click();
    await expect(sidebar).not.toHaveAttribute("data-open", "true");
    await expect.poll(() => page.locator(".matter-material-plane").evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      if (transform === "none") return 0;
      return new DOMMatrixReadOnly(transform).m41;
    })).toBeCloseTo(0, 1);
  }
}

/**
 * Moves the real pointer to an exposed part of a material control. This proves
 * the control is not wholly covered by fixed chrome while avoiding the
 * centre-point assumption built into Locator.hover().
 */
export async function hoverExposedMaterial(
  page: Page,
  target: Locator,
): Promise<void> {
  const point = await exposedMaterialPoint(target);
  await page.mouse.move(point.x, point.y);
}

export async function clickExposedMaterial(
  page: Page,
  target: Locator,
): Promise<void> {
  const point = await exposedMaterialPoint(target);
  await page.mouse.click(point.x, point.y);
}

async function exposedMaterialPoint(target: Locator): Promise<Readonly<{ x: number; y: number }>> {
  const point = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const paper = document.querySelector<HTMLElement>(".matter-document")?.getBoundingClientRect();
    const left = Math.max(rect.left, paper?.left ?? 0, 0);
    const right = Math.min(rect.right, paper?.right ?? innerWidth, innerWidth);
    const top = Math.max(rect.top, paper?.top ?? 0, 0);
    const bottom = Math.min(rect.bottom, paper?.bottom ?? innerHeight, innerHeight);
    if (right <= left || bottom <= top) return null;
    const xRatios = [.04, .2, .5, .8, .96];
    const yRatios = [.5, .25, .75];
    for (const yRatio of yRatios) {
      for (const xRatio of xRatios) {
        const x = left + (right - left) * xRatio;
        const y = top + (bottom - top) * yRatio;
        const hit = document.elementFromPoint(x, y);
        if (hit === element || (hit !== null && element.contains(hit))) {
          return { x, y };
        }
      }
    }
    return null;
  });
  if (point === null) throw new Error("material has no exposed pointer target");
  return point;
}
