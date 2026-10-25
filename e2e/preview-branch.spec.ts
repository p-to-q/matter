import { expect, test } from "@playwright/test";
import { clickExposedMaterial, hoverExposedMaterial } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";
import { selectPassage, thoughtIdsOf } from "./under-driver";

// The flag is a build-time switch, so the two rails are two builds. The default
// run proves the product has four slots; this spec, run with
//   npm run test:e2e:preview-branch
// starts the server with NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true and proves the
// retained Branch tool stays on the rail. The local review lens restores the
// quiet two-action design; the default product still carries Under.
const previewBranch = process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH === "true";
const rootId = "thought_fixture_root";
const imaginedLivesId = "thought_fixture_imagined_lives";

async function railToolIds(page: import("@playwright/test").Page): Promise<(string | null)[]> {
  return page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .locator("[data-tool-id]")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-tool-id")));
}

async function childIds(page: import("@playwright/test").Page, parentId: string): Promise<string[]> {
  return page.locator(`[data-thought-id][data-tree-parent-id="${parentId}"]`).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id")).filter((id): id is string => id !== null),
  );
}

test("the main build has no Branch slot", async ({ page }) => {
  test.skip(previewBranch, "built with the Preview Branch flag");
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  expect(await railToolIds(page)).toEqual(["voice", "lasso", "move", "undo"]);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought })).toHaveCount(0);
});

test("Preview keeps two hover actions while rail growth follows selection, not hover", async ({ page }) => {
  test.skip(!previewBranch, "needs NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true");
  await page.setViewportSize({ width: 1280, height: 800 });
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(?:image|inquiry|repair|text-swap|transcribe|turn)\b/u.test(new URL(request.url()).pathname)) {
      generationRequests.push(request.url());
    }
  });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  expect(await railToolIds(page)).toEqual(["voice", "lasso", "branch", "move", "undo"]);

  // Hover is not selection and no longer offers growth. The rail must keep
  // the selected root as its parent while another passage's lens is shown.
  await selectPassage(page, rootId);
  const beforeIds = await thoughtIdsOf(page);
  const beforeChildren = await childIds(page, rootId);
  const hoveredChildren = await childIds(page, imaginedLivesId);
  await hoverExposedMaterial(page, page.locator(`[data-thought-text-id="${imaginedLivesId}"]`));
  const lens = page.locator(`[data-node-action-lens][data-node-id="${imaginedLivesId}"]`);
  await expect(lens).toBeVisible();
  expect(await lens.locator("[data-node-action]").evaluateAll((actions) =>
    actions.map((action) => action.getAttribute("data-node-action")),
  )).toEqual(["point-talk", "set-aside"]);
  await expect(lens.locator('[data-node-action="under"]')).toHaveCount(0);
  await expect(lens.locator('[data-node-action="branch"]')).toHaveCount(0);
  await test.info().attach("local-preview-two-action-lens-candidate-not-accepted", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools }).getByRole("button", {
    name: fixtureUiCopy.toolRail.extendRelatedThought,
    exact: true,
  }).click();

  await expect.poll(() => thoughtIdsOf(page)).toHaveLength(beforeIds.length + 1);
  const afterChildren = await childIds(page, rootId);
  expect(afterChildren.slice(0, -1)).toEqual(beforeChildren);
  const childId = afterChildren.at(-1);
  if (childId === undefined) throw new Error("Preview rail did not append a selected child");
  await expect(page.locator(`[data-thought-id="${childId}"]`))
    .toHaveAttribute("data-tree-parent-id", rootId);
  expect(await childIds(page, imaginedLivesId)).toEqual(hoveredChildren);
  await expect(page.locator(`[data-thought-id="${rootId}"]`)).toHaveAttribute("data-selected", "true");

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect.poll(() => childIds(page, rootId)).toEqual(beforeChildren);
  await page.keyboard.press("Control+Shift+Z");
  await expect.poll(() => childIds(page, rootId)).toEqual(afterChildren);
  await test.info().attach("local-preview-branch-restored-material-candidate-not-accepted", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  expect(generationRequests).toEqual([]);
});

test("Preview hover leaves quietly, selection retains it, and Escape dismisses both paint planes", async ({ page }) => {
  test.skip(!previewBranch, "needs NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const passage = page.locator(`[data-thought-text-id="${rootId}"]`);
  const lens = page.locator("[data-node-action-lens]");
  const fog = page.locator("[data-node-action-fog]");
  await hoverExposedMaterial(page, passage);
  await expect(lens).toBeVisible();
  await expect(lens.getByRole("button")).toHaveCount(2);
  await page.mouse.move(0, 0);
  await expect(lens).toHaveCount(0);
  await expect(fog).toHaveCount(0);
  await clickExposedMaterial(page, passage);
  await page.mouse.move(0, 0);
  // Let the pointer's 200ms departure grace actually expire before proving
  // selection retention; an immediate visibility check would miss that race.
  await page.waitForTimeout(350);
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-node-id", rootId);
  await lens.locator('[data-node-action="point-talk"]').hover();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-node-id", rootId);
  const otherPassage = page.locator(`[data-thought-text-id="${imaginedLivesId}"]`);
  await hoverExposedMaterial(page, otherPassage);
  await expect(lens).toHaveAttribute("data-node-id", imaginedLivesId);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-node-id", rootId);
  await lens.locator('[data-node-action="point-talk"]').hover();
  await page.mouse.move(0, 0);
  // Reentry cancels the pending release rather than briefly losing its owner.
  await lens.locator('[data-node-action="point-talk"]').hover();
  await page.waitForTimeout(350);
  await expect(lens).toBeVisible();
  await expect(lens).toHaveAttribute("data-node-id", rootId);
  await page.keyboard.press("Escape");
  await expect(lens).toHaveCount(0);
  await expect(fog).toHaveCount(0);
  await clickExposedMaterial(page, passage);
  await expect(lens).toBeVisible();
  await lens.locator('[data-node-action="point-talk"]').click();
  await expect(page.locator(".point-talk")).toBeVisible();
  await expect(lens).toHaveCount(0);
  await expect(fog).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".point-talk")).toBeHidden();
});

test("Preview Branch rail grows the default root when no passage is selected", async ({ page }) => {
  test.skip(!previewBranch, "needs NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator('[data-thought-id][data-selected="true"]')).toHaveCount(0);

  const beforeChildren = await childIds(page, rootId);
  await page.getByRole("button", {
    name: fixtureUiCopy.toolRail.extendRelatedThought,
    exact: true,
  }).click();
  await expect.poll(async () => (await childIds(page, rootId)).length).toBe(beforeChildren.length + 1);
  const afterChildren = await childIds(page, rootId);
  expect(afterChildren.slice(0, -1)).toEqual(beforeChildren);
  const childId = afterChildren.at(-1);
  if (childId === undefined) throw new Error("Preview Branch did not append a root child");
  await expect(page.locator(`[data-thought-id="${childId}"]`))
    .toHaveAttribute("data-tree-parent-id", rootId);

  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect.poll(() => childIds(page, rootId)).toEqual(beforeChildren);
  await page.keyboard.press("Control+Shift+Z");
  await expect.poll(() => childIds(page, rootId)).toEqual(afterChildren);
});
