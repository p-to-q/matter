import { expect, test, type Page, type Route } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

// The storage engine is one lazy chunk behind a synchronous facade. These
// journeys hold its fetch back, or fail it, and prove what the paper tells
// the person meanwhile and that no stored material is lost either way.
// Routing bypasses the HTTP cache, so every reload is a cold fetch.

const rootId = "thought_fixture_root";
const HELD_ENGINE_MS = 1_500;
// Chunk names group modules by directory, so the engine chunk is recognized
// by the controller module only it carries (the facade imports it as a type).
const ENGINE_MODULE = "persistence/persistence-controller.ts";
const JAVASCRIPT_CHUNK = /\/_next\/static\/chunks\/.+\.js$/u;

/** Routes script chunks; `engine` decides what happens to the engine's. */
async function routeEngineChunk(
  page: Page,
  engine: (route: Route, fulfill: () => Promise<void>) => Promise<void>,
): Promise<void> {
  await page.route((url) => JAVASCRIPT_CHUNK.test(url.pathname), async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const fulfill = () => route.fulfill({ response, body });
    if (body.includes(ENGINE_MODULE)) await engine(route, fulfill);
    else await fulfill();
  });
}

test("a cold engine fetch on a repeat visit shows stored material one round trip later, never lost", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSaved(page);
  const childId = await commitBranch(page);
  const storedRevision = await page.evaluate(readStoredRevision);

  // A repeat visit whose HTTP cache is cold: the engine chunk crosses the
  // network again, and is held there.
  let heldFetches = 0;
  let releaseEngine: () => void = () => undefined;
  const engineReleased = new Promise<void>((resolve) => {
    releaseEngine = resolve;
  });
  await routeEngineChunk(page, async (_route, fulfill) => {
    heldFetches += 1;
    await engineReleased;
    await fulfill();
  });

  // The held chunk was requested before the load event, which therefore waits too.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect.poll(() => heldFetches).toBeGreaterThan(0);
  // While the engine is away the paper says it is still loading, keeps every
  // durable gesture inert, and has written nothing over the stored row.
  const sidebar = page.locator("aside.material-files");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "loading");
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-interaction-pending", "true");
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }))
    .toBeDisabled();
  await page.waitForTimeout(HELD_ENGINE_MS);
  expect(await page.evaluate(readStoredRevision)).toBe(storedRevision);

  releaseEngine();
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
  await expect(page.locator(`[data-thought-id="${childId}"]`)).toHaveCount(1);
  expect(await page.evaluate(readStoredRevision)).toBe(storedRevision);
  await expect(sidebar.locator(".material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.localOnly);
});

test("an engine that cannot load guards the person's material and meets the stored row as a load-window conflict", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSaved(page);
  const storedChildId = await commitBranch(page);
  const storedRevision = await page.evaluate(readStoredRevision);

  let failEngine = true;
  let failedFetches = 0;
  await routeEngineChunk(page, async (route, fulfill) => {
    if (!failEngine) {
      await fulfill();
      return;
    }
    failedFetches += 1;
    await route.abort("failed");
  });

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const sidebar = page.locator("aside.material-files");
  // The same truthful answer storage that cannot open gives: nothing is being
  // saved, and the paper stays usable.
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "error");
  expect(failedFetches).toBeGreaterThan(0);
  await expect(sidebar.locator(".material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.durabilityNotSaving);

  // Material the person makes now is guarded on exit although no controller
  // has received it yet, and nothing reaches the stored row.
  const heldChildId = await commitBranch(page, false);
  expect(await page.evaluate(exitIsGuarded)).toBe(true);
  expect(await page.evaluate(readStoredRevision)).toBe(storedRevision);

  // Retry fetches the engine; the stored row and this page's material then
  // meet through the ordinary load-window rule. Neither is written over.
  failEngine = false;
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveRetrySaving }).click();
  await expect(sidebar.locator(".material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.durabilityDiverged);
  await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveNoteDiverged);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).toHaveCount(1);
  expect(await page.evaluate(readStoredRevision)).toBe(storedRevision);
  expect(await page.evaluate(exitIsGuarded)).toBe(true);

  // Choosing the stored material restores it exactly.
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveReloadStoredMaterial }).click();
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
  await expect(page.locator(`[data-thought-id="${storedChildId}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-thought-id="${heldChildId}"]`)).toHaveCount(0);
  expect(await page.evaluate(exitIsGuarded)).toBe(false);
});

async function openSaved(page: Page): Promise<void> {
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
}

async function commitBranch(page: Page, awaitStored = true): Promise<string> {
  const before = await thoughtIds(page);
  await page.locator(`[data-thought-id="${rootId}"]`).locator("[data-thought-text-id]").click();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
  await expect.poll(async () => (await thoughtIds(page)).length).toBeGreaterThan(before.length);
  const childId = (await thoughtIds(page)).find((id) => !before.includes(id));
  if (childId === undefined) throw new Error("the branch was not created");
  if (awaitStored) {
    await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
    await expect.poll(async () => {
      const live = await page.locator("main.matter-shell").getAttribute("data-tree-revision");
      return (await page.evaluate(readStoredRevision)) === Number(live);
    }).toBe(true);
  }
  return childId;
}

async function thoughtIds(page: Page): Promise<string[]> {
  return page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id")).filter((id): id is string => id !== null),
  );
}

/** Whether leaving now would ask first; the exit guard cancels `beforeunload`. */
function exitIsGuarded(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function readStoredRevision(): Promise<number | null> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const rows = await new Promise<Array<{ treeRevision?: unknown }>>((resolve, reject) => {
      const request = database.transaction("snapshots", "readonly").objectStore("snapshots").getAll();
      request.onsuccess = () => resolve(request.result as Array<{ treeRevision?: unknown }>);
      request.onerror = () => reject(request.error);
    });
    const revision = rows[0]?.treeRevision;
    return typeof revision === "number" ? revision : null;
  } finally {
    database.close();
  }
}
