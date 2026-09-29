import { expect, test, type Page } from "@playwright/test";
import { POINT_TALK_TIMING } from "../features/matter/components/presence";
import { fixtureUiCopy } from "./matter-ui-copy";

// The Point and Talk field leaves only for a reason the person can see, and
// always leaves visibly: these journeys prove each legitimate way out, and
// that relayout, resize, scrolling, font loading, and a stray release never
// close it. `point-talk-close.test.ts` holds the source to the same list.

const ROOT_ID = "thought_fixture_root";
const REWRITTEN =
  "我们也许怀念的，并不是一个曾经真实存在的过去，而是那个过去在今天仍然允许我们想象的其他生活。";
const DIRECTION_LABEL = "告诉 AI 这段文字应该怎样改变";
const DESKTOP = { width: 1440, height: 900 } as const;

type Stage = Readonly<{
  at: number;
  entry: string;
  fade: string;
  animation: string;
  echo: string;
  status: string;
}>;

test.describe("Point and Talk presence", () => {
  test("a clicked passage keeps its lens, and its AI mark opens a field that grows from it and stays", async ({ page }) => {
    await openSettled(page, DESKTOP);
    const readStages = await recordField(page);
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    await passage.click();
    // The pointer leaves the passage: the selection alone keeps its lens.
    await page.mouse.move(24, DESKTOP.height - 24);
    const lens = page.locator("[data-node-action-lens]");
    await expect(lens).toBeVisible();
    await expect(lens).toHaveAttribute("data-node-id", ROOT_ID);
    const mark = await page.locator("[data-node-action=point-talk]").boundingBox();
    if (mark === null) throw new Error("the AI mark is not measurable");
    await page.mouse.click(mark.x + mark.width / 2, mark.y + mark.height / 2);
    // A stray release right after the summoning click is not a reason to leave.
    await page.evaluate(() => {
      for (const target of [document.body, document.querySelector("main.matter-shell")!]) {
        target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    const field = page.locator('.point-talk[data-presence="present"]');
    await expect(field).toHaveAttribute("data-placed", "");
    const entrance = await field.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const [originX, originY] = style.transformOrigin.split(" ").map(Number.parseFloat);
      return {
        animation: style.animationName,
        duration: style.animationDuration,
        origin: { x: rect.left + originX!, y: rect.top + originY! },
        travel: style.getPropertyValue("--point-talk-enter-travel").trim(),
      };
    });
    expect(entrance.animation).toBe("point-talk-enter");
    expect(entrance.duration).toBe(`${POINT_TALK_TIMING.enterMs / 1_000}s`);
    // It grows from the mark the person pressed, clamped into its own box.
    const fieldBox = (await field.boundingBox())!;
    const clampedX = Math.min(Math.max(mark.x + mark.width / 2, fieldBox.x), fieldBox.x + fieldBox.width);
    const clampedY = Math.min(Math.max(mark.y + mark.height / 2, fieldBox.y), fieldBox.y + fieldBox.height);
    expect(Math.abs(entrance.origin.x - clampedX)).toBeLessThan(2);
    expect(Math.abs(entrance.origin.y - clampedY)).toBeLessThan(2);
    // The field sits above its passage, so it settles downward toward it.
    expect(entrance.travel).toBe(`-${POINT_TALK_TIMING.enterTravelPx}px`);

    await page.waitForTimeout(POINT_TALK_TIMING.minDwellMs);
    await expect(field).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: DIRECTION_LABEL })).toBeFocused();
    const stages = await readStages();
    const opened = stages.findIndex(({ entry }) => entry.startsWith("present"));
    expect(opened).toBeGreaterThanOrEqual(0);
    // Once summoned, the field never hid, left, or was replaced.
    expect(stages.slice(opened).map(({ entry }) => entry.split(":")[0]))
      .toEqual(stages.slice(opened).map(() => "present"));
  });

  test("a submitted direction stays pending in place, and the result is the ending", async ({ page }) => {
    await routeRewrite(page, 40);
    await openSettled(page, DESKTOP);
    await openField(page);
    const readStages = await recordField(page);
    const direction = page.getByRole("textbox", { name: DIRECTION_LABEL });
    await direction.fill("更凝练一些");
    await page.getByRole("button", { name: "改写", exact: true }).click();
    const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
    await expect(passage).toContainText(REWRITTEN);
    await expect(page.locator(".point-talk")).toHaveCount(0);

    const stages = await readStages();
    const pending = stages.find(({ entry }) => entry.startsWith("present:-:pending"));
    expect(pending).toBeDefined();
    expect(pending!.status).toBe("正在换一种说法…");
    expect(pending!.echo).toBe("更凝练一些");
    const exiting = stages.findIndex(({ entry }) => entry.startsWith("exiting:finished"));
    expect(exiting).toBeGreaterThan(0);
    const exit = stages[exiting]!;
    // The request stayed visibly pending in place for the minimum time before
    // its result changed the passage, then faded over the change.
    expect(exit.at - pending!.at).toBeGreaterThanOrEqual(POINT_TALK_TIMING.pendingMinMs - 40);
    expect(exit.entry).toContain(`|${REWRITTEN.slice(0, 8)}`);
    expect(stages[exiting - 1]!.entry).not.toContain(`|${REWRITTEN.slice(0, 8)}`);
    expect(exit.fade).toContain(`${POINT_TALK_TIMING.exitMs.finished / 1_000}s`);
    const gone = stages.slice(exiting).find(({ entry }) => entry.startsWith("absent"));
    expect(gone!.at - exit.at).toBeGreaterThanOrEqual(POINT_TALK_TIMING.exitMs.finished - 60);
  });

  test("a press outside fades and shrinks the field as the person's close", async ({ page }) => {
    await openSettled(page, DESKTOP);
    await openField(page);
    const readStages = await recordField(page);
    await page.getByRole("textbox", { name: DIRECTION_LABEL }).fill("按下别处");
    await page.mouse.click(40, DESKTOP.height / 2);
    await expect(page.locator(".point-talk")).toHaveCount(0);
    const stages = await readStages();
    const exiting = stages.find(({ entry }) => entry.startsWith("exiting:person"));
    expect(exiting?.fade).toContain(`${POINT_TALK_TIMING.exitMs.person / 1_000}s`);
    const gone = stages.find(({ entry, at }) => entry.startsWith("absent") && at > exiting!.at);
    expect(gone!.at - exiting!.at).toBeGreaterThanOrEqual(POINT_TALK_TIMING.exitMs.person - 60);
  });

  test("Ask Matter takes the slot with a quick fade", async ({ page }) => {
    await openSettled(page, DESKTOP);
    await openField(page);
    const readStages = await recordField(page);
    await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "询问 Matter" })).toBeVisible();
    await expect(page.locator(".point-talk")).toHaveCount(0);
    const stages = await readStages();
    expect(stages.some(({ entry }) => entry.startsWith("exiting:person"))).toBe(false);
    const exiting = stages.find(({ entry }) => entry.startsWith("exiting:yielded"));
    expect(exiting?.fade).toContain(`${POINT_TALK_TIMING.exitMs.yielded / 1_000}s`);
    const gone = stages.find(({ entry, at }) => entry.startsWith("absent") && at > exiting!.at);
    expect(gone!.at - exiting!.at).toBeGreaterThanOrEqual(POINT_TALK_TIMING.exitMs.yielded - 40);
  });

  test("a modal dialog is the one 0 ms cut", async ({ page }) => {
    await openSettled(page, DESKTOP);
    await openField(page);
    const readStages = await recordField(page);
    const about = page.getByRole("button", { name: "关于", exact: true });
    await about.focus();
    await about.press("Enter");
    await expect(page.getByRole("dialog", { name: "关于 Matter" })).toBeVisible();
    await expect(page.locator(".point-talk")).toHaveCount(0);
    const stages = await readStages();
    expect(stages.some(({ entry }) => /^(holding|exiting)/u.test(entry))).toBe(false);
  });

  test("a passage that changes under the field fades it and says why once", async ({ page }) => {
    // A spoken passage is admitted as heard; its repair lands a moment later
    // and changes the text under a field the person opened on it meanwhile.
    let releaseRepair!: () => void;
    const repairGate = new Promise<void>((resolve) => {
      releaseRepair = resolve;
    });
    await page.route("**/api/repair", async (route) => {
      await repairGate;
      await route.continue();
    });
    for (const path of ["/matter/api/transcribe", "/matter/api/repair"]) {
      const response = await page.request.get(path);
      expect(response.status()).toBe(405);
      await response.dispose();
    }
    await openSettled(page, { width: 1440, height: 1300 });
    const before = await thoughtIds(page);
    await page.getByRole("button", { name: fixtureUiCopy.voiceTool.recordTopLevelThought, exact: true }).click();
    const stop = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.voiceTool.stopRecording, exact: true });
    await expect(stop).toBeVisible({ timeout: 30_000 });
    // Cross one capture interval so Stop has audio to submit.
    await page.waitForTimeout(350);
    await stop.click();
    await expect.poll(async () => (await thoughtIds(page)).length, { timeout: 20_000 })
      .toBe(before.length + 1);
    const admittedId = (await thoughtIds(page)).find((id) => !before.includes(id))!;
    const admitted = page.locator(`[data-thought-text-id="${admittedId}"]`);
    const heard = await admitted.textContent();
    await admitted.click();
    await page.locator("[data-node-action=point-talk]").click();
    await expect(page.locator('.point-talk[data-presence="present"]')).toHaveAttribute("data-placed", "");
    await page.getByRole("textbox", { name: DIRECTION_LABEL }).fill("尚未提交");
    const readStages = await recordField(page);

    releaseRepair();
    await expect(admitted).not.toHaveText(heard ?? "");
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(".matter-guidance__next")).toHaveText("段落已变化，未改写。");
    const stages = await readStages();
    const leaving = stages.filter(({ entry }) => /^(holding|exiting)/u.test(entry));
    expect(leaving.length).toBeGreaterThan(0);
    expect(leaving.every(({ entry }) => entry.split(":")[1] === "invalidated")).toBe(true);
    const exiting = stages.find(({ entry }) => entry.startsWith("exiting:invalidated"));
    expect(exiting?.fade).toContain(`${POINT_TALK_TIMING.exitMs.invalidated / 1_000}s`);
  });

  for (const persisted of [true, false]) {
    test(`a ${persisted ? "back-forward-cache" : "real unload"} page hide ${persisted ? "suspends" : "ends"} a submitted rewrite`, async ({ page }) => {
      let releaseRewrite!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseRewrite = resolve;
      });
      await page.route("**/api/text-swap", async (route) => {
        await gate;
        await route.fallback();
      });
      await routeRewrite(page, 0);
      await openSettled(page, DESKTOP);
      await openField(page);
      await page.getByRole("textbox", { name: DIRECTION_LABEL }).fill("更凝练一些");
      await page.getByRole("button", { name: "改写", exact: true }).click();
      await expect(page.locator('.point-talk[data-phase="pending"]')).toBeVisible();

      await page.evaluate((keep) => {
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: keep }));
      }, persisted);
      releaseRewrite();
      await page.waitForTimeout(POINT_TALK_TIMING.pendingMinMs + 200);
      const passage = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
      // Nothing reaches the material while the page is away.
      await expect(passage).not.toContainText(REWRITTEN);
      await page.evaluate((keep) => {
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: keep }));
      }, persisted);
      if (persisted) {
        await expect(passage).toContainText(REWRITTEN);
      } else {
        await page.waitForTimeout(POINT_TALK_TIMING.pendingMinMs);
        await expect(passage).not.toContainText(REWRITTEN);
        await expect(page.locator(".point-talk")).toHaveCount(0);
      }
    });
  }

  test("relayout, resize, scrolling, and font loading never close the field", async ({ page }) => {
    await openSettled(page, DESKTOP);
    await openField(page);
    const readStages = await recordField(page);
    const direction = page.getByRole("textbox", { name: DIRECTION_LABEL });
    await direction.pressSequentially("请把这一段改得更加凝练一些并且保留原来的语气和节奏感不要丢失任何意思", { delay: 5 });
    await page.setViewportSize({ width: 1320, height: 860 });
    await page.evaluate(async () => {
      window.dispatchEvent(new Event("resize"));
      document.querySelector(".matter-canvas")?.dispatchEvent(new Event("scroll"));
      const face = new FontFace("PointTalkProbe", "url(/matter/missing-probe-font.woff2)");
      document.fonts.add(face);
      await face.load().catch(() => undefined);
    });
    await page.setViewportSize(DESKTOP);
    await page.waitForTimeout(400);
    await expect(direction).toBeFocused();
    await expect(direction).toHaveValue("请把这一段改得更加凝练一些并且保留原来的语气和节奏感不要丢失任何意思");
    const stages = await readStages();
    // The field never hid itself, never lost its place, and never left.
    expect(stages.every(({ entry }) => entry.startsWith("present:-:eligible:placed"))).toBe(true);
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("keeps the fades and holds but drops scale and travel", async ({ page }) => {
      await openSettled(page, DESKTOP);
      await openField(page);
      const field = page.locator('.point-talk[data-presence="present"]');
      expect(await field.evaluate((element) => {
        const style = getComputedStyle(element);
        return { animation: style.animationName, duration: style.animationDuration };
      })).toEqual({
        animation: "point-talk-enter-fade",
        duration: `${POINT_TALK_TIMING.enterMs / 1_000}s`,
      });
      const readStages = await recordField(page);
      await page.mouse.click(40, DESKTOP.height / 2);
      await expect(page.locator(".point-talk")).toHaveCount(0);
      const stages = await readStages();
      const exiting = stages.find(({ entry }) => entry.startsWith("exiting:person"));
      expect(exiting?.fade).toContain(`${POINT_TALK_TIMING.exitMs.person / 1_000}s`);
      expect(exiting?.animation).toBe("scale:1");
    });
  });

  test("at narrow width the lens, the field, and its dwell work the same", async ({ page }) => {
    await openSettled(page, { width: 375, height: 667 });
    await openField(page);
    const field = page.locator('.point-talk[data-presence="present"]');
    await page.waitForTimeout(POINT_TALK_TIMING.minDwellMs);
    await expect(field).toHaveCount(1);
    expect(await field.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 11 && rect.right <= innerWidth - 11 && rect.top >= 11;
    })).toBe(true);
  });
});

async function openSettled(page: Page, viewport: Readonly<{ width: number; height: number }>): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
}

/** The owner's path: click the passage, then its AI mark. */
async function openField(page: Page): Promise<void> {
  await page.locator(`[data-thought-text-id="${ROOT_ID}"]`).click();
  await page.locator("[data-node-action=point-talk]").click();
  await expect(page.locator('.point-talk[data-presence="present"]')).toHaveAttribute("data-placed", "");
  await expect(page.getByRole("textbox", { name: DIRECTION_LABEL })).toBeFocused();
}

async function thoughtIds(page: Page): Promise<string[]> {
  return page.locator("[data-thought-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-thought-id")).filter((id): id is string => id !== null));
}

async function routeRewrite(page: Page, delayMs: number): Promise<void> {
  await page.route("**/api/text-swap", async (route) => {
    const envelope = route.request().postDataJSON() as {
      protocolVersion: string;
      requestVersion: string;
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        protocolVersion: envelope.protocolVersion,
        requestVersion: envelope.requestVersion,
        id: envelope.id,
        treeId: envelope.treeId,
        treeRevision: envelope.treeRevision,
        action: {
          id: envelope.id,
          type: "replace-text-range",
          nodeId: envelope.selection.nodeId,
          start: envelope.selection.start,
          end: envelope.selection.end,
          text: REWRITTEN,
          intent: "paraphrase",
        },
        presentation: { motionHint: "settle" },
      }),
    }).catch(() => undefined);
  });
}

/**
 * Records every change to the Point Talk field as
 * `presence:close:phase:placement|passage text`, with the time it was seen,
 * its CSS exit duration, and what its pending line says.
 */
async function recordField(page: Page): Promise<() => Promise<Stage[]>> {
  await page.evaluate((rootId) => {
    const runtime = window as Window & { __pointTalkPresence?: Stage[] };
    type Stage = { at: number; entry: string; fade: string; animation: string; echo: string; status: string };
    const stages: Stage[] = [];
    runtime.__pointTalkPresence = stages;
    const record = () => {
      const fields = Array.from(document.querySelectorAll<HTMLElement>(".point-talk"));
      const passage = document.querySelector<HTMLElement>(`[data-thought-text-id="${rootId}"]`)?.textContent ?? "";
      const field = fields.length === 1 ? fields[0]! : null;
      const entry = `${fields.length === 0
        ? "absent"
        : fields.map((element) => [
            element.dataset.presence ?? "",
            element.dataset.presenceClose ?? "-",
            element.dataset.phase ?? "",
            element.hasAttribute("data-placed") &&
              getComputedStyle(element).visibility !== "hidden" ? "placed" : "unplaced",
          ].join(":")).join("+")}|${passage.slice(0, 8)}`;
      if (stages[stages.length - 1]?.entry === entry) return;
      const style = field === null ? null : getComputedStyle(field);
      stages.push({
        at: performance.now(),
        entry,
        fade: style?.transitionDuration ?? "",
        animation: field?.dataset.presence === "exiting" ? `scale:${style?.scale === "none" ? "1" : style?.scale}` : style?.animationName ?? "",
        echo: field?.querySelector(".point-talk__echo")?.textContent ?? "",
        status: field?.querySelector(".point-talk__feedback > span:first-child")?.textContent ?? "",
      });
    };
    record();
    new MutationObserver(record).observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }, ROOT_ID);
  return () => page.evaluate(() => {
    const runtime = window as Window & { __pointTalkPresence?: Stage[] };
    const stages = [...(runtime.__pointTalkPresence ?? [])];
    runtime.__pointTalkPresence?.splice(0);
    return stages;
  });
}
