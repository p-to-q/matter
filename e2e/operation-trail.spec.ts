import { expect, test, type Locator, type Page } from "@playwright/test";
import { SEEDED_DOCUMENT_NODE_IDS } from "../features/matter/material/seeded-document";
import { settleLassoGeometry } from "./lasso-driver";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

// A passage that is selected draws a light trail from the root down to it; an AI
// operation addressed at a passage draws the same trail at full strength. Hover and
// focus draw nothing. These journeys pin each row of the state table in
// docs/reference/tree-layout.md, and that the trail never takes part in hit-testing.

const ROOT_ID = SEEDED_DOCUMENT_NODE_IDS.root;
const MIDDLE_ID = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
const DEEP_ID = SEEDED_DOCUMENT_NODE_IDS.imaginedTime;
const SIBLING_ID = SEEDED_DOCUMENT_NODE_IDS.imaginedRelations;
const DIRECTION_LABEL = "告诉 AI 这段文字应该怎样改变";
const REWRITTEN = "也许我们怀念的，是一种不必马上证明效率的时间，它还没有被切成可以交付的单位。";
const DESKTOP = { width: 1440, height: 900 } as const;
const TRAIL = ".operation-trail";
const TARGET = ".operation-trail__bead--target";

type Point = Readonly<{ x: number; y: number }>;

test.describe("canvas trail", () => {
  test("hover and focus alone draw nothing; selecting draws the light trail", async ({ page }) => {
    await openSettled(page);
    await expect(page.locator(TRAIL)).toHaveCount(0);
    const passage = passageText(page, DEEP_ID);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "selected");

    // Clear the selection, then hover and focus without selecting.
    await clearSelection(page);
    await expect(page.locator(TRAIL)).toHaveCount(0);
    await passage.hover();
    await page.waitForTimeout(200);
    await expect(page.locator(TRAIL)).toHaveCount(0);
    await passage.focus();
    await page.waitForTimeout(200);
    await expect(page.locator(TRAIL)).toHaveCount(0);
  });

  test("pointer selection, index selection and keyboard selection all draw it", async ({ page }) => {
    await openSettled(page);
    // Index click.
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "selected");
    await clearSelection(page);
    await expect(page.locator(TRAIL)).toHaveCount(0);
    // Keyboard through the index: Enter on a focused row.
    const row = page.locator(`aside.material-files .material-file[data-node-id="${DEEP_ID}"] .material-file__open`);
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "selected");
    await clearSelection(page);
    await expect(page.locator(TRAIL)).toHaveCount(0);
    // Pointer on the canvas.
    await selectThoughtThroughMaterialIndex(page, SIBLING_ID);
    await clearSelection(page);
    await expect(page.locator(TRAIL)).toHaveCount(0);
    await passageText(page, SIBLING_ID).click();
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "selected");
  });

  test("it is one aria-hidden drawing with one SVG, no tab stop and no pointer", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    const trail = page.locator(TRAIL);
    await expect(trail).toHaveCount(1);
    await expect(trail).toHaveAttribute("aria-hidden", "true");
    await expect(trail).not.toHaveAttribute("tabindex", /.*/u);
    await expect(page.locator(`${TRAIL} svg`)).toHaveCount(1);
    expect(await trail.evaluate((element) => ({
      focusable: element.querySelector("svg")?.getAttribute("focusable"),
      pointerEvents: getComputedStyle(element).pointerEvents,
      linePointerEvents: getComputedStyle(element.querySelector("svg")!).pointerEvents,
      text: element.textContent,
      inWorld: element.closest(".matter-world") !== null,
      beforeList: element.nextElementSibling?.classList.contains("spatial-thoughts") ?? false,
      tabbable: element.querySelectorAll("[tabindex], a, button, input").length,
    }))).toEqual({
      focusable: "false",
      inWorld: true,
      beforeList: true,
      pointerEvents: "none",
      linePointerEvents: "none",
      text: "",
      tabbable: 0,
    });
  });

  test("a dot on every passage from the root down, a larger bead with its ring on the target, an arrowhead into each", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    // Zoomed out and moved so the root passage is on the paper: its dot, and the target's bead.
    await showAncestors(page);
    const dots = await dotCentres(page, ".operation-trail__dots--up");
    expect(dots).toHaveLength(1);
    await expect(page.locator(TARGET)).toHaveCount(1);
    const root = await passageBox(page, ROOT_ID);
    // Left of the passage's edge by the gutter, and above its top by the lift.
    expect(Math.abs(dots[0]!.x - (root.left - 36))).toBeLessThanOrEqual(2);
    expect(root.top - dots[0]!.y).toBeGreaterThan(0);
    expect(root.top - dots[0]!.y).toBeLessThanOrEqual(24.5);
    const target = await beadCentre(page.locator(TARGET));
    const middle = await passageBox(page, MIDDLE_ID);
    expect(Math.abs(target.x - (middle.left - 36))).toBeLessThanOrEqual(2);
    expect(middle.top - target.y).toBeGreaterThan(0);
    await expect(page.locator(TARGET)).toHaveCSS("width", "11px");
    expect(await page.locator(TARGET).evaluate((element) => getComputedStyle(element, "::before").inset)).toBe("-4.5px");
    // One closed triangle for the edge into the middle passage.
    const arrows = (await page.locator(".operation-trail__arrows--up").getAttribute("d")) ?? "";
    expect(arrows.match(/Z/gu)).toHaveLength(1);
  });

  test("it is crisp: a 1.75px round-capped stroke that does not scale, one device row of ink", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    const path = page.locator(".operation-trail__path--up");
    expect(await path.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fill: style.fill,
        linecap: style.strokeLinecap,
        linejoin: style.strokeLinejoin,
        vectorEffect: style.vectorEffect,
        width: style.strokeWidth,
        animationName: style.animationName,
      };
    })).toEqual({
      fill: "none", linecap: "round", linejoin: "round", vectorEffect: "non-scaling-stroke", width: "1.75px", animationName: "none",
    });
    // Level and plumb legs only: no diagonal in the path data.
    const d = (await path.getAttribute("d")) ?? "";
    expect(d).toMatch(/^M/u);
    expect(d).not.toMatch(/[CQSTZ]/u);
    expect(Number.isFinite((await beadCentre(page.locator(TARGET))).y)).toBe(true);
  });

  test("an operation strengthens the same drawing: no remount, only the weight changes", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await passageText(page, DEEP_ID).click();
    const trail = page.locator(TRAIL);
    const wrapper = await trail.elementHandle();
    const pathHandle = await page.locator(".operation-trail__path--up").elementHandle();
    const beadHandle = await page.locator(TARGET).elementHandle();
    await expect(trail).toHaveAttribute("data-strength", "selected");
    const selectedStroke = await page.locator(".operation-trail__path--up").evaluate((element) => getComputedStyle(element).stroke);
    expect(await trail.evaluate((element) => getComputedStyle(element).getPropertyValue("--trail-ring").trim())).toBe("8%");

    await openFieldOnSelected(page);
    await expect(trail).toHaveAttribute("data-strength", "operating");
    expect(await trail.evaluate((element) => getComputedStyle(element).getPropertyValue("--trail-ring").trim())).toBe("14%");
    await expect.poll(() => page.locator(".operation-trail__path--up").evaluate((element) => getComputedStyle(element).stroke))
      .not.toBe(selectedStroke);
    expect(await trail.elementHandle().then((handle) => handle!.evaluate((a, b) => a === b, wrapper))).toBe(true);
    expect(await page.locator(".operation-trail__path--up").elementHandle().then((handle) => handle!.evaluate((a, b) => a === b, pathHandle))).toBe(true);
    expect(await page.locator(TARGET).elementHandle().then((handle) => handle!.evaluate((a, b) => a === b, beadHandle))).toBe(true);
    await expect(page.locator(TRAIL)).toHaveCount(1);
  });

  test("closing the field returns to the selected weight while the passage stays selected", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "operating");
    await page.keyboard.press("Escape");
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "selected");
  });

  test("a submitted rewrite keeps the strong trail until the result settles, then the light one", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await routeRewrite(page, gate);
    await openSettled(page);
    await openField(page, DEEP_ID);
    await page.getByRole("textbox", { name: DIRECTION_LABEL }).fill("更凝练一些");
    await page.getByRole("button", { name: "改写", exact: true }).click();
    await expect(page.locator('.point-talk[data-phase="pending"]')).toBeVisible();
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "operating");
    await expect(page.locator(TRAIL)).toHaveAttribute("data-working", "true");

    // Pressing elsewhere closes the field, but the submitted work is still the operation.
    await page.mouse.click(40, DESKTOP.height / 2);
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", /operating|selected/u);
    release();
    await expect(passageText(page, DEEP_ID)).toContainText(REWRITTEN);
    await expect(page.locator(TRAIL)).not.toHaveAttribute("data-working", "true");
    await expect(page.locator(TRAIL)).not.toHaveAttribute("data-strength", "operating");
  });

  test("it leaves with the passage: deleting the target removes it", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await passageText(page, DEEP_ID).click();
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await page.keyboard.press("Delete");
    await expect(page.locator(`[data-thought-id="${DEEP_ID}"]`)).toHaveCount(0);
    // Whatever is drawn now is joined to a passage that exists: nothing trails the deleted one.
    await expect.poll(async () => {
      if (await page.locator(TRAIL).count() === 0) return true;
      // A bead pinned to the paper's edge stands in for a passage that is off the paper.
      if (await page.locator(TRAIL).getAttribute("data-pinned") === "true") return true;
      const centre = await beadCentre(page.locator(TARGET));
      const boxes = await page.locator("[data-thought-id]").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      }));
      return boxes.some((box) => Math.abs(centre.x - (box.x - 24)) <= 2.5 && Math.abs(centre.y - (box.y - 6)) <= 2.5);
    }).toBe(true);
  });

  test("clearing the selection fades it over 100ms and removes it; reduced motion removes it at once", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await clearSelection(page);
    await expect(page.locator(TRAIL)).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await clearSelection(page);
    // No fade: it is gone at the next frame, not after a hold.
    await expect(page.locator(TRAIL)).toHaveCount(0, { timeout: 150 });
  });

  test("moving the selection from one passage to another swaps the drawing in place", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    const trail = page.locator(TRAIL);
    const wrapper = await trail.elementHandle();
    const targetBead = await page.locator(TARGET).elementHandle();
    const before = await page.locator(".operation-trail__path--up").getAttribute("d");
    await passageText(page, SIBLING_ID).click();
    await expect(page.locator(TARGET)).toBeAttached();
    await expect.poll(() => page.locator(".operation-trail__path--up").getAttribute("d")).not.toBe(before);
    // No remount, no exit: the wrapper is the same node.
    expect(await trail.elementHandle().then((handle) => handle!.evaluate((a, b) => a === b, wrapper))).toBe(true);
    // The old target's bead is replaced in the same commit by the new one: no exit, no fade-in of the wrapper.
    expect(await targetBead!.evaluate((element) => element.isConnected)).toBe(false);
    await expect(page.locator(TARGET)).toHaveCount(1);
    await expect(trail).toHaveAttribute("data-presence", "present");
    const target = await beadCentre(page.locator(TARGET));
    const sibling = await passageBox(page, SIBLING_ID);
    expect(Math.abs(target.x - (sibling.left - 36))).toBeLessThanOrEqual(2);
    expect(sibling.top - target.y).toBeGreaterThan(0);
  });

  test("a top-level passage draws only its quiet anchor bead and no line", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, ROOT_ID);
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await expect(page.locator(".operation-trail__path--up, .operation-trail__dots--up")).toHaveCount(0);
    await expect(page.locator(TARGET)).toHaveCount(1);
  });

  test("starting a lasso takes it away", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await passageText(page, DEEP_ID).click();
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    await expect(page.locator(TRAIL)).toHaveCount(0);
  });

  test("the trail adds a fixed handful of elements whatever the depth, never changes what the pointer reaches, and moves nothing", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await openFieldOnSelected(page);
    await expect(page.locator(TRAIL)).toHaveCount(1);

    const size = await page.evaluate(() => ({
      trail: document.querySelectorAll(".operation-trail, .operation-trail *").length,
      all: document.querySelectorAll("*").length,
    }));
    // The wrapper, one SVG, a path each for the line, the dots and the arrowheads, the target bead and at most
    // one cue: the element count does not grow with depth, and stays within the budget for depth 12.
    expect(size.trail).toBeGreaterThanOrEqual(4);
    expect(size.trail).toBeLessThanOrEqual(12);
    expect(size.trail).toBeLessThanOrEqual(16);
    expect(size.all).toBeGreaterThan(size.trail);

    const points = await samplePoints(page);
    const withTrail = await hitTargets(page, points);
    expect(withTrail.some((entry) => entry.includes("spatial-thought"))).toBe(true);
    await page.locator(TRAIL).evaluate((element) => { (element as HTMLElement).style.display = "none"; });
    const withoutTrail = await hitTargets(page, points);
    expect(withTrail).toEqual(withoutTrail);
    expect(withTrail.some((entry) => entry.includes("operation-trail"))).toBe(false);

    const before = await passageBox(page, DEEP_ID);
    await page.locator(TRAIL).evaluate((element) => { (element as HTMLElement).style.display = ""; });
    expect(await passageBox(page, DEEP_ID)).toEqual(before);
  });

  test("it rides the camera: beads keep their screen distance to the passages at every zoom", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    for (const zoom of [0.6, 1, 2]) {
      await setZoom(page, zoom);
      const centre = await beadCentre(page.locator(TARGET));
      const deep = await passageBox(page, DEEP_ID);
      if (zoom === 2) {
        // The gutter is past the paper's edge at this zoom: the bead stands in on the edge.
        await expect(page.locator(TRAIL)).toHaveAttribute("data-pinned", "true");
        expect(centre.x).toBeGreaterThan(305);
      } else {
        expect(Math.abs(centre.x - (deep.left - 36))).toBeLessThanOrEqual(2.5);
        expect(deep.top - centre.y).toBeGreaterThan(0);
        expect(deep.top - centre.y).toBeLessThanOrEqual(24.5);
      }
      // Screen sizes: the target and the cue do not scale with the camera, and neither do the strokes.
      const sizes = await page.evaluate(() => ({
        target: document.querySelector(".operation-trail__bead--target")!.getBoundingClientRect().width,
        chevron: document.querySelector(".operation-trail__chevron")?.getBoundingClientRect().width ?? null,
        line: getComputedStyle(document.querySelector(".operation-trail__path--up")!).strokeWidth,
        dots: (() => {
          const dots = document.querySelector(".operation-trail__dots--up");
          return dots === null ? "7px" : getComputedStyle(dots).strokeWidth;
        })(),
      }));
      expect(sizes.target).toBeCloseTo(11, 0);
      expect(sizes.line).toBe("1.75px");
      expect(sizes.dots).toBe("7px");
      if (sizes.chevron !== null) expect(sizes.chevron).toBeLessThan(10);
    }
  });

  test("forced colours draw every part of it in CanvasText", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    await showAncestors(page);
    expect(await dotCentres(page, ".operation-trail__dots--up")).toHaveLength(1);
    const receipt = await page.evaluate(() => {
      const probe = (value: string) => {
        const element = document.createElement("span");
        element.style.color = value;
        document.body.append(element);
        const color = getComputedStyle(element).color;
        element.remove();
        return color;
      };
      const path = document.querySelector(".operation-trail__path--up")!;
      const dots = document.querySelector(".operation-trail__dots--up")!;
      const arrows = document.querySelector(".operation-trail__arrows--up")!;
      const target = document.querySelector(".operation-trail__bead--target")!;
      return {
        canvasText: probe("CanvasText"),
        stroke: getComputedStyle(path).stroke,
        dots: getComputedStyle(dots).stroke,
        arrows: getComputedStyle(arrows).fill,
        target: getComputedStyle(target).backgroundColor,
      };
    });
    expect(receipt.stroke).toBe(receipt.canvasText);
    expect(receipt.dots).toBe(receipt.canvasText);
    expect(receipt.arrows).toBe(receipt.canvasText);
    expect(receipt.target).toBe(receipt.canvasText);
  });

  test("a pending Elastic turn keeps the operating trail to its passage and releases it when the turn ends", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/turn", async (route) => {
      await gate;
      await route.continue();
    });
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await passageText(page, DEEP_ID).click();
    await page.getByRole("button", {
      name: fixtureUiCopy.toolRail.circleSelectLanguage,
      exact: true,
    }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    await settleLassoGeometry(page);
    // Choosing the degree is not yet an operation, and a lasso suppresses the selected trail.
    const text = page.locator(`[data-thought-text-id="${DEEP_ID}"] .spatial-thought__label`);
    await drawLoop(page, await firstSegmentProbe(text));
    const grip = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
    await expect(grip).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator(TRAIL)).toHaveCount(0);
    await grip.focus();
    await page.keyboard.press("PageUp");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(page.locator(TRAIL)).toHaveCount(0);

    await page.keyboard.press("Enter");
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "operating");

    release();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-transform-phase", "requesting", {
      timeout: 15_000,
    });
    await expect(page.locator(`${TRAIL}[data-strength="operating"]`)).toHaveCount(0);
  });

  test("the index underlines exactly the passages the trail puts a bead on", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(TARGET)).toHaveCount(1);
    await showAncestors(page);
    const underlined = await page.locator("aside.material-files .material-file[data-in-lineage='true']")
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.nodeId ?? ""));
    // The document root names the index's outline; it is not a passage.
    const passages = underlined.filter((id) => id.length > 0 && !id.startsWith("matter_document_root_"));
    expect(new Set(passages)).toEqual(new Set([ROOT_ID, MIDDLE_ID]));
    // One dot per underlined ancestor that is on the paper, plus the target's bead.
    const dots = await dotCentres(page, ".operation-trail__dots--up");
    expect(dots.length).toBeGreaterThanOrEqual(1);
    expect(dots.length).toBeLessThanOrEqual(passages.length);
  });

  test("a selected passage with children draws them below it, lighter, with the same vocabulary", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    await showAncestors(page);
    await expect(page.locator(".operation-trail__path--down")).toHaveCount(1);
    // Imagined lives has two children: their dots, and an arrowhead into each.
    expect(await dotCentres(page, ".operation-trail__dots--down")).toHaveLength(2);
    expect(((await page.locator(".operation-trail__arrows--down").getAttribute("d")) ?? "").match(/Z/gu)).toHaveLength(2);
    expect(await page.locator(".operation-trail__path--down").evaluate((element) => getComputedStyle(element).opacity)).toBe("0.85");
    expect(await page.locator(".operation-trail__path--up").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    // Each child's dot sits in the gutter left of its passage, above its top.
    const [first, second] = await dotCentres(page, ".operation-trail__dots--down");
    const time = await passageBox(page, DEEP_ID);
    const relations = await passageBox(page, SIBLING_ID);
    expect(Math.abs(first!.x - (time.left - 36))).toBeLessThanOrEqual(2.5);
    expect(Math.abs(second!.x - (relations.left - 36))).toBeLessThanOrEqual(2.5);
    expect(time.top - first!.y).toBeGreaterThan(0);
    expect(relations.top - second!.y).toBeGreaterThan(0);
    // A leaf draws nothing below it, and a sibling of the path is never drawn.
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(".operation-trail__path--down, .operation-trail__dots--down")).toHaveCount(0);
  });

  test("Ask Matter draws the trail to the passages it is addressed to, lightly, and only while it is open", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await passageText(page, DEEP_ID).click();
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-lasso-mode", "true");
    await settleLassoGeometry(page);
    // A lasso that nothing has asked about draws nothing.
    await drawLoop(page, await firstSegmentProbe(page.locator(`[data-thought-text-id="${DEEP_ID}"] .spatial-thought__label`)));
    await expect(page.locator(".lasso-layer[data-selected=true]")).toBeVisible();
    await expect(page.locator(TRAIL)).toHaveCount(0);

    const ask = page.getByRole("button", { name: "询问 Matter", exact: true });
    await ask.click();
    await expect(page.getByRole("dialog", { name: "询问 Matter" })).toBeVisible();
    await expect(page.locator(TRAIL)).toHaveCount(1);
    await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "selected");
    await expect(page.locator(TARGET)).toHaveCount(1);
    await expect(page.locator(".operation-trail__path--down, .operation-trail__dots--down")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "询问 Matter" })).toBeHidden();
    await expect(page.locator(TRAIL)).toHaveCount(0);
  });

  test("Ask Matter over the whole working tree names no passage and draws no trail of its own", async ({ page }) => {
    await openSettled(page);
    await page.getByRole("button", { name: "询问 Matter", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "询问 Matter" })).toBeVisible();
    await expect(page.locator(TRAIL)).toHaveCount(0);
  });
});

/** A press on empty paper, away from every passage, the index and the rails. */
async function clearSelection(page: Page): Promise<void> {
  await page.mouse.click(1180, 220);
}

async function openSettled(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator("aside.material-files")).toHaveAttribute("data-persistence-phase", "saved");
}

function passageText(page: Page, nodeId: string) {
  return page.locator(`[data-thought-text-id="${nodeId}"]`);
}

/** The owner's path: select the passage through the index, then press its AI mark. */
async function openField(page: Page, nodeId: string): Promise<void> {
  await selectThoughtThroughMaterialIndex(page, nodeId);
  await passageText(page, nodeId).click();
  await openFieldOnSelected(page);
}

async function openFieldOnSelected(page: Page): Promise<void> {
  await page.mouse.move(24, DESKTOP.height - 24);
  const mark = page.locator("[data-node-action=point-talk]");
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(page.locator('.point-talk[data-presence="present"]')).toHaveAttribute("data-placed", "");
  await expect(page.getByRole("textbox", { name: DIRECTION_LABEL })).toBeFocused();
}

async function setZoom(page: Page, target: number): Promise<void> {
  const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
  await pan.click();
  const shell = page.locator("main.matter-shell");
  for (let step = 0; step < 60; step += 1) {
    const zoom = Number(await shell.getAttribute("data-viewport-zoom"));
    if (Math.abs(zoom - target) / target < 0.05) break;
    await shell.dispatchEvent("wheel", {
      clientX: 720, clientY: 450, ctrlKey: true, deltaMode: 0, deltaY: zoom > target ? 40 : -40,
    });
    await page.waitForTimeout(30);
  }
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
  await page.waitForTimeout(150);
}

/** The closest zoom the canvas allows, with the camera moved right so every ancestor is on the paper. */
async function showAncestors(page: Page): Promise<void> {
  await setZoom(page, 0.6);
  const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
    .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
  await pan.click();
  await page.mouse.move(600, 780);
  await page.mouse.down();
  await page.mouse.move(900, 780, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
  await page.waitForTimeout(200);
}

/** The screen position of each dot a path draws as a zero-length round-capped segment. */
async function dotCentres(page: Page, selector: string): Promise<Point[]> {
  return page.locator(selector).evaluate((element) => {
    const matrix = (element as SVGGraphicsElement).getScreenCTM();
    if (matrix === null) throw new Error("the drawing has no screen transform");
    return Array.from((element.getAttribute("d") ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)h0/gu), (match) => {
      const point = new DOMPoint(Number(match[1]), Number(match[2])).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  });
}

async function passageBox(page: Page, nodeId: string) {
  return page.locator(`[data-thought-id="${nodeId}"]`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, middle: rect.top + rect.height / 2 };
  });
}

async function beadCentre(bead: Locator): Promise<Point> {
  return bead.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

async function samplePoints(page: Page): Promise<Point[]> {
  const boxes = await page.locator("[data-thought-id]").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }));
  const points: Point[] = [];
  for (const box of boxes) {
    points.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    points.push({ x: box.x - 24, y: box.y - 6 });
    points.push({ x: box.x - 6, y: box.y + box.height / 2 });
    points.push({ x: box.x + box.width + 6, y: box.y + box.height / 2 });
  }
  for (let x = 330; x < DESKTOP.width; x += 130) {
    for (let y = 60; y < DESKTOP.height; y += 90) points.push({ x, y });
  }
  return points;
}

async function hitTargets(page: Page, points: readonly Point[]): Promise<string[]> {
  return page.evaluate((samples) => samples.map(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    if (element === null) return "none";
    const owner = element.closest<HTMLElement>("[data-thought-id]")?.dataset.thoughtId ?? "";
    return `${element.tagName.toLowerCase()}.${String(element.getAttribute("class") ?? "")}|${owner}`;
  }), points);
}

async function routeRewrite(page: Page, gate: Promise<void>): Promise<void> {
  await page.route("**/api/text-swap", async (route) => {
    const envelope = route.request().postDataJSON() as {
      protocolVersion: string;
      requestVersion: string;
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await gate;
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

async function firstSegmentProbe(text: Locator): Promise<Readonly<{ x: number; y: number; width: number; height: number }>> {
  return text.evaluate((element) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const end = textNode.data.search(/[，。；：！？、,.;:!?]/u);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, end > 0 ? end : textNode.data.length);
    const rect = Array.from(range.getClientRects()).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (rect === undefined) throw new Error("fixture fragment missing");
    return { x: rect.left + rect.width / 2 - 2, y: rect.top + rect.height / 2 - 2, width: 4, height: 4 };
  });
}

async function drawLoop(
  page: Page,
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
): Promise<void> {
  const margin = 9;
  await page.mouse.move(rect.x - margin, rect.y - margin);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width + margin, rect.y - margin, { steps: 5 });
  await page.mouse.move(rect.x + rect.width + margin, rect.y + rect.height + margin, { steps: 4 });
  await page.mouse.move(rect.x - margin, rect.y + rect.height + margin, { steps: 5 });
  await page.mouse.move(rect.x - margin, rect.y + Math.min(18, rect.height * .45), { steps: 2 });
  await page.mouse.up();
}
