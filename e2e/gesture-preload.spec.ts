import { expect, test, type Page } from "@playwright/test";
import { IDLE_PRELOAD_TIMEOUT_MS } from "../features/matter/interaction/idle-preload";

// Code that only a gesture needs stays out of the initial graph, but a
// gesture must never wait on fetching it. These journeys let the page settle,
// then prove the first gesture of each kind fetches no code at all.

const ROOT_ID = "thought_fixture_root";

test("the first Point and Talk gesture fetches no code once the page settles", async ({ page }) => {
  await openSettled(page);
  const fetched = recordCodeFetches(page);

  const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  await passage.hover();
  await page.locator("[data-node-action=point-talk]").click();
  await expect(page.locator(".point-talk")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" })).toBeFocused();

  expect(fetched).toEqual([]);
});

test("opening the Model API dialog fetches no code once the page settles", async ({ page }) => {
  await openSettled(page);
  // Opening the menu is itself an intent signal: it may start the Wiki
  // dialog's code. The dialog chosen from it must then fetch nothing.
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await waitForCodeTraffic(page);
  const fetched = recordCodeFetches(page);

  await page.getByRole("menuitem", { name: "模型 API", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型 API", exact: true });
  await expect(dialog.getByRole("textbox", { name: "API 地址" })).toBeVisible();

  expect(fetched).toEqual([]);
});

async function openSettled(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
  // The idle preload starts within its bounded window; then code traffic stops.
  await page.waitForTimeout(IDLE_PRELOAD_TIMEOUT_MS);
  await waitForCodeTraffic(page);
}

async function waitForCodeTraffic(page: Page): Promise<void> {
  await expect.poll(async () => {
    const before = await codeResourceCount(page);
    await page.waitForTimeout(500);
    return (await codeResourceCount(page)) === before;
  }, { timeout: 15_000 }).toBe(true);
}

function recordCodeFetches(page: Page): string[] {
  const fetched: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/_next\/static\/.+\.(?:js|css)$/u.test(path)) fetched.push(path);
  });
  return fetched;
}

function codeResourceCount(page: Page): Promise<number> {
  return page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => /\/_next\/static\/.+\.(?:js|css)$/u.test(new URL(entry.name).pathname))
    .length);
}
