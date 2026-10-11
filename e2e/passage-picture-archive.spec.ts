import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { DEFAULT_CANVAS_PREFERENCES } from "../features/matter/components/canvas-preferences";
import { pictureCopy } from "../features/matter/components/picture-copy";
import {
  deleteBlobRow,
  exportKeepingPanel,
  plainArchiveOf,
  PNG,
  POINTER,
  readBlobRow,
  replaceWith,
  seedBlob,
  withPictureOn,
} from "./picture-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const copy = pictureCopy(DEFAULT_CANVAS_PREFERENCES.language);
const files = fixtureUiCopy.materialFiles;
const BLOB_ENTRY = `matter/blobs/${POINTER.contentHash}.png`;

async function openMatter(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
}

test("an export carries the bytes a device holds, with no notice", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await openMatter(page);
  const plain = await plainArchiveOf(page);
  // Pointer only: this device holds nothing until the row is written below.
  await replaceWith(page, await withPictureOn(plain.bytes, plain.targetId, { bytes: false }));
  await seedBlob(page, POINTER, Array.from(PNG));

  const { bytes, panel } = await exportKeepingPanel(page);

  const entries = unzipSync(bytes);
  expect(Object.keys(entries).filter((path) => path.startsWith("matter/blobs/"))).toEqual([BLOB_ENTRY]);
  expect(Array.from(entries[BLOB_ENTRY] ?? [])).toEqual(Array.from(PNG));
  await expect(panel.locator(".material-files__archive-status")).toHaveText("");
  await expect(panel).not.toContainText(files.archivePicturesNotExported(1));
  expect(browserErrors).toEqual([]);
});

test("an export still succeeds when the bytes are gone, and says how many pictures it left out", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await openMatter(page);
  const plain = await plainArchiveOf(page);
  await replaceWith(page, await withPictureOn(plain.bytes, plain.targetId));
  expect(await readBlobRow(page, POINTER.contentHash)).not.toBeNull();
  await deleteBlobRow(page, POINTER.contentHash);
  // A fresh mount has an empty session cache, so only the store could answer.
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`[data-thought-id="${plain.targetId}"] .passage-picture[data-picture-state="absent"]`))
    .toHaveCount(1);

  const { bytes, panel } = await exportKeepingPanel(page);

  expect(Object.keys(unzipSync(bytes)).filter((path) => path.startsWith("matter/blobs/"))).toEqual([]);
  await expect(panel.locator(".material-files__archive-status"))
    .toHaveText(files.archivePicturesNotExported(1));
  expect(browserErrors).toEqual([]);
});

test("an import stores the bytes it carries, and the picture is there after a reload", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await openMatter(page);
  const plain = await plainArchiveOf(page);
  const target = page.locator(`[data-thought-id="${plain.targetId}"]`);
  expect(await readBlobRow(page, POINTER.contentHash)).toBeNull();

  await replaceWith(page, await withPictureOn(plain.bytes, plain.targetId));

  const row = await readBlobRow(page, POINTER.contentHash);
  expect(row?.byteLength).toBe(PNG.byteLength);
  expect(row?.bytes).toEqual(Array.from(PNG));
  await expect(target.locator('.passage-picture[data-picture-state="resident"]')).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(target.locator('.passage-picture[data-picture-state="resident"]')).toHaveCount(1);
  await expect(target.getByRole("img", { name: copy.alt })).toHaveAttribute("src", /^blob:/u);
  await expect(page.locator("[data-thought-id]")).not.toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("an import the store cannot hold still succeeds, shows the picture, and says it is temporary", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "blobs") throw new DOMException("storage full", "QuotaExceededError");
      return originalPut.apply(this, args);
    };
  });
  await openMatter(page);
  const plain = await plainArchiveOf(page);
  const target = page.locator(`[data-thought-id="${plain.targetId}"]`);
  const sidebar = page.locator("aside.material-files");

  await sidebar.getByRole("button", { name: files.archive, exact: true }).click();
  const panel = sidebar.getByRole("region", { name: files.archivePanel });
  await panel.getByLabel(files.archiveChooseMaterialArchive).setInputFiles({
    name: "picture.matter.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await withPictureOn(plain.bytes, plain.targetId)),
  });
  await expect(panel).toContainText(files.archiveConfirmReplace);
  await panel.getByRole("button", { name: files.archiveReplace, exact: true }).click();

  // The document was replaced, and the panel stays to say what was not kept.
  await expect(panel.locator(".material-files__archive-status")).toHaveText(files.archivePicturesNotSaved(1));
  await expect(panel.locator(".material-files__archive-error")).toHaveText("");
  await expect(target.locator('.passage-picture[data-picture-state="resident"]')).toHaveCount(1);
  await expect(target.getByRole("img", { name: copy.alt })).toHaveAttribute("src", /^blob:/u);
  expect(await readBlobRow(page, POINTER.contentHash)).toBeNull();

  // The session cache still lets the person keep the picture.
  const { bytes, panel: afterExport } = await exportKeepingPanel(page);
  expect(Array.from(unzipSync(bytes)[BLOB_ENTRY] ?? [])).toEqual(Array.from(PNG));
  // A finished export replaces the import's notice, and the panel stays open.
  await expect(afterExport.locator(".material-files__archive-status")).toHaveText("");

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(target.locator('.passage-picture[data-picture-state="absent"]')).toHaveCount(1);
  await expect(target.locator('.passage-picture[data-picture-state="absent"]')).toContainText(copy.absent);
  expect(browserErrors).toEqual([]);
});
