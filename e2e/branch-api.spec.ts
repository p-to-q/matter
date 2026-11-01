import { expect, test } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";
test.skip(process.env.NEXT_PUBLIC_MATTER_PREVIEW_BRANCH !== "true", "Branch build required");
const rootId = "thought_fixture_root";
const branchButton = (page: import("@playwright/test").Page) => page.getByRole("button", {
  name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true,
});
test("Branch submits its exact parent once and commits one undoable API result", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/branch", async (route) => {
    const input = route.request().postDataJSON(); calls.push(input);
    await gate;
    await route.fulfill({ json: { version: input.version, requestId: input.requestId, treeId: input.treeId,
      revision: input.revision, parentId: input.parentId, text: "在日常里保留尚未被决定的时间" } });
  });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const before = await page.locator("[data-thought-id]").count();
  await branchButton(page).click();
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator(".matter-guidance")).toContainText("正在延展");
  expect(Object.keys(calls[0]).sort()).toEqual(["children", "locale", "parentId", "parentText", "requestId", "revision", "treeId", "version"]);
  expect(calls[0].parentId).toBe(rootId);
  release();
  await expect(page.locator("[data-thought-id]")).toHaveCount(before + 1);
  await expect(page.locator('[data-thought-text-id]').filter({ hasText: "在日常里保留尚未被决定的时间" })).toHaveCount(1);
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
  await expect(page.locator("[data-thought-id]")).toHaveCount(before);
  expect(calls).toHaveLength(1);
});
test("an unavailable API leaves material unchanged and says so", async ({ page }) => {
  await page.route("**/api/branch", (route) => route.fulfill({ status: 503, json: { error: { code: "MODEL_UNAVAILABLE" } } }));
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const before = await page.locator("[data-thought-text-id]").allTextContents();
  await branchButton(page).click();
  await expect(page.locator(".matter-guidance")).toContainText("未能延展");
  expect(await page.locator("[data-thought-text-id]").allTextContents()).toEqual(before);
});

test("a submitted Branch survives a back-forward-cache suspension", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/branch", async (route) => {
    const input = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: { version: input.version, requestId: input.requestId, treeId: input.treeId,
      revision: input.revision, parentId: input.parentId, text: "给尚未决定的日常留出空间" } });
  });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const before = await page.locator("[data-thought-id]").count();
  const request = page.waitForRequest("**/api/branch");
  await branchButton(page).click();
  await request;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  const response = page.waitForResponse("**/api/branch");
  release();
  await response;
  expect(await page.locator("[data-thought-id]").count()).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(page.locator("[data-thought-id]")).toHaveCount(before + 1);
});

test("a completed answer waits until a covering dialog closes", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/branch", async (route) => {
    const input = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: { version: input.version, requestId: input.requestId, treeId: input.treeId,
      revision: input.revision, parentId: input.parentId, text: "为仍然可能的生活留出时间" } });
  });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const before = await page.locator("[data-thought-id]").count();
  await branchButton(page).click();
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const response = page.waitForResponse("**/api/branch");
  release();
  await response;
  expect(await page.locator("[data-thought-id]").count()).toBe(before);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-thought-id]")).toHaveCount(before + 1);
});
