import { expect, test, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const rootId = "thought_fixture_root";

test("a clean tab takes up material another tab saves, without a reload gesture", async ({ context }) => {
  const writer = await openSaved(context.newPage());
  const reader = await openSaved(context.newPage());

  const childId = await commitBranch(writer);

  await expect(reader.locator(`[data-thought-id="${childId}"]`)).toHaveCount(1);
  await expect(reader.locator("aside.material-files .material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.localOnly);
});

test("a tab holding refused material meets another tab's save as a conflict", async ({ context }) => {
  const writer = await openSaved(context.newPage());
  const holder = await context.newPage();
  await holder.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "snapshots") throw new DOMException("storage full", "QuotaExceededError");
      return originalPut.apply(this, args);
    };
  });
  await openSaved(Promise.resolve(holder));
  const heldId = await commitBranch(holder, false);
  const sidebar = holder.locator("aside.material-files");
  await expect(sidebar.locator(".material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.durabilityNotSaved);

  await commitBranch(writer);

  await expect(sidebar.locator(".material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.durabilityNewerCopy);
  // The refused material is still on screen; nothing was written over it.
  await expect(holder.locator(`[data-thought-id="${heldId}"]`)).toHaveCount(1);
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.durabilityNewerCopy }).click();
  const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveNoteConflict);
  await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveReloadStoredMaterial }))
    .toBeEnabled();
});

async function openSaved(opening: Promise<Page>): Promise<Page> {
  const page = await opening;
  await page.setViewportSize({ width: 1280, height: 800 });
  if (page.url() === "about:blank") await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
  return page;
}

async function commitBranch(page: Page, awaitStored = true): Promise<string> {
  const before = await thoughtIds(page);
  await page.locator(`[data-thought-id="${rootId}"]`).locator("[data-thought-text-id]").click();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
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
