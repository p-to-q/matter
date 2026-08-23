import { expect, test, type Locator } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const rootId = "thought_fixture_root";

test("the material index names a thought instead of previewing it", async ({ page }) => {
  const labelRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/label")) labelRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  // The root is the level the index is inside, so its name is the context line.
  const heading = page.locator(".material-files__context-title span");
  const material = await page
    .locator(`[data-thought-id="${rootId}"] [data-thought-text-id]`)
    .innerText();

  // The document title is independent from the opening passage. It stays short
  // and stable while the visible root keeps the person's complete sentence.
  const title = (await heading.innerText()).trim();
  expect(title.length).toBeGreaterThan(1);
  expect(Array.from(title).length).toBeLessThanOrEqual(32);
  expect(title).toBe("被允许想象的其他生活");
  expect(material.startsWith(title)).toBe(false);

  // One eligible visible passage is one question; the index arrives expanded,
  // so it must not repeat requests while seven fixture passages stay on screen.
  await expect(page.locator(".material-file")).toHaveCount(10);
  await expect.poll(() => labelRequests.length).toBe(7);
  await page.waitForTimeout(300);
  expect(labelRequests).toHaveLength(7);
});

test("a name a person types survives a reload and outranks the model", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".material-files")).toHaveAttribute("data-persistence-phase", "saved");

  const row = page.locator(".material-file").first();
  await row.focus();
  await row.press("F2");
  await expect(row.locator(".material-file__rename")).toBeFocused();
  await row.locator(".material-file__rename").dispatchEvent("keydown", {
    key: "Escape",
    isComposing: true,
  });
  await expect(row.locator(".material-file__rename")).toBeVisible();
  await row.locator(".material-file__rename").press("Escape");
  await expect(row).toBeFocused();

  await openNameEditor(row.locator(".material-file__open"));
  const editor = row.locator(".material-file__rename");
  await expect(editor).toBeVisible();
  await editor.fill("过去的另一种生活");
  await editor.press("Enter");
  await expect(row).toBeFocused();
  await expect(row.locator(".material-file__title")).toHaveText("过去的另一种生活");
  await expect(row).toHaveAttribute("data-label-origin", "user");
  const renamedNodeId = await row.getAttribute("data-node-id");
  expect(renamedNodeId).not.toBeNull();

  // The name is durable, and nothing automatic may take it back.
  const labelRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/label")) return;
    const payload = request.postDataJSON() as { basis?: { nodeId?: unknown } } | null;
    if (payload?.basis?.nodeId === renamedNodeId) labelRequests.push(request.url());
  });
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const reloaded = page.locator(".material-file").first();
  await expect(reloaded.locator(".material-file__title")).toHaveText("过去的另一种生活");
  await page.waitForTimeout(500);
  expect(labelRequests).toHaveLength(0);

  // Search finds a row by the name that is actually on screen.
  await page.getByRole("button", { name: fixtureUiCopy.materialFiles.searchThoughts }).click();
  await page.getByRole("searchbox", { name: fixtureUiCopy.materialFiles.filterMaterialFiles }).fill("另一种");
  await expect(page.locator(".material-file")).toHaveCount(1);
  await page.getByRole("button", { name: fixtureUiCopy.materialFiles.closeSearch }).click();

  // Clearing the name returns the row to automatic naming.
  await openNameEditor(reloaded.locator(".material-file__open"));
  await reloaded.locator(".material-file__rename").fill("");
  await reloaded.locator(".material-file__rename").press("Enter");
  await expect(reloaded.locator(".material-file__title")).not.toHaveText("过去的另一种生活");
});

test("a label is generated once, not once per reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  // Wait for the model answer to land and be written before reloading.
  await page.waitForResponse((response) => response.url().includes("/api/label"));
  await page.waitForTimeout(400);
  const first = await page.locator(".material-file__title").first().innerText();

  const afterReload: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/label")) afterReload.push(request.url());
  });
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(".material-file__title").first()).toHaveText(first);
  await page.waitForTimeout(600);
  expect(afterReload).toHaveLength(0);
});

/**
 * Opens the row's name editor through the component's own handler. Playwright's
 * synthetic double click interleaves a selection click and a re-render, which
 * makes the gesture — not the behaviour under test — the flaky part.
 *
 * The touch long press is deliberately not covered here: driving it through a
 * synthetic pointer sequence proved to test the harness rather than the
 * product. It is verified by hand in a real browser at 375 px.
 */
async function openNameEditor(target: Locator): Promise<void> {
  await target.dispatchEvent("dblclick");
}

test("a thought is named without waiting for the label endpoint", async ({ page }) => {
  await page.route("**/api/label", async () => {
    // Never fulfilled: the endpoint is indistinguishable from an outage.
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const title = page.locator(".material-file").first().locator(".material-file__title");
  await expect(title).not.toHaveText("");
  expect(Array.from((await title.innerText()).trim()).length).toBeLessThanOrEqual(32);
});
