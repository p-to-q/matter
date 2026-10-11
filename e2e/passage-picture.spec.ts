import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_CANVAS_PREFERENCES } from "../features/matter/components/canvas-preferences";
import { pictureCopy } from "../features/matter/components/picture-copy";
import { importSnapshotArchive } from "../features/matter/persistence/archive-transport";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import {
  exportCurrentArchive,
  PICTURE_WIDTH,
  PNG,
  POINTER,
  replaceWith,
  seedBlob,
  withPictureOn,
} from "./picture-driver";

const copy = pictureCopy(DEFAULT_CANVAS_PREFERENCES.language);

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

  // An archive that names the picture without carrying it leaves this device
  // with no bytes: the honest plate, in the picture's own box.
  await replaceWith(page, await withPictureOn(plain, targetId, { bytes: false }));
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
