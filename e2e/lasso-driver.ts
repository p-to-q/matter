import { expect, type Page } from "@playwright/test";

/**
 * Waits for the geometry epoch exposed after Lasso's own UI is mounted.
 * Font settlement may invalidate the fallback layout and deliberately revoke
 * any stroke that crosses that boundary, so range probes must be read only
 * after the replacement layout has had its two rendering frames.
 */
export async function settleLassoGeometry(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
}
