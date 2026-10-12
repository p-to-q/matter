import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";
import { expect, type Locator, type Page } from "@playwright/test";
import { exportSnapshotArchive, importSnapshotArchive } from "../features/matter/persistence/archive-transport";
import { treeToBundle } from "../features/matter/persistence/snapshot-codec";
import type { ImagePointer } from "../features/matter/tree/image-pointer";
import type { ThoughtTree } from "../features/matter/tree/model";
import { fixtureUiCopy } from "./matter-ui-copy";

export const PICTURE_WIDTH = 512;
export const PICTURE_HEIGHT = 256;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const frame = Buffer.alloc(12 + data.length);
  frame.writeUInt32BE(data.length, 0);
  body.copy(frame, 4);
  frame.writeUInt32BE(crc32(body), 8 + data.length);
  return frame;
}

/** A real, decodable PNG: a browser must be able to paint it, not merely sniff it. */
function solidPng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((1 + width * 3) * height);
  for (let row = 0; row < height; row += 1) {
    const start = row * (1 + width * 3);
    for (let column = 0; column < width; column += 1) {
      rows[start + 1 + column * 3] = 40;
      rows[start + 2 + column * 3] = 120 + (row % 64);
      rows[start + 3 + column * 3] = 200;
    }
  }
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

/** A picture of any size: its bytes, its hash, and the pointer a document would carry for it. */
export type PictureFixture = Readonly<{ png: Uint8Array; sha256: string; pointer: ImagePointer }>;

export function pictureOfSize(width: number, height: number): PictureFixture {
  const png = solidPng(width, height);
  const sha256 = createHash("sha256").update(png).digest("hex");
  return {
    png,
    sha256,
    pointer: { mediaType: "image/png", byteLength: png.byteLength, width, height, contentHash: sha256 },
  };
}

export const PNG = solidPng(PICTURE_WIDTH, PICTURE_HEIGHT);
export const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: PNG.byteLength,
  width: PICTURE_WIDTH,
  height: PICTURE_HEIGHT,
  contentHash: createHash("sha256").update(PNG).digest("hex"),
};

export async function exportCurrentArchive(page: Page): Promise<Uint8Array> {
  const sidebar = page.locator("aside.material-files");
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  const panel = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy }).click();
  const path = await (await download).path();
  if (path === null) throw new Error("Archive download did not produce a local file.");
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.close, exact: true }).click();
  return new Uint8Array(await readFile(path));
}

export async function replaceWith(page: Page, bytes: Uint8Array): Promise<void> {
  const sidebar = page.locator("aside.material-files");
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  const panel = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await panel.getByLabel(fixtureUiCopy.materialFiles.archiveChooseMaterialArchive).setInputFiles({
    name: "picture.matter.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(bytes),
  });
  await expect(panel).toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
  await panel.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveReplace, exact: true }).click();
  await expect(sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel })).toHaveCount(0);
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
}

/**
 * `bytes: false` builds an archive that names the picture but does not carry
 * it, which is what an export from a device that lost the bytes produces.
 */
export async function withPictureOn(
  archive: Uint8Array,
  target: string,
  options: Readonly<{ bytes?: boolean; picture?: PictureFixture }> = {},
): Promise<Uint8Array> {
  const withBytes = options.bytes !== false;
  const picture = options.picture ?? { png: PNG, sha256: POINTER.contentHash, pointer: POINTER };
  const imported = await importSnapshotArchive(archive);
  if (!imported.ok) throw new Error(imported.error.message);
  const node = imported.tree.nodes[target];
  if (node === undefined) throw new Error("fixture passage is missing");
  const tree: ThoughtTree = {
    ...imported.tree,
    nodes: { ...imported.tree.nodes, [target]: { ...node, image: picture.pointer } },
  };
  const exported = await exportSnapshotArchive(
    treeToBundle(tree),
    withBytes ? new Map([[picture.sha256, picture.png]]) : new Map(),
  );
  if (!exported.ok) throw new Error(exported.error.message);
  expect(exported.missingImages).toBe(withBytes ? 0 : 1);
  return exported.bytes;
}

export async function seedBlob(page: Page, pointer: ImagePointer, bytes: readonly number[]): Promise<void> {
  await page.evaluate(async ({ bytes: raw, pointer: held }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("blobs", "readwrite");
        transaction.objectStore("blobs").put({
          storageSchemaVersion: 1,
          ...held,
          bytes: Uint8Array.from(raw).buffer,
          storedAt: new Date().toISOString(),
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, { bytes, pointer });
}


/** The first leaf that has a following sibling, so only its own height decides the next one's place. */
export function pickPassage(tree: ThoughtTree): string {
  const parent = Object.values(tree.nodes).find((node) =>
    node.role !== "document-root" && node.children.length >= 2 &&
    tree.nodes[node.children[0] ?? ""]?.children.length === 0);
  const target = parent?.children[0];
  if (target === undefined) throw new Error("fixture needs two sibling passages");
  return target;
}

export async function plainArchiveOf(page: Page): Promise<Readonly<{ bytes: Uint8Array; targetId: string }>> {
  const bytes = await exportCurrentArchive(page);
  const imported = await importSnapshotArchive(bytes);
  if (!imported.ok) throw new Error(imported.error.message);
  return { bytes, targetId: pickPassage(imported.tree) };
}

/** Opens Archive, exports, and leaves the panel open so its status line can be read. */
export async function exportKeepingPanel(page: Page): Promise<Readonly<{ bytes: Uint8Array; panel: Locator }>> {
  const sidebar = page.locator("aside.material-files");
  const panel = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  if (!(await panel.isVisible())) {
    await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  }
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy }).click();
  const path = await (await download).path();
  if (path === null) throw new Error("Archive download did not produce a local file.");
  await expect(panel.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveExportCopy })).toBeEnabled();
  return { bytes: new Uint8Array(await readFile(path)), panel };
}

/** The raw `blobs` row, or null when this device holds none. */
export async function readBlobRow(page: Page, contentHash: string): Promise<Readonly<{ bytes: number[]; byteLength: number }> | null> {
  return page.evaluate(async (hash) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const row = await new Promise<{ bytes: ArrayBuffer; byteLength: number } | undefined>((resolve, reject) => {
        const request = database.transaction("blobs", "readonly").objectStore("blobs").get(hash);
        request.onsuccess = () => resolve(request.result as { bytes: ArrayBuffer; byteLength: number } | undefined);
        request.onerror = () => reject(request.error);
      });
      return row === undefined
        ? null
        : { bytes: Array.from(new Uint8Array(row.bytes)), byteLength: row.byteLength };
    } finally {
      database.close();
    }
  }, contentHash);
}

export async function deleteBlobRow(page: Page, contentHash: string): Promise<void> {
  await page.evaluate(async (hash) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ptoq-matter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("blobs", "readwrite");
        transaction.objectStore("blobs").delete(hash);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, contentHash);
}
