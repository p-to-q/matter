import { expect, test } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";
import { selectPassage } from "./under-driver";

// The flag is a build-time switch, so the two rails are two builds. The default
// run proves the product has four slots; this spec, run with
//   npm run test:e2e:preview-branch
// starts the server with NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true and proves the
// retired Branch tool comes back, and only it, beside the Under mark.
const previewBranch = process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH === "true";
const rootId = "thought_fixture_root";

async function railToolIds(page: import("@playwright/test").Page): Promise<(string | null)[]> {
  return page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .locator("[data-tool-id]")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-tool-id")));
}

test("the main build has no Branch slot", async ({ page }) => {
  test.skip(previewBranch, "built with the Preview Branch flag");
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  expect(await railToolIds(page)).toEqual(["voice", "lasso", "move", "undo"]);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought })).toHaveCount(0);
});

test("a Preview Branch build restores the five-slot rail, and Under stays on the passage", async ({ page }) => {
  test.skip(!previewBranch, "needs NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  expect(await railToolIds(page)).toEqual(["voice", "lasso", "branch", "move", "undo"]);

  const before = await page.locator("[data-thought-id]").count();
  await selectPassage(page, rootId);
  await expect(page.locator('[data-node-action="under"]')).toBeVisible();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
  await expect(page.locator("[data-thought-id]")).toHaveCount(before + 1);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect(page.locator("[data-thought-id]")).toHaveCount(before);
});
