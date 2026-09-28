import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodeWikiExport } from "../features/matter/wiki/wiki-export";
import { toolRailCopy } from "../features/matter/components/tool-rail-copy";
import { voiceToolCopy } from "../features/matter/components/voice-tool-copy";
import { fixtureUiCopy } from "./matter-ui-copy";

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
const ENGLISH_VOICE_LABELS = Object.freeze({
  editingTools: toolRailCopy("en-US").editingTools,
  recordTopLevelThought: voiceToolCopy("en-US").recordTopLevelThought,
  stopRecording: voiceToolCopy("en-US").stopRecording,
});
// MediaRecorder emits 250 ms chunks. One bounded interval plus scheduling
// headroom proves that the synthetic fixture contains audio before Stop.
const MIN_SYNTHETIC_CAPTURE_MS = 350;

test.describe.configure({ timeout: 300_000 });

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

test("real spoken admissions promote, persist, reload, and apply Wiki fitting", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installSyntheticMicrophone(page);
  await prewarmAdmissionRoutes(page);
  let transcript = "Englebart spoke.";
  await page.route("**/api/transcribe", async (route) => {
    const body = route.request().postDataBuffer()?.toString("utf8") ?? "";
    const interactionId = multipartField(body, "interactionId");
    const attempt = Number.parseInt(multipartField(body, "attempt"), 10);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        protocolVersion: "0.2",
        interactionId,
        attempt,
        transcript,
      }),
    });
  });
  await page.route("**/api/repair", async (route) => {
    const request = route.request().postDataJSON() as {
      protocolVersion: string;
      promptVersion: string;
      operationId: string;
      attempt: number;
      text: string;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        protocolVersion: request.protocolVersion,
        promptVersion: request.promptVersion,
        operationId: request.operationId,
        attempt: request.attempt,
        text: request.text,
        source: "verbatim",
      }),
    });
  });

  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expectMaterialSaved(page);
  await page.locator('[data-chrome-control="language"]').click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await openDesktopEnglishWiki(page);
  const dialog = page.getByRole("dialog", { name: "WIKI", exact: true });
  await expect(dialog.getByRole("button", { name: "Disable collection", exact: true }))
    .toBeVisible();
  await expect(dialog.getByRole("button", { name: "Disable fitting", exact: true }))
    .toBeVisible();
  await dialog.getByRole("button", { name: "Close: WIKI" }).click();

  const initialCount = await page.locator("[data-thought-id]").count();
  let previousGeneration = await readStoredWikiGeneration(page);
  for (let support = 1; support <= 4; support += 1) {
    transcript = "Englebart spoke.";
    await admitVoice(page, initialCount + support, ENGLISH_VOICE_LABELS);
    let persisted: Awaited<ReturnType<typeof readStoredWikiAlias>> = null;
    await expect.poll(async () => {
      persisted = await readStoredWikiAlias(page, "Engelbart", "Englebart");
      return persisted;
    }, { timeout: 60_000 }).toMatchObject({
      support,
      phase: support === 4 ? "active" : "candidate",
      producer: "latin-internal-edit-v2",
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.writeGeneration).toBeGreaterThan(previousGeneration);
    previousGeneration = persisted!.writeGeneration;
    await expect.poll(() => readStoredWikiTerm(page, "Englebart"), {
      timeout: 60_000,
    }).toBeNull();
  }
  await expect(page.locator('[data-thought-id^="thought_"]')
    .filter({ hasText: "Englebart spoke." })).toHaveCount(4);

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expectMaterialSaved(page);
  await expect(page.locator("[data-thought-id]")).toHaveCount(initialCount + 4);
  await expect.poll(() => readStoredWikiAlias(page, "Engelbart", "Englebart"), {
    timeout: 60_000,
  }).toMatchObject({
    support: 4,
    phase: "active",
    producer: "latin-internal-edit-v2",
  });

  transcript = "Englebart spoke.";
  await admitVoice(page, initialCount + 5, ENGLISH_VOICE_LABELS);
  await expect(page.locator('[data-thought-id^="thought_"]')
    .filter({ hasText: "Engelbart spoke." })).toHaveCount(1);
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

async function openDesktopEnglishWiki(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Matter settings", exact: true }).click();
  await page.getByRole("menuitem", { name: "WIKI", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "WIKI", exact: true }))
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

async function admitVoice(
  page: Page,
  expectedNodeCount: number,
  labels = Object.freeze({
    editingTools: fixtureUiCopy.toolRail.editingTools,
    recordTopLevelThought: fixtureUiCopy.voiceTool.recordTopLevelThought,
    stopRecording: fixtureUiCopy.voiceTool.stopRecording,
  }),
): Promise<void> {
  await page.getByRole("button", {
    name: labels.recordTopLevelThought,
    exact: true,
  }).click({ timeout: 30_000 });
  const stop = page.getByRole("navigation", { name: labels.editingTools })
    .getByRole("button", { name: labels.stopRecording, exact: true });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  const captureStartedAt = Date.now();
  await expect.poll(() => Date.now() - captureStartedAt, {
    timeout: MIN_SYNTHETIC_CAPTURE_MS + 1_000,
  }).toBeGreaterThanOrEqual(MIN_SYNTHETIC_CAPTURE_MS);
  await stop.click();
  await expect(page.locator("[data-thought-id]")).toHaveCount(expectedNodeCount, {
    timeout: 10_000,
  });
  await expect(page.locator("#material-files")).toHaveAttribute(
    "data-persistence-phase",
    "saved",
  );
}

async function expectMaterialSaved(page: Page): Promise<void> {
  await expect(page.locator("#material-files")).toHaveAttribute(
    "data-persistence-phase",
    "saved",
    { timeout: 30_000 },
  );
}

async function prewarmAdmissionRoutes(page: Page): Promise<void> {
  for (const path of ["/matter/api/transcribe", "/matter/api/repair"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(405);
    await response.dispose();
  }
}

async function installSyntheticMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const runtime = window as Window & {
      __matterSyntheticMicrophone?: readonly [AudioContext, OscillatorNode];
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        oscillator.connect(destination);
        oscillator.start();
        await context.resume();
        runtime.__matterSyntheticMicrophone = [context, oscillator];
        return destination.stream;
      },
    });
  });
}

async function readStoredWikiTerm(
  page: Page,
  canonical: string,
): Promise<{ support: number; phase: string } | null> {
  return page.evaluate(async (requestedCanonical) => {
    const open = indexedDB.open("ptoq-matter");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const transaction = database.transaction("wiki", "readonly");
      const get = transaction.objectStore("wiki").get("origin");
      const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      });
      const state = record.state as { termEvidence?: Array<Record<string, unknown>> };
      const entry = state.termEvidence?.find((candidate) =>
        candidate.locale === "en-US" && candidate.canonical === requestedCanonical);
      return entry === undefined
        ? null
        : { support: Number(entry.support), phase: String(entry.phase) };
    } finally {
      database.close();
    }
  }, canonical);
}

async function readStoredWikiAlias(
  page: Page,
  canonical: string,
  form: string,
): Promise<{
  support: number;
  phase: string;
  producer: string;
  writeGeneration: number;
} | null> {
  return page.evaluate(async ({ requestedCanonical, requestedForm }) => {
    const open = indexedDB.open("ptoq-matter");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const transaction = database.transaction("wiki", "readonly");
      const get = transaction.objectStore("wiki").get("origin");
      const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      });
      const state = record.state as {
        lexemes?: Array<Record<string, unknown>>;
        aliasEvidence?: Array<Record<string, unknown>>;
      };
      const lexeme = state.lexemes?.find((candidate) =>
        candidate.locale === "en-US" && candidate.canonical === requestedCanonical);
      const entry = lexeme === undefined
        ? undefined
        : state.aliasEvidence?.find((candidate) =>
            candidate.lexemeId === lexeme.id &&
            candidate.channel === "spoken" &&
            candidate.form === requestedForm);
      return entry === undefined
        ? null
        : {
            support: Number(entry.support),
            phase: String(entry.phase),
            producer: String(entry.producer),
            writeGeneration: Number(record.writeGeneration),
          };
    } finally {
      database.close();
    }
  }, { requestedCanonical: canonical, requestedForm: form });
}

async function readStoredWikiGeneration(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const open = indexedDB.open("ptoq-matter");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const transaction = database.transaction("wiki", "readonly");
      const get = transaction.objectStore("wiki").get("origin");
      const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result as Record<string, unknown>);
        get.onerror = () => reject(get.error);
      });
      return Number(record.writeGeneration);
    } finally {
      database.close();
    }
  });
}

function multipartField(body: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`name="${escaped}"\\r?\\n\\r?\\n([^\\r\\n]+)`, "u").exec(body);
  if (match?.[1] === undefined) throw new Error(`Missing multipart field: ${name}`);
  return match[1];
}
