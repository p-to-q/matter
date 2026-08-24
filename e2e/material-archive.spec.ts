import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`material archive exports and restores through the confirmed file flow at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const sidebar = page.locator("aside.material-files");
    // The index has no handle at desk widths; below them it is a drawer.
    const toggle = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles }).first();
    if (await toggle.count() > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await expect(sidebar).toHaveAttribute("data-open", "true");
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.select, exact: true }).click();
    await sidebar.getByRole("checkbox").first().check();
    await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(1));
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
    const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
    await expect(archive).toBeVisible();
    await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.matter\.zip$/u);
    const downloadPath = await download.path();
    if (downloadPath === null) throw new Error("Archive download did not produce a local file.");

    await archive.getByLabel(fixtureUiCopy.materialFiles.archiveChooseMaterialArchive).setInputFiles(downloadPath);
    await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
    await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveReplace, exact: true }).click();
    await expect(sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel })).toHaveCount(0);
    await expect(sidebar).toHaveAttribute("data-mode", "browse");
    await expect(page.locator("[data-thought-id]")).toHaveCount(10);
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.select, exact: true }).click();
    await expect(sidebar).toContainText(fixtureUiCopy.materialFiles.selectedCount(0));
    expect(browserErrors).toEqual([]);
  });

  test(`material archive cancellation and invalid files leave current material and session intact at ${viewport.name} width`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const root = page.locator('[data-thought-id="thought_fixture_root"]');
    await root.getByRole("button").click();
    await expect(root).toHaveAttribute("data-selected", "true");
    const before = await readMaterialSession(page);

    const sidebar = page.locator("aside.material-files");
    // The index has no handle at desk widths; below them it is a drawer.
    const toggle = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles }).first();
    if (await toggle.count() > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
    const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });

    const chooserPromise = page.waitForEvent("filechooser");
    await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveImportCopy }).click();
    await (await chooserPromise).setFiles([]);
    await expect(archive).not.toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
    expect(await readMaterialSession(page)).toEqual(before);

    await archive.getByLabel(fixtureUiCopy.materialFiles.archiveChooseMaterialArchive).setInputFiles({
      name: "not-a-material.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("This is not a ZIP archive."),
    });
    await expect(archive).toContainText("archive");
    await expect(archive).not.toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
    expect(await readMaterialSession(page)).toEqual(before);
    expect(browserErrors).toEqual([]);
  });

  test(`material archive respects lasso ownership at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const sidebar = page.locator("aside.material-files");
    const toggle = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles }).first();
    const hasToggle = await toggle.count() > 0;
    if (hasToggle && (await toggle.getAttribute("aria-expanded")) === "true" && viewport.name === "narrow") {
      await toggle.click();
    }
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    if (hasToggle && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();

    const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
    if (viewport.name === "narrow") {
      // The overlay must return transient canvas ownership before it can expose
      // document-boundary actions. A docked desk index does not take focus, so
      // its archive remains inert while Lasso still owns the canvas.
      await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
      await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy })).toBeEnabled();
      await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveImportCopy })).toBeEnabled();
    } else {
      await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy })).toBeDisabled();
      await expect(archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveImportCopy })).toBeDisabled();
      await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    }
  });
}

test("the first release rejects a foreign document archive before replacement", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const sidebar = page.locator("aside.material-files");
  const before = await readMaterialSession(page);

  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  const downloadReceipt = page.waitForEvent("download");
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy }).click();
  const downloadPath = await (await downloadReceipt).path();
  if (downloadPath === null) throw new Error("Archive download did not produce a local file.");

  const files = unzipSync(new Uint8Array(await readFile(downloadPath)));
  const metadataPath = "matter/matter.json";
  const metadataBytes = files[metadataPath];
  if (metadataBytes === undefined) throw new Error("Archive metadata is missing.");
  const metadata = JSON.parse(strFromU8(metadataBytes)) as Record<string, unknown>;
  files[metadataPath] = strToU8(`${JSON.stringify({ ...metadata, treeId: "foreign_tree" })}\n`);

  await archive.getByLabel(fixtureUiCopy.materialFiles.archiveChooseMaterialArchive).setInputFiles({
    name: "foreign.matter.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(files)),
  });
  await expect(archive).toContainText("restore only a copy of the current document");
  await expect(archive).not.toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
  expect(await readMaterialSession(page)).toEqual(before);
});

test("an explicitly restored older backup survives reload without reviving prior Undo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const sidebar = page.locator("aside.material-files");
  const initialRevision = Number(await page.locator("main.matter-shell").getAttribute("data-tree-revision"));
  const initialIds = await page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id")).filter((id): id is string => id !== null),
  );
  const removedId = initialIds.at(-1);
  if (removedId === undefined) throw new Error("Archive fixture has no removable thought.");

  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  let archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  const downloadReceipt = page.waitForEvent("download");
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy }).click();
  const backupPath = await (await downloadReceipt).path();
  if (backupPath === null) throw new Error("Archive download did not produce a local file.");
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.close, exact: true }).click();

  await selectThoughtThroughMaterialIndex(page, removedId);
  await page.keyboard.press("Delete");
  await expect(page.locator(`[data-thought-id="${removedId}"]`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true })).toBeEnabled();
  await expect.poll(async () => ({
    live: Number(await page.locator("main.matter-shell").getAttribute("data-tree-revision")),
    stored: await readStoredRevision(page),
    phase: await sidebar.getAttribute("data-persistence-phase"),
  })).toEqual({ live: initialRevision + 1, stored: initialRevision + 1, phase: "saved" });

  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await archive.getByLabel(fixtureUiCopy.materialFiles.archiveChooseMaterialArchive).setInputFiles(backupPath);
  await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveReplace, exact: true }).click();
  await expect(archive).toHaveCount(0);
  await expect(page.locator(`[data-thought-id="${removedId}"]`)).toHaveCount(1);
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialIds.length);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true })).toBeDisabled();
  await expect.poll(() => readStoredRevision(page)).toBe(initialRevision);

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`[data-thought-id="${removedId}"]`)).toHaveCount(1);
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialIds.length);
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true })).toBeDisabled();
});

async function readMaterialSession(page: Page) {
  return page.locator("main.matter-shell").evaluate((main) => ({
    treeRevision: main.getAttribute("data-tree-revision"),
    view: main.getAttribute("data-view"),
    viewport: [
      main.getAttribute("data-viewport-x"),
      main.getAttribute("data-viewport-y"),
      main.getAttribute("data-viewport-zoom"),
    ],
    nodes: Array.from(document.querySelectorAll<HTMLElement>("[data-thought-id]")).map((node) => ({
      id: node.dataset.thoughtId,
      selected: node.hasAttribute("data-selected"),
      text: node.querySelector<HTMLElement>("[data-thought-text-id]")?.textContent ?? null,
    })),
  }));
}

async function readStoredRevision(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
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
  });
}
