import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { CANVAS_PREFERENCES_STORAGE_KEY } from "../features/matter/components/canvas-preferences";
import { materialFilesCopy } from "../features/matter/components/material-files-copy";
import { MATTER_LOCALES } from "../features/matter/config/locales";
import { parseContextReceipt } from "../features/matter/material/context-receipt";
import { renderOutlineMarkdown } from "../features/matter/material/render/list";
import {
  SEEDED_DOCUMENT_NODE_IDS as IDS,
  SEEDED_DOCUMENT_TREE_ID,
} from "../features/matter/material/seeded-document";
import { seededInitialNodeText } from "../features/matter/material/seeded-material-core";
import { fixtureUiCopy } from "./matter-ui-copy";

const copy = fixtureUiCopy.materialFiles;
const RECEIPT_NAME = new RegExp(`^matter-receipt-${SEEDED_DOCUMENT_TREE_ID.slice(0, 8)}-r\\d+\\.md$`, "u");

test.describe.configure({ timeout: 90_000 });

async function open(page: Page, width = 1280, height = 800): Promise<Locator> {
  await page.setViewportSize({ width, height });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const sidebar = page.locator("aside.material-files");
  if (width < 960) {
    await page.getByRole("button", { name: copy.showMaterialFiles }).first().click();
  }
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(sidebar).toHaveAttribute("data-persistence-phase", "saved");
  return sidebar;
}

function check(sidebar: Locator, nodeId: string) {
  return sidebar.locator(`.material-file[data-node-id="${nodeId}"]`).getByRole("checkbox");
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function parsedReceipt(markdown: string) {
  const result = await parseContextReceipt(markdown);
  if (!result.ok) throw new Error(`receipt rejected: ${result.reason}`);
  return result.projection;
}

async function downloadText(download: Download): Promise<string> {
  const path = await download.path();
  if (path === null) throw new Error("The download produced no local file.");
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
}

async function readClipboardHtml(page: Page): Promise<string> {
  return page.evaluate(async () => {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes("text/html")) return (await (await item.getType("text/html")).text());
    }
    return "";
  });
}

const text = (key: Parameters<typeof seededInitialNodeText>[0]) => seededInitialNodeText(key);
const listOf = (items: readonly (readonly [number, Parameters<typeof seededInitialNodeText>[0]])[]) =>
  renderOutlineMarkdown(items.map(([depth, key]) => ({ depth, text: text(key) })));

function contextRows(sidebar: Locator) {
  return sidebar.locator('.material-file__check[data-context="true"]');
}

test("ticking a passage ticks its ancestors as context, and one Copy writes the nested Markdown list", async ({ context, page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sidebar = await open(page);
  await sidebar.getByRole("button", { name: copy.select, exact: true }).click();

  const copyButton = sidebar.getByRole("button", { name: copy.copySelectedThoughts(0) });
  await expect(copyButton).toBeDisabled();
  // One Copy in the footer; the receipt is an Archive act, not a select-mode one.
  await expect(sidebar.locator(".material-files__footer button")).toHaveCount(1);
  await expect(sidebar.getByRole("button", { name: copy.archiveReceiptCopy, exact: true })).toHaveCount(0);

  // Ticking the deepest passage ticks the two above it, in a quieter ink, and counts all three.
  await check(sidebar, IDS.imaginedTime).check();
  await expect(check(sidebar, IDS.imaginedLives)).toBeChecked();
  await expect(check(sidebar, IDS.root)).toBeChecked();
  await expect(contextRows(sidebar)).toHaveCount(2);
  await expect(sidebar.locator(`.material-file[data-node-id="${IDS.imaginedTime}"] .material-file__check`)).not.toHaveAttribute("data-context", "true");
  await expect(sidebar).toContainText(copy.selectedCount(3));
  // Context rows are still real checked checkboxes, and say why.
  const contextBox = check(sidebar, IDS.imaginedLives);
  const described = await contextBox.getAttribute("aria-describedby");
  expect(described).not.toBeNull();
  await expect(page.locator(`[id="${described}"]`)).toHaveText(copy.includedAsContext);

  await sidebar.getByRole("button", { name: copy.copySelectedThoughts(3) }).click();
  await expect(sidebar).toContainText(copy.copied);
  const nested = listOf([[0, "root"], [1, "imaginedLives"], [2, "imaginedTime"]]);
  expect(await readClipboard(page)).toBe(nested);
  expect(nested.split("\n")).toHaveLength(3);
  const html = await readClipboardHtml(page);
  expect(html.match(/<ul>/gu)).toHaveLength(3);
  expect(html).not.toMatch(/\b(?:style|id|class)=/u);
  // The selection survives the copy.
  await expect(sidebar).toContainText(copy.selectedCount(3));

  // Unticking a context row unticks only that row; its descendants stay.
  await check(sidebar, IDS.root).uncheck();
  await expect(check(sidebar, IDS.imaginedLives)).toBeChecked();
  await expect(check(sidebar, IDS.imaginedTime)).toBeChecked();
  await expect(sidebar).toContainText(copy.selectedCount(2));
  await sidebar.getByRole("button", { name: copy.copySelectedThoughts(2) }).click();
  await expect(sidebar).toContainText(copy.copied);
  expect(await readClipboard(page)).toBe(listOf([[0, "imaginedLives"], [1, "imaginedTime"]]));

  // A later tick never re-ticks what the person declined: the sibling pulls the parent, not the root.
  await check(sidebar, IDS.imaginedRelations).check();
  await expect(check(sidebar, IDS.root)).not.toBeChecked();
  await expect(sidebar).toContainText(copy.selectedCount(3));
  await sidebar.getByRole("button", { name: copy.copySelectedThoughts(3) }).click();
  await expect(sidebar).toContainText(copy.copied);
  expect(await readClipboard(page)).toBe(
    listOf([[0, "imaginedLives"], [1, "imaginedTime"], [1, "imaginedRelations"]]),
  );

  // Passages with no structure among them stay the literal join, byte for byte.
  await check(sidebar, IDS.imaginedLives).uncheck();
  await check(sidebar, IDS.imaginedTime).uncheck();
  await expect(sidebar).toContainText(copy.selectedCount(1));
  await sidebar.getByRole("button", { name: copy.copySelectedThoughts(1) }).click();
  await expect(sidebar).toContainText(copy.copied);
  expect(await readClipboard(page)).toBe(text("imaginedRelations"));
  expect(browserErrors).toEqual([]);
});

test("unticking everything, or leaving select mode, clears the session and what was declined", async ({ page }) => {
  const sidebar = await open(page);
  await sidebar.getByRole("button", { name: copy.select, exact: true }).click();
  await check(sidebar, IDS.imaginedTime).check();
  await check(sidebar, IDS.root).uncheck();
  await expect(sidebar).toContainText(copy.selectedCount(2));

  // Done leaves select mode; entering it again starts empty.
  await sidebar.getByRole("button", { name: copy.done, exact: true }).click();
  await sidebar.getByRole("button", { name: copy.select, exact: true }).click();
  await expect(sidebar.locator(".material-file__check input:checked")).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: copy.copySelectedThoughts(0) })).toBeDisabled();

  // The decline went with the session: ticking again pulls the root back in.
  await check(sidebar, IDS.imaginedTime).check();
  await expect(check(sidebar, IDS.root)).toBeChecked();
  // Unticking the last row ends the session as well.
  await check(sidebar, IDS.imaginedTime).uncheck();
  await check(sidebar, IDS.imaginedLives).uncheck();
  await check(sidebar, IDS.root).uncheck();
  await expect(sidebar.locator(".material-file__check input:checked")).toHaveCount(0);
  await check(sidebar, IDS.imaginedTime).check();
  await expect(check(sidebar, IDS.root)).toBeChecked();
});

test("a top-level passage copies as its literal text, and Copy is operable from the keyboard", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sidebar = await open(page);
  await sidebar.getByRole("button", { name: copy.select, exact: true }).click();
  await check(sidebar, IDS.root).check();
  await expect(sidebar).toContainText(copy.selectedCount(1));

  const copyButton = sidebar.getByRole("button", { name: copy.copySelectedThoughts(1) });
  await check(sidebar, IDS.root).focus();
  let reached = false;
  for (let press = 0; press < 40 && !reached; press += 1) {
    await page.keyboard.press("Tab");
    reached = await copyButton.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Space");
  await expect(sidebar).toContainText(copy.copied);
  expect(await readClipboard(page)).toBe(text("root"));

  // Space on a row toggles it, context rows included.
  await check(sidebar, IDS.imaginedLives).check();
  await expect(check(sidebar, IDS.imaginedLives)).toBeChecked();
  await check(sidebar, IDS.imaginedTime).focus();
  await page.keyboard.press("Space");
  await expect(check(sidebar, IDS.imaginedTime)).toBeChecked();
  await check(sidebar, IDS.imaginedLives).focus();
  await page.keyboard.press("Space");
  await expect(check(sidebar, IDS.imaginedLives)).not.toBeChecked();

  // Done returns to browse; Archive and the receipt actions are keyboard-reachable.
  await sidebar.getByRole("button", { name: copy.done, exact: true }).click();
  await sidebar.getByRole("button", { name: copy.archive, exact: true }).focus();
  await page.keyboard.press("Enter");
  const archive = sidebar.getByRole("region", { name: copy.archivePanel });
  await expect(archive).toBeVisible();
  const receiptButton = archive.getByRole("button", { name: copy.archiveReceiptDownload, exact: true });
  const copyReceiptButton = archive.getByRole("button", { name: copy.archiveReceiptCopy, exact: true });
  // One visible line says what the pair is; it is text, not a tooltip.
  const helper = archive.getByText(copy.archiveReceiptDescription, { exact: true });
  await expect(helper).toBeVisible();
  await expect(receiptButton).not.toHaveAttribute("title", /.+/u);
  await expect(copyReceiptButton).not.toHaveAttribute("title", /.+/u);
  const pair = await Promise.all([receiptButton.boundingBox(), copyReceiptButton.boundingBox(), helper.boundingBox()]);
  expect(pair[2]!.y).toBeGreaterThan(Math.max(pair[0]!.y, pair[1]!.y) + pair[0]!.height - 1);

  await archive.getByRole("button", { name: copy.archiveExportCopy, exact: true }).focus();
  let download: Promise<Download> | null = null;
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Tab");
    if (await receiptButton.evaluate((element) => element === document.activeElement)) {
      download = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      break;
    }
  }
  if (download === null) throw new Error("The receipt download was not reachable by Tab.");
  expect((await download).suggestedFilename()).toMatch(RECEIPT_NAME);

  await page.keyboard.press("Tab");
  await expect(copyReceiptButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(archive).toContainText(copy.archiveReceiptCopied);
  const receipt = await parsedReceipt(await readClipboard(page));
  expect(receipt.address).toBe("working-tree");
});

test("the receipt download is the active tree only, and the Archive export is not changed by it", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  const sidebar = await open(page);

  // (d) Set one branch aside first: its passages must be nowhere in the file.
  const heldRow = sidebar.locator(`.material-file[data-node-id="${IDS.imaginedLives}"]`);
  await heldRow.hover();
  await heldRow.locator(".material-file__context-control--set-aside").click();
  await expect(page.locator(`[data-thought-id="${IDS.imaginedTime}"]`))
    .toHaveAttribute("data-context-excluded", "true");

  await sidebar.getByRole("button", { name: copy.archive, exact: true }).click();
  const archive = sidebar.getByRole("region", { name: copy.archivePanel });
  const exportButton = archive.getByRole("button", { name: copy.archiveExportCopy, exact: true });
  const receiptButton = archive.getByRole("button", { name: copy.archiveReceiptDownload, exact: true });
  await expect(receiptButton).toBeEnabled();

  // (f) The Archive export is the lossless ZIP, byte-identical before and after a receipt.
  const firstZip = page.waitForEvent("download");
  await exportButton.click();
  const zipBefore = await firstZip;
  expect(zipBefore.suggestedFilename()).toMatch(/\.matter\.zip$/u);
  const zipBeforePath = await zipBefore.path();
  if (zipBeforePath === null) throw new Error("The first Archive export produced no local file.");
  const zipBeforeBytes = await readFile(zipBeforePath);

  // (e) The receipt: a .md file named for the tree and revision, parsing to the active tree.
  const receiptDownload = page.waitForEvent("download");
  await receiptButton.click();
  const receiptFile = await receiptDownload;
  expect(receiptFile.suggestedFilename()).toMatch(RECEIPT_NAME);
  const markdown = await downloadText(receiptFile);
  const projection = await parsedReceipt(markdown);
  const revision = Number(/^matter-receipt-.{8}-r(\d+)\.md$/u.exec(receiptFile.suggestedFilename())?.[1]);
  expect(projection.revision).toBe(revision);
  expect(projection.address).toBe("working-tree");
  expect(projection.nodes.map(({ nodeId, parentId, depth }) => ({ nodeId, parentId, depth }))).toEqual([
    { nodeId: IDS.root, parentId: null, depth: 0 },
    { nodeId: IDS.presentDistance, parentId: IDS.root, depth: 1 },
    { nodeId: IDS.presentFailure, parentId: IDS.presentDistance, depth: 2 },
    { nodeId: IDS.presentOpening, parentId: IDS.presentDistance, depth: 2 },
    { nodeId: IDS.bodilyMemory, parentId: IDS.root, depth: 1 },
    { nodeId: IDS.bodilyGesture, parentId: IDS.bodilyMemory, depth: 2 },
    { nodeId: IDS.bodilyReturn, parentId: IDS.bodilyMemory, depth: 2 },
  ]);
  expect(projection.thoughtCount).toBe(7);
  expect(projection.clipped).toBe(false);
  for (const heldKey of ["imaginedLives", "imaginedTime", "imaginedRelations"] as const) {
    expect(markdown).not.toContain(seededInitialNodeText(heldKey));
    expect(markdown).not.toContain(IDS[heldKey]);
  }

  // The clipboard receipt is the same receipt: same text, held-aside passages absent too.
  await archive.getByRole("button", { name: copy.archiveReceiptCopy, exact: true }).click();
  await expect(archive).toContainText(copy.archiveReceiptCopied);
  expect(await readClipboard(page)).toBe(markdown);

  const secondZip = page.waitForEvent("download");
  await exportButton.click();
  const zipAfterPath = await (await secondZip).path();
  if (zipAfterPath === null) throw new Error("The second Archive export produced no local file.");
  const zipAfterBytes = await readFile(zipAfterPath);
  expect(zipAfterBytes.equals(zipBeforeBytes)).toBe(true);
  expect(browserErrors).toEqual([]);
});

for (const locale of MATTER_LOCALES) {
  test(`the one Copy and the receipt pair fit the narrow index and carry their visible text in ${locale}`, async ({ page }) => {
    const localized = materialFilesCopy(locale);
    await page.addInitScript(({ key, language }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, language, leafFx: true, appearance: "auto" }));
    }, { key: CANVAS_PREFERENCES_STORAGE_KEY, language: locale });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    const sidebar = page.locator("aside.material-files");
    await page.getByRole("button", { name: localized.showMaterialFiles }).first().click();
    await expect(sidebar).toHaveAttribute("data-open", "true");

    await sidebar.getByRole("button", { name: localized.select, exact: true }).click();
    await check(sidebar, IDS.imaginedLives).check();
    // Ticking a passage pulls its parent in as context, so two rows are ticked.
    const copyButton = sidebar.getByRole("button", { name: localized.copySelectedThoughts(2) });
    const bounds = await sidebar.boundingBox();
    const copyBox = await copyButton.boundingBox();
    expect(copyBox).not.toBeNull();
    expect(copyBox!.x).toBeGreaterThanOrEqual(bounds!.x - 0.5);
    expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.5);
    expect(copyBox!.height).toBeGreaterThanOrEqual(47.5);

    await sidebar.getByRole("button", { name: localized.done, exact: true }).click();
    await sidebar.getByRole("button", { name: localized.archive, exact: true }).click();
    const archive = sidebar.getByRole("region", { name: localized.archivePanel });
    const panel = await archive.boundingBox();
    for (const name of [localized.archiveReceiptDownload, localized.archiveReceiptCopy]) {
      const button = archive.getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(panel!.x - 0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
      expect(box!.height).toBeGreaterThanOrEqual(47.5);
      // The label is not clipped: its text fits inside the button.
      expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    const helper = await archive.getByText(localized.archiveReceiptDescription, { exact: true }).boundingBox();
    expect(helper).not.toBeNull();
    expect(helper!.x + helper!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
  });
}
