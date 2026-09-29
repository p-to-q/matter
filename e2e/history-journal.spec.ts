import { expect, test, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const rootId = "thought_fixture_root";

test("a pre-v6 inline journal migrates on its first save and still reverses the change", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const childId = await commitOneBranch(page);

  // Rewrite storage as the v5 build left it: the previous database version,
  // the journal inline in the row, and no per-step records.
  const legacyRow = await page.evaluate(readRowAsLegacy);
  await page.goto("/robots.txt");
  await page.evaluate(writeVersionFiveDatabase, legacyRow);

  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const child = page.locator(`[data-thought-id="${childId}"]`);
  await expect(child).toHaveCount(1);
  const undo = page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(child).toHaveCount(0);

  // Undo is itself a save: the row now carries a manifest instead of the
  // inline journal, and the undone step waits as one redo record.
  await expect.poll(() => page.evaluate(readJournalShape)).toEqual({
    version: 6,
    inline: false,
    manifest: true,
    records: [["redo", 0]],
  });
  expect(await page.locator("aside.material-files .material-files__profile-meta").textContent())
    .not.toBe(fixtureUiCopy.materialFiles.historyUnavailable);
});

test("a damaged stored undo step is released with one quiet notice while material loads", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const childId = await commitOneBranch(page);

  await page.evaluate(damageNewestUndoRecord);
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  await expect(page.locator(`[data-thought-id="${childId}"]`)).toHaveCount(1);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }))
    .toBeDisabled();
  const sidebar = page.locator("aside.material-files");
  const meta = sidebar.locator(".material-files__profile-meta");
  await expect(meta).toHaveText(fixtureUiCopy.materialFiles.historyUnavailable);

  // Recovery lives in Archive; opening it is where the notice is read.
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.close, exact: true }).click();
  await expect(meta).toHaveText(fixtureUiCopy.materialFiles.localOnly);
});

async function commitOneBranch(page: Page): Promise<string> {
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const before = await thoughtIds(page);
  await page.locator(`[data-thought-id="${rootId}"]`).locator("[data-thought-text-id]").click();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.extendRelatedThought, exact: true }).click();
  const childId = (await thoughtIds(page)).find((id) => !before.includes(id));
  if (childId === undefined) throw new Error("the branch was not created");
  await expect.poll(async () => {
    const live = Number(await page.locator("main.matter-shell").getAttribute("data-tree-revision"));
    return (await page.evaluate(readStoredRevision)) === live;
  }).toBe(true);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }))
    .toBeEnabled();
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

async function readRowAsLegacy(): Promise<Record<string, unknown>> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction(["snapshots", "historyEntries"], "readonly");
    const read = (store: string) => new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    const [rows, records] = await Promise.all([read("snapshots"), read("historyEntries")]);
    const row = rows[0];
    if (row === undefined) throw new Error("stored material is missing");
    const stack = (name: string) => records
      .filter((record) => record.stack === name)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map(({ commandId, source, inverse, retainedInverseBytes }) => ({
        commandId,
        source,
        inverse,
        retainedInverseBytes,
      }));
    const entries = stack("undo");
    const redoEntries = stack("redo");
    const legacy = { ...row };
    delete legacy.historyJournal;
    return {
      ...legacy,
      history: {
        entries,
        redoEntries,
        retainedInverseBytes: [...entries, ...redoEntries]
          .reduce((total, entry) => total + Number(entry.retainedInverseBytes), 0),
      },
    };
  } finally {
    database.close();
  }
}

async function writeVersionFiveDatabase(row: Record<string, unknown>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ptoq-matter");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("database deletion failed"));
    request.onblocked = () => reject(new Error("database deletion was blocked"));
  });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter", 5);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("snapshots", { keyPath: "treeId" }).put(row);
      const labels = database.createObjectStore("labels", { keyPath: "key" });
      labels.createIndex("treeId", "treeId");
      labels.createIndex("originUpdatedAt", ["origin", "updatedAt"]);
      database.createObjectStore("inquiryRecords", { keyPath: "treeId" });
      database.createObjectStore("wiki", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error("v5 database creation failed"));
    request.onblocked = () => reject(new Error("v5 database creation was blocked"));
  });
}

async function readJournalShape() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction(["snapshots", "historyEntries"], "readonly");
    const read = (store: string) => new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    const [rows, records] = await Promise.all([read("snapshots"), read("historyEntries")]);
    return {
      version: database.version,
      inline: rows[0] !== undefined && "history" in rows[0],
      manifest: rows[0]?.historyJournal !== undefined,
      records: records.map((record) => [record.stack, record.position]),
    };
  } finally {
    database.close();
  }
}

async function damageNewestUndoRecord(): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ptoq-matter");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction("historyEntries", "readwrite");
    const store = transaction.objectStore("historyEntries");
    const records = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
      request.onerror = () => reject(request.error);
    });
    const newest = records
      .filter((record) => record.stack === "undo")
      .sort((left, right) => Number(right.position) - Number(left.position))[0];
    if (newest === undefined) throw new Error("no stored undo step");
    store.put({ ...newest, inverse: "damaged" });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
