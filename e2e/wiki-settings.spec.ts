import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodeWikiExport } from "../features/matter/wiki/wiki-export";

const WIKI_TITLE = "词典 WIKI";
const STARTER_WORDS = ["Engelbart", "Morphogenesis", "KFC", "[p → q]"] as const;
const WIKI_STATE_KEYS = Object.freeze([
  "aliasEvidence",
  "aliasTombstones",
  "authorities",
  "automaticLearningSaturated",
  "fittingVersion",
  "lexemeTombstones",
  "lexemes",
  "nextLexemeId",
  "revision",
  "schemaVersion",
  "scoringVersion",
  "termEvidence",
]);

test.describe.configure({ timeout: 90_000 });

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
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const close = dialog.getByRole("button", { name: `关闭: ${WIKI_TITLE}` });
  await expect(close).toBeFocused();
  await expectStarterWiki(dialog);
  await expect(dialog.getByRole("button", { name: "全部", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "自动添加", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "手动添加", exact: true })).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const filters = element.querySelector('[role="group"]');
    const firstRule = element.querySelector("ol > li");
    if (!(filters instanceof HTMLElement) || !(firstRule instanceof HTMLElement)) return null;
    return {
      filterWidth: filters.getBoundingClientRect().width,
      filterHeight: filters.getBoundingClientRect().height,
      ruleWidth: firstRule.getBoundingClientRect().width,
      ruleHeight: firstRule.getBoundingClientRect().height,
    };
  });
  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry!.filterWidth - geometry!.ruleWidth)).toBeLessThanOrEqual(2);
  expect(geometry!.ruleHeight).toBeLessThan(geometry!.filterHeight);

  const allFilter = dialog.getByRole("button", { name: "全部", exact: true });
  const automaticFilter = dialog.getByRole("button", { name: "自动添加", exact: true });
  await expect.poll(async () => {
    const scale = await readAfterScale(allFilter);
    return Math.abs(scale.x - 1) < .001 && Math.abs(scale.y - 1) < .001;
  }).toBe(true);
  await automaticFilter.click();
  await expect.poll(async () => {
    const scale = await readAfterScale(allFilter);
    return Math.abs(scale.x - .925) < .001 && Math.abs(scale.y - .82) < .001;
  }).toBe(true);
  await allFilter.hover();
  await expect.poll(() => allFilter.evaluate((button) =>
    getComputedStyle(button, "::after").backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  await allFilter.click();
  await expect.poll(async () => {
    const scale = await readAfterScale(allFilter);
    return Math.abs(scale.x - 1) < .001 && Math.abs(scale.y - 1) < .001;
  }).toBe(true);

  const listDialogBox = await dialog.boundingBox();
  await automaticRule(dialog, "Morphogenesis").click();
  const editorScope = dialog.getByRole("combobox", { name: "可用于", exact: true });
  await expect(dialog.getByRole("button", { name: "确认", exact: true })).toBeVisible();
  const initialEditorBox = await dialog.boundingBox();
  await editorScope.selectOption("written");
  const changedEditorBox = await dialog.boundingBox();
  expect(listDialogBox).not.toBeNull();
  expect(initialEditorBox).not.toBeNull();
  expect(changedEditorBox).not.toBeNull();
  expect(Math.abs(initialEditorBox!.y - listDialogBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(changedEditorBox!.y - initialEditorBox!.y)).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();

  await dialog.getByRole("button", { name: "添加词", exact: true }).click();
  const word = dialog.getByRole("textbox", { name: "词语或名称" });
  const scope = dialog.getByRole("combobox", { name: "可用于", exact: true });
  await word.fill("Vannevar Bush");
  await expect(scope).toHaveValue("both");
  await dialog.getByRole("button", { name: "加入词典", exact: true }).click();
  await expect(manualRule(dialog, "Vannevar Bush")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "添加词", exact: true })).toBeFocused();
  await expect(dialog).toContainText("已保存在这台设备上。");
  await dialog.getByRole("button", { name: "自动添加", exact: true }).click();
  await expect(manualRule(dialog, "Vannevar Bush")).toHaveCount(0);
  await dialog.getByRole("button", { name: "手动添加", exact: true }).click();
  await expect(manualRule(dialog, "Vannevar Bush")).toBeVisible();
  expect(await dialog.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(3);
  const entry = manualRule(dialog, "Vannevar Bush");
  await entry.hover();
  const editEntry = dialog.getByRole("button", { name: "修改: Vannevar Bush", exact: true });
  await expect(editEntry).toBeVisible();
  await editEntry.hover();
  await expect.poll(() => editEntry.evaluate((button) =>
    getComputedStyle(button).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  const hoverColors = await editEntry.evaluate((button) => ({
    button: getComputedStyle(button).backgroundColor,
    row: getComputedStyle(button.closest("li")!).backgroundColor,
  }));
  expect(hoverColors.button).not.toBe("rgba(0, 0, 0, 0)");
  expect(hoverColors.row).toBe("rgba(0, 0, 0, 0)");
  await page.mouse.move(0, 0);
  await entry.focus();
  await expect(dialog.getByRole("button", { name: "修改: Vannevar Bush", exact: true })).toBeVisible();
  await entry.click();
  await scope.selectOption("spoken");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await openDesktopWiki(page);
  await expect(manualRule(dialog, "Vannevar Bush")).toBeVisible();

  await manualRule(dialog, "Vannevar Bush").click();
  await expect(scope).toHaveValue("spoken");
  await word.fill("Douglas Engelbart");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const editedRow = manualRule(dialog, "Douglas Engelbart");
  await expect(editedRow).toBeVisible();
  await expect(manualRule(dialog, "Vannevar Bush")).toHaveCount(0);
  await expect(automaticRule(dialog, "Engelbart")).toBeVisible();

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
  expect(state.termEvidence).toEqual([]);
  expect(state.aliasEvidence).toEqual([]);
  const lexemes = state.lexemes as Array<Record<string, unknown>>;
  expect(lexemes).toHaveLength(5);
  expect(Object.keys(lexemes[0]!).sort()).toEqual([
    "canonical",
    "confirmedAtRevision",
    "id",
    "locale",
    "provenance",
    "scope",
  ]);
  expect(lexemes.find((entry) => entry.canonical === "Douglas Engelbart")).toMatchObject({
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
  await expect(dialog.getByRole("button", { name: "添加词", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "全部", exact: true }).click();
  await expectStarterWiki(dialog);

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await openDesktopWiki(page);
  await expect(manualRule(dialog, "Douglas Engelbart")).toHaveCount(0);
  await expectStarterWiki(dialog);
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
  await expect(dialog.getByRole("button", { name: `关闭: ${WIKI_TITLE}` })).toBeFocused();
  await expectNoHorizontalOverflow(page, dialog);

  const close = dialog.getByRole("button", { name: `关闭: ${WIKI_TITLE}` });
  const add = dialog.getByRole("button", { name: "添加词", exact: true });
  const listDialogBox = await dialog.boundingBox();
  const emptyControls = [
    close,
    dialog.getByRole("button", { name: "导出词典", exact: true }),
    add,
  ];
  for (const control of emptyControls) await expectTouchTarget(control);

  await add.click();
  const editorDialogBox = await dialog.boundingBox();
  expect(listDialogBox).not.toBeNull();
  expect(editorDialogBox).not.toBeNull();
  expect(Math.abs(editorDialogBox!.y - listDialogBox!.y)).toBeLessThanOrEqual(1);
  const editorControls = [
    dialog.getByRole("textbox", { name: "词语或名称" }),
    dialog.getByRole("combobox", { name: "可用于", exact: true }),
    dialog.getByRole("button", { name: "取消", exact: true }),
    dialog.getByRole("button", { name: "加入词典", exact: true }),
  ];
  for (const control of editorControls) await expectTouchTarget(control);
  await expectNoHorizontalOverflow(page, dialog);

  await dialog.getByRole("textbox", { name: "词语或名称" }).fill("Vannevar Bush");
  await dialog.getByRole("button", { name: "加入词典", exact: true }).click();
  const entry = manualRule(dialog, "Vannevar Bush");
  await expect(entry).toBeVisible();
  expect(await dialog.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(1);
  await expectTouchTarget(entry);
  await expect(dialog.getByRole("button", { name: "修改: Vannevar Bush", exact: true })).toBeHidden();
  await expect(dialog.getByRole("button", { name: "移出词典: Vannevar Bush", exact: true })).toBeHidden();
  const populatedListDialogBox = await dialog.boundingBox();
  await entry.click();
  const populatedEditorDialogBox = await dialog.boundingBox();
  expect(populatedListDialogBox).not.toBeNull();
  expect(populatedEditorDialogBox).not.toBeNull();
  expect(Math.abs(populatedEditorDialogBox!.y - populatedListDialogBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(populatedEditorDialogBox!.height - populatedListDialogBox!.height))
    .toBeLessThanOrEqual(1);
  await expectTouchTarget(dialog.getByRole("button", { name: "移出词典", exact: true }));
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
  await expectStarterWiki(dialog);

  expect(await dialog.locator("ol").evaluate((list) =>
    getComputedStyle(list).gridTemplateColumns.split(" ").length)).toBe(2);
  await expectNoHorizontalOverflow(page, dialog);
});

async function openDesktopWiki(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await page.getByRole("menuitem", { name: WIKI_TITLE, exact: true }).click();
  await expect(page.getByRole("dialog", { name: WIKI_TITLE, exact: true }))
    .toBeVisible({ timeout: 30_000 });
}

function manualRule(dialog: Locator, canonical: string): Locator {
  return dialog.getByRole("button", { name: `${canonical} · 手动添加`, exact: true });
}

function automaticRule(dialog: Locator, canonical: string): Locator {
  return dialog.getByRole("button", { name: `${canonical} · 自动添加`, exact: true });
}

async function expectStarterWiki(dialog: Locator): Promise<void> {
  for (const canonical of STARTER_WORDS) {
    await expect(automaticRule(dialog, canonical)).toBeVisible();
  }
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
  expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
}

async function readAfterScale(control: Locator): Promise<{ x: number; y: number }> {
  return control.evaluate((element) => {
    const transform = getComputedStyle(element, "::after").transform;
    const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
    return { x: matrix.a, y: matrix.d };
  });
}
