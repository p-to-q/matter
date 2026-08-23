import { expect, test } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const SOURCE = "thought_fixture_imagined_time";
const ORIGINAL_PARENT = "thought_fixture_imagined_lives";
const ALIGN_PARENT = "thought_fixture_present_distance";
const DEEPER_PARENT = "thought_fixture_present_failure";
const DOCUMENT_ROOT = "matter_document_root_matter_fixture_rooted_01";
const ORIGINAL_SIBLING = "thought_fixture_imagined_relations";

test("selected material reparents by pointer while canvas pan remains an explicit mode", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1000 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const shell = page.locator("main.matter-shell");
  const source = page.locator(`[data-thought-id="${SOURCE}"]`);
  await source.locator("[data-thought-text-id]").click();
  await expect(source).toHaveAttribute("data-selected", "true");
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);

  const move = page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true });
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
  const documentBox = await page.locator(".matter-document").boundingBox();
  if (sourceBox === null || documentBox === null) throw new Error("move endpoints are not visible");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(documentBox.x + 80, documentBox.y + 90, { steps: 8 });
  await expect(source).toHaveAttribute("data-drag-source", "true");
  await expect(shell).toHaveAttribute("data-node-drop-mode", "top-level");
  await page.mouse.up();
  await expect(source).not.toHaveAttribute("data-parent-id", /.+/u);
  await expect(source).toHaveAttribute("data-tree-parent-id", DOCUMENT_ROOT);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange }).click();
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);

  const deeperParent = page.locator(`[data-thought-id="${DEEPER_PARENT}"]`);
  for (const cancellation of ["pointercancel", "lostpointercapture"] as const) {
    const cancelledSourceBox = await source.boundingBox();
    const cancelledTargetBox = await deeperParent.boundingBox();
    if (cancelledSourceBox === null || cancelledTargetBox === null) {
      throw new Error(`${cancellation} endpoints are not visible`);
    }
    await page.mouse.move(
      cancelledSourceBox.x + cancelledSourceBox.width / 2,
      cancelledSourceBox.y + cancelledSourceBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelledTargetBox.x + cancelledTargetBox.width / 2,
      cancelledTargetBox.y + cancelledTargetBox.height / 2,
      { steps: 8 },
    );
    await expect(source).toHaveAttribute("data-drag-source", "true");
    await expect(deeperParent).toHaveAttribute("data-drag-over", "nest");
    await shell.dispatchEvent(cancellation, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    // Synthetic cancellation does not release Playwright's physical mouse.
    await page.mouse.up();
    await expect(source).not.toHaveAttribute("data-drag-source", /.+/u);
    await expect(deeperParent).not.toHaveAttribute("data-drag-over", /.+/u);
    await expect(shell).not.toHaveAttribute("data-node-dragging", /.+/u);
    await expect(shell).not.toHaveAttribute("data-node-drop-mode", /.+/u);
    await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);
  }

  const restoredSourceBox = await source.boundingBox();
  const deeperParentBox = await deeperParent.boundingBox();
  if (restoredSourceBox === null || deeperParentBox === null) throw new Error("deeper move endpoints are not visible");
  await page.mouse.move(restoredSourceBox.x + restoredSourceBox.width / 2, restoredSourceBox.y + restoredSourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(deeperParentBox.x + deeperParentBox.width / 2, deeperParentBox.y + deeperParentBox.height + 20, { steps: 8 });
  await expect(deeperParent).toHaveAttribute("data-drag-over", "after");
  await expect(shell).toHaveAttribute("data-node-drop-mode", "after");
  await page.mouse.up();
  await expect(source).toHaveAttribute("data-parent-id", ALIGN_PARENT);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange }).click();
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);

  const sibling = page.locator(`[data-thought-id="${ORIGINAL_SIBLING}"]`);
  const orderSourceBox = await source.boundingBox();
  const siblingBox = await sibling.boundingBox();
  if (orderSourceBox === null || siblingBox === null) throw new Error("sibling reorder endpoints are not visible");
  expect(orderSourceBox.y).toBeLessThan(siblingBox.y);
  await page.mouse.move(orderSourceBox.x + orderSourceBox.width / 2, orderSourceBox.y + orderSourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(siblingBox.x + siblingBox.width / 2, siblingBox.y + siblingBox.height + 18, { steps: 8 });
  await expect(sibling).toHaveAttribute("data-drag-over", "after");
  await expect(shell).toHaveAttribute("data-node-drop-mode", "after");
  await page.mouse.up();
  await expect.poll(async () => (await source.boundingBox())?.y ?? 0).toBeGreaterThan((await sibling.boundingBox())?.y ?? 0);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange }).click();
  await expect.poll(async () => (await source.boundingBox())?.y ?? 0).toBeLessThan((await sibling.boundingBox())?.y ?? 0);

  const nestedSourceBox = await source.boundingBox();
  const nestedParentBox = await deeperParent.boundingBox();
  if (nestedSourceBox === null || nestedParentBox === null) throw new Error("nested move endpoints are not visible");
  await page.mouse.move(nestedSourceBox.x + nestedSourceBox.width / 2, nestedSourceBox.y + nestedSourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nestedParentBox.x + nestedParentBox.width / 2, nestedParentBox.y + nestedParentBox.height / 2, { steps: 8 });
  await expect(deeperParent).toHaveAttribute("data-drag-over", "nest");
  await expect(shell).toHaveAttribute("data-node-drop-mode", "nest");
  await page.mouse.up();
  await expect(source).toHaveAttribute("data-parent-id", DEEPER_PARENT);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange }).click();
  await expect(source).toHaveAttribute("data-parent-id", ORIGINAL_PARENT);
});

test("canvas title is independent material with pointer undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/matter");
  const titleButton = page.locator("button.material-files__context-title");
  const originalTitle = (await titleButton.textContent())?.trim();
  if (originalTitle === undefined || originalTitle.length === 0) {
    throw new Error("canvas title is not available");
  }
  const originalLabel = fixtureUiCopy.materialFiles.renameCanvas(originalTitle);
  await expect(titleButton).toHaveAccessibleName(originalLabel);

  await titleButton.click();
  const input = page.getByRole("textbox", { name: fixtureUiCopy.materialFiles.canvasTitle });
  await input.fill("Other possible lives");
  await input.press("Enter");
  await expect(page.getByRole("button", {
    name: fixtureUiCopy.materialFiles.renameCanvas("Other possible lives"),
  })).toBeVisible();

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange }).click();
  await expect(page.getByRole("button", { name: originalLabel })).toBeVisible();
});
