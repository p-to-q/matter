import { expect, test, type Locator, type Page } from "@playwright/test";
import { localizeOutcome } from "../features/matter/components/canvas-guidance";
import { nodeActionLensCopy } from "../features/matter/components/node-action-lens-copy";
import { wikiOccurrenceDescription } from "../features/matter/components/wiki-occurrence-description-copy";
import { wikiTakeoverCopy } from "../features/matter/components/wiki-takeover-copy";
import { fixtureUiCopy } from "./matter-ui-copy";

const HEARD = "P to Q";
const CANONICAL = "[p → q]";
const TRANSCRIPT = `我觉得 ${HEARD} 很重要`;
const ADMITTED = `我觉得 ${CANONICAL} 很重要。`;
const REVERTED = `我觉得 ${HEARD} 很重要。`;
const TAKEOVER = wikiTakeoverCopy("zh-CN");
const LENS = nodeActionLensCopy("zh-CN");
// A takeover dismissed sooner than this after it appears was not read.
const TAKEOVER_READABLE_MS = 500;
const WIKI_UNSAVED = localizeOutcome({ owner: "wiki", reason: "unsaved" }, "zh-CN");
const WIKI_TITLE = "词典 WIKI";
// MediaRecorder emits 250 ms chunks; one interval plus headroom proves audio.
const MIN_SYNTHETIC_CAPTURE_MS = 350;

const VIEWPORTS = [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
] as const;

test.describe.configure({ timeout: 120_000 });

for (const viewport of VIEWPORTS) {
  test(`a Wiki word settles, marks, and reverts through Undo at ${viewport.name} width`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const passage = await admitWikiPassage(page, viewport);

    // One restrained settle: an inert world-space overlay shows the heard form
    // becoming the canonical one, then leaves; the text node is untouched.
    await expect.poll(() => readMorphs(page)).toEqual([
      expect.objectContaining({ heard: HEARD, canonical: CANONICAL, inert: true, hidden: "true" }),
    ]);
    await expect(page.locator(".wiki-lexeme-morph")).toHaveCount(0, { timeout: 2_000 });
    await expectMarkCount(page, 1);
    await expectPlainText(passage, ADMITTED);

    const selectedBefore = await passage.getAttribute("data-selected");
    await tapWord(page, passage, CANONICAL);
    const takeover = page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) });
    await expect(takeover).toBeVisible();
    await expect(takeover.getByRole("button", { name: TAKEOVER.keepLabel(CANONICAL) })).toBeFocused();
    await expectWithinViewport(page, takeover);
    // The tap addressed the word, not the passage or Point and Talk.
    expect(await passage.getAttribute("data-selected")).toBe(selectedBefore);
    await expect(page.locator(".point-talk")).toHaveCount(0);

    await takeover.getByRole("button", { name: TAKEOVER.restoreLabel(HEARD) }).click();
    await expect(passage.locator(".spatial-thought__text")).toHaveText(REVERTED);
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    await expectMarkCount(page, 0);

    await page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true }).click();
    await expect(passage.locator(".spatial-thought__text")).toHaveText(ADMITTED);
    // Undo is ordinary history: nothing settles again, marks, or settles anew.
    await page.waitForTimeout(700);
    await expectMarkCount(page, 0);
    expect(await readMorphs(page)).toHaveLength(1);
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`Keep settles the takeover at ${viewport.name} width`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const passage = await admitWikiPassage(page, viewport);
    await expectMarkCount(page, 1);

    await tapWord(page, passage, CANONICAL);
    const takeover = page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) });
    await takeover.getByRole("button", { name: TAKEOVER.keepLabel(CANONICAL) }).click();
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    await expectMarkCount(page, 0);
    await expectPlainText(passage, ADMITTED);
    expect(errors).toEqual([]);
  });

  test(`Wiki… opens the term and leaves the word unsettled at ${viewport.name} width`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const passage = await admitWikiPassage(page, viewport);
    await expectMarkCount(page, 1);

    await tapWord(page, passage, CANONICAL);
    await page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) })
      .getByRole("button", { name: TAKEOVER.wikiLabel(CANONICAL) }).click();
    const dialog = page.getByRole("dialog", { name: WIKI_TITLE, exact: true });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("button", { name: `${CANONICAL} · 自动添加`, exact: true }))
      .toBeFocused({ timeout: 10_000 });
    await expect(dialog.getByRole("searchbox")).toHaveValue(CANONICAL);
    await dialog.getByRole("button", { name: `关闭: ${WIKI_TITLE}` }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    await expectMarkCount(page, 1);

    // Escape from a reopened takeover, once it could be read, is an inspection.
    await tapWord(page, passage, CANONICAL);
    await expect(page.locator(".wiki-takeover")).toBeVisible();
    await page.waitForTimeout(TAKEOVER_READABLE_MS + 200);
    await page.keyboard.press("Escape");
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    await expectMarkCount(page, 0);
    expect(errors).toEqual([]);
  });

  test(`the keyboard reaches and keeps a Wiki change at ${viewport.name} width`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const passage = await admitWikiPassage(page, viewport);
    await expectMarkCount(page, 1);
    const text = passage.locator(".spatial-thought__text");
    // Assistive technology hears that the passage holds a change to review.
    await expect(text).toHaveAccessibleDescription(wikiOccurrenceDescription("zh-CN", 1));

    await text.focus();
    await page.keyboard.press("ArrowRight");
    const lens = page.getByRole("toolbar", { name: LENS.actions });
    await expect(lens).toBeVisible();
    // ArrowRight enters the passage's actions, which now include the review.
    await expect.poll(() => lens.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press("End");
    const review = lens.getByRole("button", { name: LENS.wikiReview(HEARD, CANONICAL) });
    await expect(review).toBeFocused();
    await page.keyboard.press("Enter");

    const takeover = page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) });
    await expect(takeover).toBeVisible();
    await expect(takeover.getByRole("button", { name: TAKEOVER.keepLabel(CANONICAL) })).toBeFocused();
    await expectWithinViewport(page, takeover);
    await page.keyboard.press("Enter");
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    await expectMarkCount(page, 0);
    // Keep hands focus back to the passage, which no longer describes a change.
    await expect(text).toBeFocused();
    await expect(text).toHaveAccessibleDescription("");
    await expectPlainText(passage, ADMITTED);
    expect(errors).toEqual([]);
  });

  test(`a double-click on a marked word selects its passage and settles nothing at ${viewport.name} width`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    const passage = await admitWikiPassage(page, viewport);
    await expectMarkCount(page, 1);
    await clearSelection(page, passage);

    const point = await wordPoint(passage, CANONICAL);
    await page.mouse.dblclick(point.x, point.y);
    await expect(passage).toHaveAttribute("data-selected", "true");
    await expect(page.locator(".wiki-takeover")).toHaveCount(0);
    // The takeover the first press opened was never read: the word waits on.
    await page.waitForTimeout(TAKEOVER_READABLE_MS + 200);
    await expectMarkCount(page, 1);

    // A later single tap still opens the same word.
    await tapWord(page, passage, CANONICAL);
    await expect(page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) }))
      .toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("a Keep Wiki could not record is said once and clears on the next action", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const passage = await admitWikiPassage(page, VIEWPORTS[0]);
  await expectMarkCount(page, 1);
  // The attribution is gone, as after its registry window lapsed.
  await page.evaluate(() => {
    const slot = (globalThis as unknown as Record<symbol, { registry: { clear(): void } } | undefined>)[
      Symbol.for("ptoq.matter.wiki-occurrence-registry")
    ];
    slot?.registry.clear();
  });

  await tapWord(page, passage, CANONICAL);
  const takeover = page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) });
  await takeover.getByRole("button", { name: TAKEOVER.keepLabel(CANONICAL) }).click();
  await expect(page.locator(".wiki-takeover")).toHaveCount(0);
  // The word stays as it is; only the learning was lost, and that is said.
  await expectMarkCount(page, 0);
  await expectPlainText(passage, ADMITTED);
  const line = page.locator(".matter-guidance");
  await expect(line).toHaveAttribute("data-guidance-state", "wiki-unsaved");
  await expect(line).toHaveText(WIKI_UNSAVED);
  await expect(page.getByRole("status").filter({ hasText: WIKI_UNSAVED })).toHaveCount(1);
  await page.keyboard.press("Shift");
  await expect(line).toHaveAttribute("data-guidance-state", "wiki-unsaved");
  await page.keyboard.press("Tab");
  await expect(line).not.toHaveAttribute("data-guidance-state", "wiki-unsaved");
  expect(errors).toEqual([]);
});

test("outcomes that end together are each said, one per next action", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  let releaseRewrite!: () => void;
  const rewriteBarrier = new Promise<void>((resolve) => {
    releaseRewrite = resolve;
  });
  let rewriteAnswered!: () => void;
  const rewriteFailed = new Promise<void>((resolve) => {
    rewriteAnswered = resolve;
  });
  await page.route("**/api/text-swap", async (route) => {
    await rewriteBarrier;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        error: {
          code: "TURN_UNAVAILABLE",
          message: "Synthetic model unavailable.",
          retryable: true,
          fallbackReason: "MODEL_UNAVAILABLE",
        },
      }),
    }).catch(() => undefined);
    rewriteAnswered();
  });
  const passage = await admitWikiPassage(page, VIEWPORTS[0]);
  await expectMarkCount(page, 1);
  await page.evaluate(() => {
    const slot = (globalThis as unknown as Record<symbol, { registry: { clear(): void } } | undefined>)[
      Symbol.for("ptoq.matter.wiki-occurrence-registry")
    ];
    slot?.registry.clear();
  });
  const line = page.locator(".matter-guidance");
  const said = (text: string) => page.getByRole("status").filter({ hasText: text });
  const rewriteUnchanged = localizeOutcome({ owner: "rewrite", reason: "unavailable" }, "zh-CN");

  // A rewrite is submitted, then its field detaches while the request runs.
  await passage.locator(".spatial-thought__text").hover();
  await page.locator("[data-node-action=point-talk]").click();
  await page.getByRole("textbox", { name: "告诉 AI 这段文字应该怎样改变" }).fill("更凝练一些");
  await page.getByRole("button", { name: "改写", exact: true }).click();
  await expect(page.locator('.point-talk[data-phase="pending"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".point-talk")).toHaveCount(0);

  // Wiki cannot record a Keep, and the rewrite then fails: two outcomes.
  await tapWord(page, passage, CANONICAL);
  await page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) })
    .getByRole("button", { name: TAKEOVER.keepLabel(CANONICAL) }).click();
  await expect(line).toHaveAttribute("data-guidance-state", "wiki-unsaved");
  releaseRewrite();
  await rewriteFailed;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  // The later outcome waits its turn rather than hiding the shown one.
  await expect(line).toHaveAttribute("data-guidance-state", "wiki-unsaved");
  await expect(said(WIKI_UNSAVED)).toHaveCount(1);
  await expect(said(rewriteUnchanged)).toHaveCount(0);
  // The next action retires only the outcome that was shown; the waiting one
  // is then shown and announced in its turn.
  await page.keyboard.press("Tab");
  await expect(line).toHaveAttribute("data-guidance-state", "text-swap-unavailable");
  await expect(line).toHaveText(rewriteUnchanged);
  await expect(said(rewriteUnchanged)).toHaveCount(1);
  await expect(said(WIKI_UNSAVED)).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(line).not.toHaveAttribute("data-guidance-state", "text-swap-unavailable");
  await expect(said(rewriteUnchanged)).toHaveCount(0);
  await expect(passage.locator(".spatial-thought__text")).toHaveText(ADMITTED);
  // The browser logs the deliberate 503 itself; nothing else may fail.
  expect(errors.filter((error) => !error.includes("status of 503"))).toEqual([]);
});

test("informed silence settles after two further admissions", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const passage = await admitWikiPassage(page, VIEWPORTS[0]);
  await expectMarkCount(page, 1);
  // Perception needs the disclosed word on screen for 1.5 s.
  await page.waitForTimeout(1_800);
  await admitVoice(page, (await page.locator("[data-thought-id]").count()) + 1);
  await expectMarkCount(page, 1);
  await admitVoice(page, (await page.locator("[data-thought-id]").count()) + 1);
  await expect.poll(() => markRangeCount(page, passage), { timeout: 5_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test("the settle overlays its word exactly under canvas zoom", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.addInitScript(() => {
    const runtime = window as Window & { __wikiMorphOffsets?: number[] };
    runtime.__wikiMorphOffsets = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.classList.contains("wiki-lexeme-morph")) continue;
          const canonical = node.lastElementChild as HTMLElement;
          const text = node.parentElement?.querySelector(".spatial-thought__text");
          const walker = text === null || text === undefined
            ? null
            : document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
          const textNode = walker?.nextNode() as Text | null;
          if (textNode === null || textNode === undefined) continue;
          const start = textNode.data.indexOf(canonical.textContent ?? "");
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + (canonical.textContent ?? "").length);
          const word = range.getBoundingClientRect();
          const copy = canonical.getBoundingClientRect();
          runtime.__wikiMorphOffsets?.push(Math.abs(copy.left - word.left), Math.abs(copy.width - word.width));
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const passage = await admitWikiPassage(page, VIEWPORTS[0], async () => {
    const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
    await pan.click();
    await page.locator("main.matter-shell").dispatchEvent("wheel", {
      clientX: 640,
      clientY: 400,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -240,
    });
    await expect.poll(async () => Number(await page.locator("main.matter-shell")
      .getAttribute("data-viewport-zoom"))).toBeGreaterThan(1);
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
  });
  await expectMarkCount(page, 1);
  const offsets = await page.evaluate(() =>
    (window as Window & { __wikiMorphOffsets?: number[] }).__wikiMorphOffsets ?? []);
  expect(offsets.length).toBe(2);
  for (const offset of offsets) expect(offset).toBeLessThanOrEqual(1);
  await expectPlainText(passage, ADMITTED);
  expect(errors).toEqual([]);
});

test("reduced motion discloses with the static mark only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const passage = await admitWikiPassage(page, VIEWPORTS[0]);
  await expectMarkCount(page, 1);
  expect(await readMorphs(page)).toEqual([]);
  expect(await page.evaluate(() =>
    (window as Window & { __wikiSweeps?: number }).__wikiSweeps ?? 0)).toBe(0);
  await expectPlainText(passage, ADMITTED);
});

test("a settle cut off early twice discloses with the static mark instead", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  // A web font finishing mid-settle ends it before the change is readable. Two
  // such cuts exhaust the retry; the word must still become reviewable.
  await page.addInitScript(() => {
    let cuts = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.classList.contains("wiki-lexeme-morph")) continue;
          if (cuts >= 2) continue;
          cuts += 1;
          queueMicrotask(() => document.fonts.dispatchEvent(new Event("loadingdone")));
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const passage = await admitWikiPassage(page, VIEWPORTS[0]);
  await expectMarkCount(page, 1);
  expect(await readMorphs(page)).toHaveLength(2);
  await expect(page.locator(".wiki-lexeme-morph")).toHaveCount(0);
  await tapWord(page, passage, CANONICAL);
  await expect(page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) })).toBeVisible();
  await expectPlainText(passage, ADMITTED);
  expect(errors).toEqual([]);
});

test("without Custom Highlight the word discloses with an underline sweep", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as Window & { Highlight?: unknown }).Highlight;
  });
  const passage = await admitWikiPassage(page, VIEWPORTS[0]);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __wikiSweeps?: number }).__wikiSweeps ?? 0)).toBeGreaterThan(0);
  expect(await readMorphs(page)).toEqual([]);
  await expect(page.locator(".wiki-lexeme-sweep")).toHaveCount(0, { timeout: 2_000 });
  // The word is still addressable without a painted mark.
  await tapWord(page, passage, CANONICAL);
  await expect(page.getByRole("group", { name: TAKEOVER.changed(HEARD, CANONICAL) })).toBeVisible();
});

async function admitWikiPassage(
  page: Page,
  viewport: Readonly<{ width: number; height: number }>,
  beforeAdmission?: () => Promise<void>,
): Promise<Locator> {
  await page.setViewportSize(viewport);
  await installSyntheticMicrophone(page);
  await page.addInitScript(() => {
    const runtime = window as Window & {
      __wikiMorphs?: Array<{ heard: string; canonical: string; inert: boolean; hidden: string | null }>;
      __wikiSweeps?: number;
    };
    runtime.__wikiMorphs = [];
    runtime.__wikiSweeps = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("wiki-lexeme-morph")) {
            const forms = Array.from(node.children, (child) => child.textContent ?? "");
            runtime.__wikiMorphs?.push({
              heard: forms.length > 1 ? forms[0]! : "",
              canonical: forms.at(-1) ?? "",
              inert: node.inert,
              hidden: node.getAttribute("aria-hidden"),
            });
          }
          if (node.classList.contains("wiki-lexeme-sweep")) {
            runtime.__wikiSweeps = (runtime.__wikiSweeps ?? 0) + 1;
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await prewarmAdmissionRoutes(page);
  await routeFixtureSpeech(page);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("#material-files")).toHaveAttribute(
    "data-persistence-phase",
    "saved",
    { timeout: 30_000 },
  );
  await expect.poll(() => storedWikiGeneration(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await beforeAdmission?.();
  await admitVoice(page, (await page.locator("[data-thought-id]").count()) + 1);
  const admitted = page.locator("[data-thought-id]").filter({ hasText: ADMITTED });
  await expect(admitted).toHaveCount(1);
  // Later admissions repeat the words; this journey follows the first one.
  const nodeId = await admitted.getAttribute("data-thought-id");
  const passage = page.locator(`[data-thought-id="${nodeId}"]`);
  // A new top-level thought lands below the fold. Its settle waits for its
  // first perceivable arrival, so the person pans it into view.
  await panIntoView(page, passage);
  return passage;
}

async function panIntoView(page: Page, passage: Locator): Promise<void> {
  const size = page.viewportSize()!;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await passage.locator(".spatial-thought__text").boundingBox();
    if (box === null) throw new Error("passage must be measurable");
    const offset = size.height * .4 - (box.y + box.height / 2);
    if (box.y >= 0 && box.y + box.height <= size.height * .8 && Math.abs(offset) < size.height * .3) {
      return;
    }
    const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
    await pan.click();
    const startY = offset < 0 ? size.height * .85 : size.height * .15;
    const travel = Math.max(-size.height * .7, Math.min(size.height * .7, offset));
    const x = size.width * .45;
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, startY + travel / 2, { steps: 4 });
    await page.mouse.move(x, startY + travel, { steps: 4 });
    await page.mouse.up();
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
  }
  throw new Error("passage could not be brought into view");
}

async function routeFixtureSpeech(page: Page): Promise<void> {
  // Match by path: the client names the transcription purpose in the query.
  await page.route((url) => url.pathname.endsWith("/api/transcribe"), async (route) => {
    const body = route.request().postDataBuffer()?.toString("utf8") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({
        protocolVersion: "0.2",
        interactionId: multipartField(body, "interactionId"),
        attempt: Number.parseInt(multipartField(body, "attempt"), 10),
        transcript: TRANSCRIPT,
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
}

async function admitVoice(page: Page, expectedNodeCount: number): Promise<void> {
  await page.getByRole("button", {
    name: fixtureUiCopy.voiceTool.recordTopLevelThought,
    exact: true,
  }).click({ timeout: 30_000 });
  const stop = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(MIN_SYNTHETIC_CAPTURE_MS);
  await stop.click();
  await expect(page.locator("[data-thought-id]")).toHaveCount(expectedNodeCount, {
    timeout: 15_000,
  });
}

/** Taps the centre of one word's first rendered fragment, as a finger would. */
async function tapWord(page: Page, passage: Locator, word: string): Promise<void> {
  const point = await wordPoint(passage, word);
  await page.mouse.click(point.x, point.y);
}

async function wordPoint(passage: Locator, word: string): Promise<{ x: number; y: number }> {
  return passage.locator(".spatial-thought__text").evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node as Text;
      const start = text.data.indexOf(target);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, start + target.length);
      const rect = range.getClientRects()[0]!;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    throw new Error("word not rendered");
  }, word);
}

/** Leaves no passage selected, so a later selection is the gesture's own. */
async function clearSelection(page: Page, passage: Locator): Promise<void> {
  if (await passage.getAttribute("data-selected") === null) return;
  const canvas = await page.locator(".matter-canvas").boundingBox();
  const text = await passage.locator(".spatial-thought__text").boundingBox();
  if (canvas === null || text === null) throw new Error("canvas must be measurable");
  // Blank paper beside the passage, well clear of the tool rail.
  await page.mouse.click(canvas.x + 12, Math.min(canvas.y + canvas.height - 12, text.y + text.height + 48));
  await expect(passage).not.toHaveAttribute("data-selected", "true");
}

async function expectMarkCount(page: Page, count: number): Promise<void> {
  await expect.poll(() => page.evaluate(() =>
    CSS.highlights?.get("matter-wiki-applied")?.size ?? 0), { timeout: 10_000 }).toBe(count);
}

async function markRangeCount(page: Page, passage: Locator): Promise<number> {
  return passage.evaluate((element) => {
    const mark = CSS.highlights?.get("matter-wiki-applied");
    if (mark === undefined) return 0;
    let count = 0;
    for (const range of mark) {
      if (element.contains(range.startContainer)) count += 1;
    }
    return count;
  });
}

/** The passage stays one text owner: no per-word or per-character wrapper. */
async function expectPlainText(passage: Locator, text: string): Promise<void> {
  const text_ = passage.locator(".spatial-thought__text");
  await expect(text_).toHaveText(text);
  expect(await text_.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let nodes = 0;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes += 1;
    return nodes;
  })).toBe(1);
}

async function expectWithinViewport(page: Page, surface: Locator): Promise<void> {
  const box = await surface.boundingBox();
  const size = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size!.width);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size!.height);
}

async function readMorphs(page: Page) {
  return page.evaluate(() =>
    (window as Window & { __wikiMorphs?: unknown[] }).__wikiMorphs ?? []);
}

async function storedWikiGeneration(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const open = indexedDB.open("ptoq-matter");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      if (!database.objectStoreNames.contains("wiki")) return 0;
      const get = database.transaction("wiki", "readonly").objectStore("wiki").get("origin");
      const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result as Record<string, unknown> | undefined);
        get.onerror = () => reject(get.error);
      });
      return Number(record?.writeGeneration ?? 0);
    } finally {
      database.close();
    }
  });
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
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

function multipartField(body: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`name="${escaped}"\\r?\\n\\r?\\n([^\\r\\n]+)`, "u").exec(body);
  if (match?.[1] === undefined) throw new Error(`Missing multipart field: ${name}`);
  return match[1];
}
