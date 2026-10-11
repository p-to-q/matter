import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_CANVAS_PREFERENCES } from "../features/matter/components/canvas-preferences";
import { pictureCopy } from "../features/matter/components/picture-copy";
import { exportSnapshotArchive, importSnapshotArchive } from "../features/matter/persistence/archive-transport";
import { treeToBundle } from "../features/matter/persistence/snapshot-codec";
import type { ImagePointer } from "../features/matter/tree/image-pointer";
import type { ThoughtTree } from "../features/matter/tree/model";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

const copy = pictureCopy(DEFAULT_CANVAS_PREFERENCES.language);
const PICTURE_WIDTH = 512;
const PICTURE_HEIGHT = 256;

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

const PNG = solidPng(PICTURE_WIDTH, PICTURE_HEIGHT);
const POINTER: ImagePointer = {
  mediaType: "image/png",
  byteLength: PNG.byteLength,
  width: PICTURE_WIDTH,
  height: PICTURE_HEIGHT,
  contentHash: createHash("sha256").update(PNG).digest("hex"),
};

async function exportCurrentArchive(page: Page): Promise<Uint8Array> {
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

async function replaceWith(page: Page, bytes: Uint8Array): Promise<void> {
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

async function withPictureOn(archive: Uint8Array, target: string): Promise<Uint8Array> {
  const imported = await importSnapshotArchive(archive);
  if (!imported.ok) throw new Error(imported.error.message);
  const node = imported.tree.nodes[target];
  if (node === undefined) throw new Error("fixture passage is missing");
  const tree: ThoughtTree = {
    ...imported.tree,
    nodes: { ...imported.tree.nodes, [target]: { ...node, image: POINTER } },
  };
  const exported = await exportSnapshotArchive(
    treeToBundle(tree),
    new Map([[POINTER.contentHash, PNG]]),
  );
  if (!exported.ok) throw new Error(exported.error.message);
  expect(exported.missingImages).toBe(0);
  return exported.bytes;
}

type Geometry = Readonly<{
  gap: number;
  picture: Readonly<{ width: number; height: number; marginTop: number }> | null;
}>;

/** Distances in layout pixels, so the camera's zoom and pan cannot move the answer. */
async function geometry(page: Page, targetId: string, siblingId: string): Promise<Geometry> {
  return page.evaluate(({ siblingId: sibling, targetId: target }) => {
    const find = (id: string) => {
      const element = document.querySelector<HTMLElement>(`[data-thought-id="${id}"]`);
      if (element === null) throw new Error(`passage ${id} is not rendered`);
      return element;
    };
    const targetElement = find(target);
    const targetBox = targetElement.getBoundingClientRect();
    const scale = targetBox.width / targetElement.offsetWidth;
    const gap = (find(sibling).getBoundingClientRect().top - targetBox.top) / scale;
    const picture = targetElement.querySelector<HTMLElement>(".passage-picture");
    if (picture === null) return { gap, picture: null };
    const pictureBox = picture.getBoundingClientRect();
    return {
      gap,
      picture: {
        width: pictureBox.width / scale,
        height: pictureBox.height / scale,
        marginTop: parseFloat(getComputedStyle(picture).marginTop),
      },
    };
  }, { siblingId, targetId });
}

async function seedBlob(page: Page, pointer: ImagePointer, bytes: readonly number[]): Promise<void> {
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

test("a passage that carries a picture shows it, or an honest plate of the same size, without moving layout", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    const record = { created: [] as string[], revoked: [] as string[] };
    (window as unknown as { __objectUrls: typeof record }).__objectUrls = record;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (source) => {
      const url = create(source);
      record.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      record.revoked.push(url);
      revoke(url);
    };
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const plain = await exportCurrentArchive(page);
  const exportDownloadUrls = await page.evaluate(() => (window as unknown as {
    __objectUrls: { created: string[] };
  }).__objectUrls.created.length);
  const tree = await importSnapshotArchive(plain);
  if (!tree.ok) throw new Error(tree.error.message);
  // A leaf with a following sibling: siblings are spaced by their subtrees, so
  // only a leaf's own height decides where the next one starts.
  const parent = Object.values(tree.tree.nodes).find((node) =>
    node.role !== "document-root" && node.children.length >= 2 &&
    tree.tree.nodes[node.children[0] ?? ""]?.children.length === 0);
  const [targetId, siblingId] = parent?.children ?? [];
  if (targetId === undefined || siblingId === undefined) throw new Error("fixture needs two sibling passages");
  const target = page.locator(`[data-thought-id="${targetId}"]`);
  const baseline = await geometry(page, targetId, siblingId);
  expect(baseline.picture).toBeNull();
  await expect(page.locator(".passage-picture")).toHaveCount(0);

  // The archive carries the bytes, but replacing material imports pointers only,
  // so this device holds none: the honest plate, in the picture's own box.
  await replaceWith(page, await withPictureOn(plain, targetId));
  const absent = target.locator('.passage-picture[data-picture-state="absent"]');
  await expect(absent).toHaveAttribute("role", "img");
  await expect(absent).toHaveAttribute("aria-label", copy.absent);
  await expect(absent).toContainText(copy.absent);
  await expect(target.locator("img")).toHaveCount(0);
  // Layout truth: the next sibling moves down by exactly the picture box and its margin.
  await expect.poll(async () => (await geometry(page, targetId, siblingId)).gap - baseline.gap).toBeCloseTo(160 + 10, 0);
  const plate = await geometry(page, targetId, siblingId);
  expect(plate.picture?.width).toBeCloseTo(320, 0);
  expect(plate.picture?.height).toBeCloseTo(160, 0);
  expect(plate.picture?.marginTop).toBe(10);
  // Only the export download made a URL; a placeholder never does.
  expect(await page.evaluate(() => (window as unknown as {
    __objectUrls: { created: string[] };
  }).__objectUrls.created.length)).toBe(exportDownloadUrls);

  // The bytes arrive on this device; a fresh mount reads them and the box does not change.
  await seedBlob(page, POINTER, Array.from(PNG));
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const picture = target.getByRole("img", { name: copy.alt });
  await expect(picture).toBeVisible();
  await expect(target.locator('.passage-picture[data-picture-state="resident"]')).toHaveCount(1);
  await expect(picture).toHaveAttribute("src", /^blob:/u);
  await expect(picture).toHaveAttribute("decoding", "async");
  await expect(picture).toHaveAttribute("loading", "lazy");
  // The image is lazy: it paints only once the camera brings its passage into view.
  await selectThoughtThroughMaterialIndex(page, targetId);
  await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(PICTURE_WIDTH);
  const shown = await geometry(page, targetId, siblingId);
  expect(shown.picture).toEqual(plate.picture);
  expect(shown.gap).toBeCloseTo(plate.gap, 0);
  const created = await page.evaluate(() => (window as unknown as {
    __objectUrls: { created: string[] };
  }).__objectUrls.created);
  expect(created).toHaveLength(1);

  // Replacing the material without the picture unmounts it and releases its URL.
  await replaceWith(page, plain);
  await expect(page.locator(".passage-picture")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __objectUrls: { revoked: string[] };
  }).__objectUrls.revoked)).toEqual(created);
  const removed = await geometry(page, targetId, siblingId);
  expect(removed.gap).toBeCloseTo(baseline.gap, 0);
  expect(browserErrors).toEqual([]);
});
