import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodeWikiExport } from "../features/matter/wiki/wiki-export";

const WIKI_TITLE = "词典 WIKI";
const EXAMPLES = Object.freeze([
  "Morphogenesis",
  "Engelbart",
  "KFC",
  "[p → q]",
]);
const WIKI_STATE_KEYS = Object.freeze([
  "aliasTombstones",
  "authorities",
  "automaticLearningSaturated",
  "evidence",
  "fittingVersion",
  "lexemeTombstones",
  "lexemes",
  "nextLexemeId",
  "recentObservationCount",
  "revision",
  "schemaVersion",
  "scoringVersion",
]);

test("desktop Wiki preserves a person's explicit dictionary journey and exports its strict state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const settings = page.getByRole("button", { name: "Matter 设置", exact: true });
  await settings.click();
  const menu = page.getByRole("menu", { name: "Matter 设置" });
  const menuItems = (await menu.getByRole("menuitem").allInnerTexts())
    .map((label) => label.replace(/\s+/gu, " ").trim());
  expect(menuItems.indexOf(WIKI_TITLE)).toBeGreaterThanOrEqual(0);
  expect(menuItems.indexOf(WIKI_TITLE)).toBe(menuItems.indexOf("模型 API") - 1);

  await menu.getByRole("menuitem", { name: WIKI_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: WIKI_TITLE, exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: `关闭: ${WIKI_TITLE}` });
  await expect(close).toBeFocused();
  await expectExampleOrder(dialog);

  await dialog.getByRole("button", { name: "Engelbart", exact: true }).click();
  const word = dialog.getByRole("textbox", { name: "词语或名称" });
  const scope = dialog.getByRole("combobox", { name: "应用于" });
  await expect(word).toHaveValue("Engelbart");
  await expect(scope).toHaveValue("both");
  await dialog.getByRole("button", { name: "加入词典", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Engelbart", exact: true })).toBeVisible();
  await expect(dialog).toContainText("已保存在这台设备上。");
  await expect(dialog.getByRole("button", { name: "全部", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "自动收录", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "人工确认", exact: true })).toBeVisible();
  expect(await dialog.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(3);
  const entry = dialog.getByRole("button", { name: "Engelbart", exact: true });
  await entry.hover();
  await expect(dialog.getByRole("button", { name: "修改: Engelbart", exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await entry.focus();
  await expect(dialog.getByRole("button", { name: "修改: Engelbart", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "自动收录", exact: true }).click();
  await expect(entry).toHaveCount(0);
  await dialog.getByRole("button", { name: "人工确认", exact: true }).click();
  await expect(entry).toBeVisible();

  await entry.click();
  await scope.selectOption("spoken");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await openDesktopWiki(page);
  await expect(dialog.getByRole("button", { name: "Engelbart", exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Engelbart", exact: true }).click();
  await expect(scope).toHaveValue("spoken");
  await word.fill("Douglas Engelbart");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const editedRow = dialog.getByRole("button", { name: "Douglas Engelbart", exact: true });
  await expect(editedRow).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Engelbart", exact: true })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出词典", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("matter-wiki.json");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = await readFile(downloadPath!);
  const decoded = decodeWikiExport(new Uint8Array(bytes));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(`Wiki export failed strict decoding: ${decoded.code}`);
  const envelope = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  expect(Object.keys(envelope).sort()).toEqual(["format", "formatVersion", "state"]);
  expect(envelope.format).toBe("matter-wiki");
  expect(envelope.formatVersion).toBe(2);
  const state = envelope.state as Record<string, unknown>;
  expect(Object.keys(state).sort()).toEqual(WIKI_STATE_KEYS);
  const lexemes = state.lexemes as Array<Record<string, unknown>>;
  expect(lexemes).toHaveLength(1);
  expect(Object.keys(lexemes[0]!).sort()).toEqual([
    "canonical",
    "confirmedAtRevision",
    "id",
    "locale",
    "provenance",
    "scope",
  ]);
  expect(lexemes[0]).toMatchObject({
    canonical: "Douglas Engelbart",
    locale: "en-US",
    provenance: "human-confirmed",
    scope: "spoken",
  });
  expect(decoded.envelope.state.lexemes).toEqual(lexemes);

  await editedRow.click();
  await dialog.getByRole("button", { name: "移出词典", exact: true }).click();
  const removeDialog = dialog.getByRole("alertdialog", { name: "从词典中移除这个词？" });
  await expect(removeDialog).toBeVisible();
  await expect(word).toHaveValue("Douglas Engelbart");
  const confirmRemove = removeDialog.getByRole("button", { name: "确认", exact: true });
  await expect(confirmRemove).toBeFocused();
  await confirmRemove.click();
  await expect(editedRow).toHaveCount(0);
  await expectExampleOrder(dialog);

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await openDesktopWiki(page);
  await expect(dialog.getByRole("button", { name: "Douglas Engelbart", exact: true })).toHaveCount(0);
  await expectExampleOrder(dialog);
});

test("mobile Wiki stays within 390 px and keeps its primary controls touch-sized", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const trigger = page.getByRole("button", { name: "打开 Matter 菜单" });
  await trigger.click();
  await page.getByRole("dialog", { name: "Matter" })
    .getByRole("button", { name: WIKI_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: WIKI_TITLE, exact: true });
  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page, dialog);

  const close = dialog.getByRole("button", { name: `关闭: ${WIKI_TITLE}` });
  const add = dialog.getByRole("button", { name: "添加词", exact: true });
  const emptyControls = [
    close,
    dialog.getByRole("button", { name: "导出词典", exact: true }),
    add,
    ...EXAMPLES.map((name) => dialog.getByRole("button", { name, exact: true })),
  ];
  for (const control of emptyControls) await expectTouchTarget(control);

  await add.click();
  const editorControls = [
    dialog.getByRole("textbox", { name: "词语或名称" }),
    dialog.getByRole("combobox", { name: "应用于" }),
    dialog.getByRole("button", { name: /返回/u }),
    dialog.getByRole("button", { name: "取消", exact: true }),
    dialog.getByRole("button", { name: "加入词典", exact: true }),
  ];
  for (const control of editorControls) await expectTouchTarget(control);
  await expectNoHorizontalOverflow(page, dialog);

  await dialog.getByRole("textbox", { name: "词语或名称" }).fill("KFC");
  await dialog.getByRole("button", { name: "加入词典", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "KFC", exact: true })).toBeVisible();
  expect(await dialog.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(1);
  await expectTouchTarget(dialog.getByRole("button", { name: "修改: KFC", exact: true }));
  await expectTouchTarget(dialog.getByRole("button", { name: "移出词典: KFC", exact: true }));
  await expectNoHorizontalOverflow(page, dialog);

  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("medium Wiki uses two columns without turning its words into wide cards", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  await page.getByRole("button", { name: "打开 Matter 菜单" }).click();
  await page.getByRole("dialog", { name: "Matter" })
    .getByRole("button", { name: WIKI_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: WIKI_TITLE, exact: true });
  await dialog.getByRole("button", { name: "Morphogenesis", exact: true }).click();
  await dialog.getByRole("button", { name: "加入词典", exact: true }).click();

  expect(await dialog.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(2);
  await expectNoHorizontalOverflow(page, dialog);
});

async function openDesktopWiki(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await page.getByRole("menuitem", { name: WIKI_TITLE, exact: true }).click();
  await expect(page.getByRole("dialog", { name: WIKI_TITLE, exact: true })).toBeVisible();
}

async function expectExampleOrder(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole("button", { name: EXAMPLES[0], exact: true })).toBeVisible();
  const order = await dialog.locator("button").evaluateAll((buttons, expected) =>
    buttons
      .map((button) => button.textContent?.replace(/\s+/gu, " ").trim() ?? "")
      .filter((label) => expected.includes(label)), EXAMPLES);
  expect(order).toEqual(EXAMPLES);
}

async function expectNoHorizontalOverflow(page: Page, dialog: Locator): Promise<void> {
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectTouchTarget(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
