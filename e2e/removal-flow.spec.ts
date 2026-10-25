import { expect, test } from "@playwright/test";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";
import { UNDER_REPAIRED_TRANSCRIPT, addChildUnder } from "./under-driver";

const rootId = "thought_fixture_root";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`Delete removes a selected non-root thought and Undo restores it at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    // The child is spoken under the root through the Under mark.
    const childId = await addChildUnder(page, rootId);
    const child = page.locator(`[data-thought-id="${childId}"]`);
    await selectThoughtThroughMaterialIndex(page, childId);
    await expect(child).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("Delete");
    await expect(page.locator(`[data-thought-id="${childId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
    await expect(page.locator(`[data-thought-id="${childId}"]`)).toHaveCount(1);
    await expect(child).toContainText(UNDER_REPAIRED_TRANSCRIPT);
  });
}
