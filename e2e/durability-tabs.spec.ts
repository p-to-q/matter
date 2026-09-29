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

test("a hidden tab keeps a submitted fixture AI turn while another tab commits", async ({ context }) => {
  const rewritten = "在隐藏的标签页里送达的改写";
  const writer = await openSaved(context.newPage());
  const reader = await context.newPage();
  // Headless pages always report visible; the shim lets this tab be hidden.
  await reader.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(window, "__matterSetHidden", {
      value: (next: boolean) => {
        hidden = next;
        document.dispatchEvent(new Event("visibilitychange"));
      },
    });
  });
  let requests = 0;
  let releaseResponse!: () => void;
  const responseBarrier = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await reader.route("**/api/text-swap", async (route) => {
    requests += 1;
    const envelope = route.request().postDataJSON() as {
      protocolVersion: "0.2";
      requestVersion: "text-swap/2";
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await responseBarrier;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        protocolVersion: envelope.protocolVersion,
        requestVersion: envelope.requestVersion,
        id: envelope.id,
        treeId: envelope.treeId,
        treeRevision: envelope.treeRevision,
        action: {
          id: envelope.id,
          type: "replace-text-range",
          nodeId: envelope.selection.nodeId,
          start: envelope.selection.start,
          end: envelope.selection.end,
          text: rewritten,
          intent: "paraphrase",
        },
        presentation: { motionHint: "settle" },
      }),
    }).catch(() => undefined);
  });
  await openSaved(Promise.resolve(reader));
  const shell = reader.locator("main.matter-shell");
  const revisionBefore = await shell.getAttribute("data-tree-revision");
  if (revisionBefore === null) throw new Error("tree revision missing");

  const passage = reader.locator(`[data-thought-text-id="${rootId}"]`);
  await passage.hover();
  await reader.locator("[data-node-action=point-talk]").click();
  await reader.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" }).fill("换一种更凝练的说法");
  await reader.getByRole("button", { name: "改写", exact: true }).click();
  await expect(reader.locator('.point-talk[data-phase="pending"]')).toBeVisible();
  await expect.poll(() => requests).toBe(1);

  await reader.evaluate(() => (window as unknown as { __matterSetHidden(next: boolean): void }).__matterSetHidden(true));
  const writerChild = await commitBranch(writer);

  // The broadcast has arrived, yet the hidden tab keeps its document instance:
  // the submitted turn is bound to it and would be revoked by a replacement.
  await reader.waitForTimeout(750);
  await expect(reader.locator(`[data-thought-id="${writerChild}"]`)).toHaveCount(0);
  await expect(reader.locator('.point-talk[data-phase="pending"]')).toHaveCount(1);
  await expect(shell).toHaveAttribute("data-tree-revision", revisionBefore);

  releaseResponse();
  await expect(passage).toContainText(rewritten);
  // The result stays, and the line says truthfully that another tab saved a
  // newer copy; nothing was written over either side.
  const sidebar = reader.locator("aside.material-files");
  await expect(sidebar.locator(".material-files__profile-meta"))
    .toHaveText(fixtureUiCopy.materialFiles.durabilityNewerCopy);
  await expect(reader.locator(`[data-thought-id="${writerChild}"]`)).toHaveCount(0);
  const writerRevision = Number(await writer.locator("main.matter-shell").getAttribute("data-tree-revision"));
  await expect.poll(() => reader.evaluate(readStoredRevision)).toBe(writerRevision);
  expect(requests).toBe(1);
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
