import { expect, test, type Page } from "@playwright/test";
import { exportSnapshotArchive } from "../features/matter/persistence/archive-transport";
import { treeToBundle } from "../features/matter/persistence/snapshot-codec";
import { SEEDED_DOCUMENT_TREE_ID } from "../features/matter/material/seeded-document";
import { MAX_TREE_DEPTH } from "../features/matter/tree/invariants";
import { PROTOCOL_VERSION, type ThoughtNode } from "../features/matter/tree/model";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";
import {
  UNDER_HEARD_TRANSCRIPT,
  UNDER_RECORDING_START_TIMEOUT_MS,
  UNDER_REPAIRED_TRANSCRIPT,
  addChildUnder,
  armUnder,
  prewarmAdmissionRoutes,
  selectPassage,
  thoughtIdsOf,
  underMark,
} from "./under-driver";

const rootId = "thought_fixture_root";
const lensCopy = fixtureUiCopy.nodeActionLens;

async function openMatter(page: Page): Promise<void> {
  await prewarmAdmissionRoutes(page);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");
}

for (const viewport of [
  { name: "laptop", width: 1280, height: 800 },
  { name: "narrow", width: 390, height: 844 },
]) {
  test(`Under appends each spoken child below the selected passage at ${viewport.name} width`, async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await openMatter(page);
    const initialIds = await thoughtIdsOf(page);
    const parent = page.locator(`[data-thought-id="${rootId}"]`);

    const firstId = await addChildUnder(page, rootId);
    const first = page.locator(`[data-thought-id="${firstId}"]`);
    await expect(first).toContainText(UNDER_REPAIRED_TRANSCRIPT);
    // The spoken words are the child; they are appended after every earlier child.
    expect((await thoughtIdsOf(page)).at(-1)).toBe(firstId);
    // Selection does not move, so speaking again appends the next sibling.
    await expect(parent).toHaveAttribute("data-selected", "true");

    const secondId = await addChildUnder(page, rootId);
    expect((await thoughtIdsOf(page)).at(-1)).toBe(secondId);
    const boxes = await Promise.all([parent, first, page.locator(`[data-thought-id="${secondId}"]`)]
      .map((locator) => locator.boundingBox()));
    if (boxes.some((box) => box === null)) throw new Error("passage geometry is not visible");
    const [parentBox, firstBox, secondBox] = boxes as NonNullable<(typeof boxes)[number]>[];
    expect(firstBox.x).toBeGreaterThan(parentBox.x);
    expect(Math.abs(firstBox.x - secondBox.x)).toBeLessThanOrEqual(1);
    expect(secondBox.y).toBeGreaterThan(firstBox.y + firstBox.height - 1);

    // Each child is two ordinary steps (the words, then the repair): Undo twice
    // for the second, twice for the first.
    const undo = page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true });
    for (let step = 0; step < 4; step += 1) await undo.click();
    await expect.poll(() => thoughtIdsOf(page)).toEqual(initialIds);
    expect(browserErrors).toEqual([]);
  });
}

test("a spoken Under child is its own undoable step, and no rewrite or turn request writes it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const writingRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(?:turn|inquiry)\b/u.test(new URL(request.url()).pathname)) {
      writingRequests.push(request.url());
    }
  });
  await openMatter(page);
  const initialIds = await thoughtIdsOf(page);

  const childId = await addChildUnder(page, rootId);
  const child = page.locator(`[data-thought-id="${childId}"]`);
  await expect(child).toContainText(UNDER_REPAIRED_TRANSCRIPT);

  // The words entered as one step and the repair is a separately undoable second:
  // the first Undo gives the heard words back, the next removes the child.
  const undo = page.getByRole("button", { name: fixtureUiCopy.toolRail.undoLastChange, exact: true });
  await undo.click();
  await expect(child).toContainText(UNDER_HEARD_TRANSCRIPT);
  await undo.click();
  await expect(child).toHaveCount(0);
  await expect.poll(() => thoughtIdsOf(page)).toEqual(initialIds);
  await expect(undo).toBeDisabled();
  expect(writingRequests).toEqual([]);
});

test("Voice, tapped while an Under recording is live, stops it instead of opening Point and Talk", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMatter(page);
  const before = await thoughtIdsOf(page);

  const recording = await armUnder(page, rootId);
  await page.waitForTimeout(350);
  const rail = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools });
  // The selected passage could host a rewrite, yet the tool names the recording.
  const voice = rail.getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true });
  await expect(voice).toBeVisible();
  await expect(voice).not.toHaveAttribute("aria-disabled", "true");
  await voice.click();

  await expect.poll(async () => (await thoughtIdsOf(page)).length).toBe(before.length + 1);
  await expect(page.locator(".point-talk")).toHaveCount(0);
  await expect(recording).toHaveCount(0, { timeout: 15_000 });
  // Only now, with nothing recording, does the selected passage mean a rewrite again.
  await expect(rail.getByRole("button", {
    name: fixtureUiCopy.voiceTool.recordRewriteDirection,
    exact: true,
  })).toBeVisible();
});

test("Escape withdraws an armed Under recording and nothing is added", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMatter(page);
  const before = await thoughtIdsOf(page);

  await armUnder(page, rootId);
  await expect(underMark(page)).toHaveAttribute("aria-label", lensCopy.underCancel);
  await page.keyboard.press("Escape");
  await expect(page.locator(".admission-feedback")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-interaction-pending", "true");
  expect(await thoughtIdsOf(page)).toEqual(before);
  // The arming is one utterance, not a mode: the mark is a plain Add below again.
  await expect(underMark(page)).toHaveAttribute("aria-label", lensCopy.under);
  await expect(underMark(page)).not.toHaveAttribute("aria-disabled", "true");
});

test("tapping the Under mark again withdraws the recording", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMatter(page);
  const before = await thoughtIdsOf(page);

  await armUnder(page, rootId);
  await underMark(page).click();
  await expect(page.locator(".admission-feedback")).toHaveCount(0, { timeout: 5_000 });
  expect(await thoughtIdsOf(page)).toEqual(before);
  await expect(underMark(page)).toHaveAttribute("aria-label", lensCopy.under);
});

test("the Under mark is reachable and operable by keyboard alone", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMatter(page);
  const before = await thoughtIdsOf(page);

  await selectPassage(page, rootId);
  const text = page.locator(`[data-thought-id="${rootId}"] [data-thought-text-id]`);
  await text.focus();
  await page.keyboard.press("ArrowRight");
  const lens = page.locator("[data-node-action-lens]");
  await expect(lens).toBeVisible();
  const aiMark = lens.locator('[data-node-action="point-talk"]');
  await expect(aiMark).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const mark = underMark(page);
  await expect(mark).toBeFocused();
  await expect(mark).toHaveAccessibleName(lensCopy.under);

  await page.keyboard.press("Enter");
  await expect(page.locator('.admission-feedback[data-phase="recording"]'))
    .toBeVisible({ timeout: UNDER_RECORDING_START_TIMEOUT_MS });
  // Focus stays on the pressed mark, so the same key withdraws it.
  await expect(mark).toBeFocused();
  await expect(mark).toHaveAccessibleName(lensCopy.underCancel);
  await page.keyboard.press("Space");
  await expect(page.locator(".admission-feedback")).toHaveCount(0, { timeout: 5_000 });
  expect(await thoughtIdsOf(page)).toEqual(before);
});

test("Under at the deepest level is disabled, focusable, and says why", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMatter(page);

  // A chain whose last passage sits at the deepest legal level.
  const timestamp = "2026-10-12T00:00:00.000Z";
  const nodes: Record<string, ThoughtNode> = {};
  const ids = Array.from({ length: MAX_TREE_DEPTH }, (_, index) => `deep_${index}`);
  ids.forEach((id, index) => {
    nodes[id] = {
      id,
      text: `Level ${index + 1}`,
      parentId: index === 0 ? null : ids[index - 1]!,
      children: index === ids.length - 1 ? [] : [ids[index + 1]!],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const exported = await exportSnapshotArchive(treeToBundle({
    protocolVersion: PROTOCOL_VERSION,
    id: SEEDED_DOCUMENT_TREE_ID,
    rootId: ids[0]!,
    revision: 0,
    nodes,
  }));
  if (!exported.ok) throw new Error(exported.error.code);

  const sidebar = page.locator("aside.material-files");
  await sidebar.getByRole("button", { name: fixtureUiCopy.materialFiles.archive, exact: true }).click();
  const archive = sidebar.getByRole("region", { name: fixtureUiCopy.materialFiles.archivePanel });
  await archive.getByLabel(fixtureUiCopy.materialFiles.archiveChooseMaterialArchive).setInputFiles({
    name: "deep.matter.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(exported.bytes),
  });
  await expect(archive).toContainText(fixtureUiCopy.materialFiles.archiveConfirmReplace);
  await archive.getByRole("button", { name: fixtureUiCopy.materialFiles.archiveReplace, exact: true }).click();
  await expect(archive).toHaveCount(0);
  await expect(page.locator(`[data-thought-id="${ids.at(-1)}"]`)).toHaveCount(1);

  const deepest = ids.at(-1)!;
  await selectThoughtThroughMaterialIndex(page, deepest);
  const mark = underMark(page);
  await expect(mark).toBeVisible();
  const reason = lensCopy.underBlocked["deepest-level"];
  await expect(mark).toHaveAttribute("aria-disabled", "true");
  await expect(mark).toHaveAccessibleDescription(reason);
  await expect(mark).toHaveAttribute("title", `${lensCopy.under} — ${reason}`);
  // Never removed and never silently inert: it takes focus and answers a press.
  await mark.focus();
  await expect(mark).toBeFocused();
  await mark.click({ force: true });
  await expect(page.locator(".admission-feedback")).toHaveCount(0);
  await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-interaction-pending", "true");

  // One level up, the same mark is available.
  await selectThoughtThroughMaterialIndex(page, ids.at(-2)!);
  await expect(underMark(page)).not.toHaveAttribute("aria-disabled", "true");
});

test("a set-aside passage keeps its Under mark, disabled with the reason", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMatter(page);

  await selectPassage(page, rootId);
  await page.locator('[data-node-action="set-aside"]').click();
  await page.locator(`[data-thought-id="${rootId}"] [data-thought-text-id]`).hover();
  const mark = underMark(page);
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute("aria-disabled", "true");
  await expect(mark).toHaveAccessibleDescription(lensCopy.underBlocked["held-aside"]);
});
