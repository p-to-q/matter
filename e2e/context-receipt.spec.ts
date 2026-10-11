import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { CANVAS_PREFERENCES_STORAGE_KEY } from "../features/matter/components/canvas-preferences";
import { materialFilesCopy } from "../features/matter/components/material-files-copy";
import { MATTER_LOCALES } from "../features/matter/config/locales";
import { parseContextReceipt } from "../features/matter/material/context-receipt";
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

test("native Copy stays literal text while Copy with context writes a checkable receipt", async ({ context, page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sidebar = await open(page);
  await sidebar.getByRole("button", { name: copy.select, exact: true }).click();

  const copyButton = sidebar.getByRole("button", { name: copy.copySelectedThoughts(0) });
  const contextButton = sidebar.getByRole("button", { name: copy.copyWithContext, exact: true });
  // Both actions are enabled by the same condition: nothing selected, neither.
  await expect(copyButton).toBeDisabled();
  await expect(contextButton).toBeDisabled();

  // (a) Native Copy: the literal join of a mixed selection, in authored order.
  await check(sidebar, IDS.imaginedRelations).check();
  await check(sidebar, IDS.root).check();
  await check(sidebar, IDS.presentDistance).check();
  await expect(sidebar).toContainText(copy.selectedCount(3));
  await expect(contextButton).toBeEnabled();
  await sidebar.getByRole("button", { name: copy.copySelectedThoughts(3) }).click();
  await expect(sidebar).toContainText(copy.copied);
  expect(await readClipboard(page)).toBe([
    seededInitialNodeText("root"),
    seededInitialNodeText("imaginedRelations"),
    seededInitialNodeText("presentDistance"),
  ].join("\n\n"));

  // (b) Copy with context on a selected parent and child.
  await check(sidebar, IDS.imaginedRelations).uncheck();
  await check(sidebar, IDS.root).uncheck();
  await check(sidebar, IDS.presentDistance).uncheck();
  await check(sidebar, IDS.imaginedTime).check();
  await check(sidebar, IDS.imaginedLives).check();
  await contextButton.click();
  await expect(sidebar).toContainText(copy.copiedWithContext);
  const withParent = await parsedReceipt(await readClipboard(page));
  expect(withParent.address).toBe("working-tree");
  expect(withParent.nodes.map(({ nodeId, parentId, depth, text }) => ({ nodeId, parentId, depth, text }))).toEqual([
    { nodeId: IDS.imaginedLives, parentId: null, depth: 1, text: seededInitialNodeText("imaginedLives") },
    {
      nodeId: IDS.imaginedTime,
      parentId: IDS.imaginedLives,
      depth: 2,
      text: seededInitialNodeText("imaginedTime"),
    },
  ]);
  expect(withParent.treeId).toBe(SEEDED_DOCUMENT_TREE_ID);
  expect(withParent.clipped).toBe(false);
  // The selection survives the copy, exactly as it does for native Copy.
  await expect(sidebar).toContainText(copy.selectedCount(2));

  // (c) A child alone has no parent in the receipt, and keeps its true depth.
  await check(sidebar, IDS.imaginedLives).uncheck();
  await contextButton.click();
  await expect(sidebar).toContainText(copy.copiedWithContext);
  const alone = await parsedReceipt(await readClipboard(page));
  expect(alone.nodes.map(({ nodeId, parentId, depth }) => ({ nodeId, parentId, depth }))).toEqual([
    { nodeId: IDS.imaginedTime, parentId: null, depth: 2 },
  ]);

  // Native Copy is untouched by all of the above.
  await sidebar.getByRole("button", { name: copy.copySelectedThoughts(1) }).click();
  expect(await readClipboard(page)).toBe(seededInitialNodeText("imaginedTime"));
  expect(browserErrors).toEqual([]);
});

test("both copy actions and the receipt download are reachable and operable from the keyboard", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sidebar = await open(page);
  await sidebar.getByRole("button", { name: copy.select, exact: true }).click();
  await check(sidebar, IDS.imaginedLives).check();
  await check(sidebar, IDS.imaginedRelations).check();

  const copyButton = sidebar.getByRole("button", { name: copy.copySelectedThoughts(2) });
  const contextButton = sidebar.getByRole("button", { name: copy.copyWithContext, exact: true });
  await check(sidebar, IDS.imaginedRelations).focus();
  let reached = false;
  for (let press = 0; press < 40 && !reached; press += 1) {
    await page.keyboard.press("Tab");
    reached = await contextButton.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(sidebar).toContainText(copy.copiedWithContext);
  const receipt = await parsedReceipt(await readClipboard(page));
  expect(receipt.nodes.map(({ nodeId, parentId }) => [nodeId, parentId])).toEqual([
    [IDS.imaginedLives, null],
    [IDS.imaginedRelations, IDS.imaginedLives],
  ]);

  await page.keyboard.press("Tab");
  await expect(copyButton).toBeFocused();
  await page.keyboard.press("Space");
  await expect(sidebar).toContainText(copy.copied);
  expect(await readClipboard(page)).toBe(
    [seededInitialNodeText("imaginedLives"), seededInitialNodeText("imaginedRelations")].join("\n\n"),
  );

  // Done returns to browse; Archive and the receipt download are keyboard-only reachable.
  await sidebar.getByRole("button", { name: copy.done, exact: true }).click();
  await sidebar.getByRole("button", { name: copy.archive, exact: true }).focus();
  await page.keyboard.press("Enter");
  const archive = sidebar.getByRole("region", { name: copy.archivePanel });
  await expect(archive).toBeVisible();
  const receiptButton = archive.getByRole("button", { name: copy.archiveReceiptDownload, exact: true });
  await expect(receiptButton).toHaveAttribute("title", copy.archiveReceiptDescription);
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
});

test("the receipt download is the active tree only, and the Archive export is not changed by it", async ({ page }) => {
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

  const secondZip = page.waitForEvent("download");
  await exportButton.click();
  const zipAfterPath = await (await secondZip).path();
  if (zipAfterPath === null) throw new Error("The second Archive export produced no local file.");
  const zipAfterBytes = await readFile(zipAfterPath);
  expect(zipAfterBytes.equals(zipBeforeBytes)).toBe(true);
  expect(browserErrors).toEqual([]);
});

for (const locale of MATTER_LOCALES) {
  test(`the new actions fit the narrow index and carry their visible text in ${locale}`, async ({ page }) => {
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
    const contextButton = sidebar.getByRole("button", { name: localized.copyWithContext, exact: true });
    const copyButton = sidebar.getByRole("button", { name: localized.copySelectedThoughts(1) });
    const bounds = await sidebar.boundingBox();
    for (const button of [contextButton, copyButton]) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.5);
      expect(box!.height).toBeGreaterThanOrEqual(47.5);
    }

    await sidebar.getByRole("button", { name: localized.done, exact: true }).click();
    await sidebar.getByRole("button", { name: localized.archive, exact: true }).click();
    const archive = sidebar.getByRole("region", { name: localized.archivePanel });
    const receiptButton = archive.getByRole("button", { name: localized.archiveReceiptDownload, exact: true });
    await expect(receiptButton).toHaveAttribute("title", localized.archiveReceiptDescription);
    const panel = await archive.boundingBox();
    const box = await receiptButton.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
  });
}
