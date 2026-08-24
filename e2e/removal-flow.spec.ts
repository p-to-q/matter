import { expect, test } from "@playwright/test";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const rootId = "thought_fixture_root";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`Delete removes a selected non-root thought and Undo restores it at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const root = page.locator(`[data-thought-id="${rootId}"]`);
    await root.locator("[data-thought-text-id]").click();
    const before = await page.locator("[data-thought-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-thought-id")),
    );
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
    const after = await page.locator("[data-thought-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-thought-id")),
    );
    const childId = after.find((nodeId) => nodeId !== null && !before.includes(nodeId));
    if (childId === undefined || childId === null) throw new Error("fixture child was not created");
    const child = page.locator(`[data-thought-id="${childId}"]`);
    await selectThoughtThroughMaterialIndex(page, childId);
    await expect(child).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("Delete");
    await expect(page.locator(`[data-thought-id="${childId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
    await expect(page.locator(`[data-thought-id="${childId}"]`)).toHaveCount(1);
  });
}
