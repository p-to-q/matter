import { expect, type Locator, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

/**
 * Creates a child through the shipped path: the Under mark on a selected
 * passage starts an admission, the fixture voice (a fake capture device and
 * the fixture transcription adapter) is spoken and stopped, and the admission
 * pipeline commits the words as the new last child. It reaches the product only
 * through its public controls; nothing here is a production test hook.
 */

export const UNDER_HEARD_TRANSCRIPT = "呃，我觉得我觉得这个方案可以，但是它的实现事件比预期长。";
export const UNDER_REPAIRED_TRANSCRIPT = "我觉得这个方案可以，但是它的实现时间比预期长。";

/** Browser fake-device acquisition is outside the product request path. */
export const UNDER_RECORDING_START_TIMEOUT_MS = 30_000;
const UNDER_SETTLE_TIMEOUT_MS = 15_000;

export function underMark(page: Page): Locator {
  return page.locator('[data-node-action="under"]');
}

export async function thoughtIdsOf(page: Page): Promise<string[]> {
  return page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id")).filter((id): id is string => id !== null),
  );
}

/**
 * Next's development server compiles each route on first access. Keep that
 * startup work outside the interaction the receipt is about.
 */
export async function prewarmAdmissionRoutes(page: Page): Promise<void> {
  for (const path of ["/matter/api/transcribe", "/matter/api/repair"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(405);
    await response.dispose();
  }
}

/** Selects a passage on the canvas, as a person's click does. */
export async function selectPassage(page: Page, nodeId: string): Promise<void> {
  const passage = page.locator(`[data-thought-id="${nodeId}"]`);
  if (await passage.getAttribute("data-selected") === "true") return;
  await passage.locator("[data-thought-text-id]").click();
  await expect(passage).toHaveAttribute("data-selected", "true");
}

/** Arms the Under mark of the selected passage and waits for the live recording. */
export async function armUnder(page: Page, parentId: string): Promise<Locator> {
  await prewarmAdmissionRoutes(page);
  await selectPassage(page, parentId);
  const mark = underMark(page);
  await expect(mark).toBeVisible();
  await expect(mark).not.toHaveAttribute("aria-disabled", "true");
  await mark.click();
  const recording = page.locator('.admission-feedback[data-phase="recording"]');
  await expect(recording).toBeVisible({ timeout: UNDER_RECORDING_START_TIMEOUT_MS });
  return recording;
}

/**
 * Stops the recording once the fake device has delivered a capture interval.
 * `settle: "repaired"` also waits for the separately undoable repair, so the
 * history is at rest; `"committed"` returns as soon as the child exists.
 */
export async function addChildUnder(
  page: Page,
  parentId: string,
  options: Readonly<{ settle?: "repaired" | "committed" }> = {},
): Promise<string> {
  const settle = options.settle ?? "repaired";
  const before = await thoughtIdsOf(page);
  const recording = await armUnder(page, parentId);
  // MediaRecorder chunks are asynchronous; one 250 ms capture interval must
  // pass so Stop can prove the final dataavailable boundary with audio.
  await page.waitForTimeout(350);
  await recording
    .getByRole("button", { name: fixtureUiCopy.admissionFeedback.stop, exact: true })
    .click();
  await expect.poll(async () => (await thoughtIdsOf(page)).length, { timeout: UNDER_SETTLE_TIMEOUT_MS })
    .toBe(before.length + 1);
  const childId = (await thoughtIdsOf(page)).find((id) => !before.includes(id));
  if (childId === undefined) throw new Error("the spoken child was not created");
  if (settle === "repaired") {
    const child = page.locator(`[data-thought-id="${childId}"]`);
    await expect(child).toContainText(UNDER_REPAIRED_TRANSCRIPT, { timeout: UNDER_SETTLE_TIMEOUT_MS });
    await expect(child.locator(".repair-text")).toHaveCount(0, { timeout: UNDER_SETTLE_TIMEOUT_MS });
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-interaction-pending", "true");
  }
  return childId;
}
