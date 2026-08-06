import { expect, test } from "@playwright/test";

const SOURCE = "thought_fixture_imagined_time";
const ROOT = "thought_fixture_root";
const ORIGINAL_PARENT = "thought_fixture_imagined_lives";

test("selected material reparents by pointer while canvas pan remains an explicit mode", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1000 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const shell = page.locator("main.matter-shell");
  const source = page.locator(`[data-thought-id="${SOURCE}"]`);
  const root = page.locator(`[data-thought-id="${ROOT}"]`);
  await source.locator("[data-thought-text-id]").click();
  await expect(source).toHaveAttribute("data-selected", "true");
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);

  const move = page.getByRole("button", { name: "Canvas pan", exact: true });
  await move.click();
  await expect(page.locator('[data-tool-id="move"]')).toHaveAttribute("aria-pressed", "true");
  await expect(shell).toHaveAttribute("data-canvas-mode", "pan");
  const panBefore = Number(await shell.getAttribute("data-viewport-x"));
  const sourceBoxInPan = await source.boundingBox();
  if (sourceBoxInPan === null) throw new Error("source material is not visible");
  await page.mouse.move(sourceBoxInPan.x + 12, sourceBoxInPan.y + 12);
  await page.mouse.down();
  await page.mouse.move(sourceBoxInPan.x + 42, sourceBoxInPan.y + 12, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await shell.getAttribute("data-viewport-x"))).toBe(panBefore + 30);
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);

  await source.locator("[data-thought-text-id]").click();
  await expect(shell).toHaveAttribute("data-canvas-mode", "material");
  const sourceBox = await source.boundingBox();
  const rootBox = await root.boundingBox();
  if (sourceBox === null || rootBox === null) throw new Error("move endpoints are not visible");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(source).toHaveAttribute("data-parent-id", ROOT);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);
});
