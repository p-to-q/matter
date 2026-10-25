import { expect, test, type Locator, type Page } from "@playwright/test";
import { SEEDED_DOCUMENT_NODE_IDS } from "../features/matter/material/seeded-document";
import { settleLassoGeometry } from "./lasso-driver";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";
import { OPERATION_TRAIL_PX } from "../features/matter/layout/operation-trail";

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

  test("each adjacent bridge has exact visible-material ports, small points and no halo or solid arrow", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    // Zoomed out and moved so the root passage is on the paper: its dot, and the target's bead.
    await showAncestors(page);
    const dots = await dotCentres(page, ".operation-trail__dots--up");
    expect(dots).toHaveLength(1);
    await expect(page.locator(TARGET)).toHaveCount(1);
    const root = await passageBox(page, ROOT_ID);
    // The source is the visible parent's outgoing port, not its column's left edge.
    expect(Math.abs(dots[0]!.x - root.right)).toBeLessThanOrEqual(2);
    const target = await beadCentre(page.locator(TARGET));
    const middle = await passageBox(page, MIDDLE_ID);
    expect(dots[0]!.y).toBeGreaterThanOrEqual(root.rowTop - 1);
    expect(dots[0]!.y).toBeLessThanOrEqual(root.rowBottom + 1);
    expect(Math.abs(dots[0]!.y - target.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(target.x - middle.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(target.y - middle.middle)).toBeLessThanOrEqual(2);
    expect(await page.locator(TARGET).evaluate((element) => element.getBoundingClientRect().width))
      .toBeCloseTo(OPERATION_TRAIL_PX.target, 0);
    expect(await page.locator(TARGET).evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");
    const arrows = page.locator(".operation-trail__arrows--up");
    if (await arrows.count() > 0) {
      await expect(arrows).toHaveCSS("display", "none");
      expect((await arrows.getAttribute("d")) ?? "").not.toMatch(/Z/u);
    }
  });

  test("each first-child step bridges its actual parent and child without crossing the passage between steps", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await showAncestors(page);
    await expect(page.locator(TRAIL)).not.toHaveAttribute("data-pinned", "true");
    const bridges = await bridgePorts(page);
    expect(bridges).toHaveLength(2);
    const boxes = await Promise.all([ROOT_ID, MIDDLE_ID, DEEP_ID].map((id) => passageBox(page, id)));
    for (const [index, bridge] of bridges.entries()) {
      expect(Math.abs(bridge.from.x - boxes[index]!.right)).toBeLessThanOrEqual(2);
      expect(bridge.from.y).toBeGreaterThanOrEqual(boxes[index]!.rowTop - 1);
      expect(bridge.from.y).toBeLessThanOrEqual(boxes[index]!.rowBottom + 1);
      expect(Math.abs(bridge.from.y - bridge.to.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(bridge.to.x - boxes[index + 1]!.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(bridge.to.y - boxes[index + 1]!.middle)).toBeLessThanOrEqual(2);
    }
  });

  test("visible-material review keeps both endpoints readable in light, dark and leaf atmosphere", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    await setZoom(page, 1);
    await frameAdjacentMaterialPair(page, ROOT_ID, MIDDLE_ID);
    expect(Number(await page.locator("main.matter-shell").getAttribute("data-viewport-zoom"))).toBeGreaterThanOrEqual(0.9);
    await attachBridgeHypotheses(page);
  });

  test("the 2.5px soft-corner stroke keeps its screen weight while zooming", async ({ page }) => {
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
      fill: "none", linecap: "round", linejoin: "round", vectorEffect: "non-scaling-stroke", width: "2.5px", animationName: "none",
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
    expect(await page.locator(TARGET).evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");

    await openFieldOnSelected(page);
    await expect(trail).toHaveAttribute("data-strength", "operating");
    expect(await page.locator(TARGET).evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");
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
      if (await page.locator(TARGET).count() === 0) return true;
      const centre = await beadCentre(page.locator(TARGET));
      const ids = await page.locator("[data-thought-id]").evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).dataset.thoughtId!));
      const boxes = await Promise.all(ids.map((id) => passageBox(page, id)));
      return boxes.some((box) => Math.abs(centre.x - box.left) <= 2.5 && Math.abs(centre.y - box.middle) <= 2.5);
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
    expect(Math.abs(target.x - sibling.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(target.y - sibling.middle)).toBeLessThanOrEqual(2);
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

  test("a real pending font load cuts old ink and recovers current material ports", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    await expect(page.locator(`${TRAIL} svg`)).toHaveCount(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/matter-ui\/PlantinNowVariable-Upright\.woff2\?trail-proof$/u, async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.evaluate(() => {
        const face = new FontFace("MatterTrailProof", 'url("/matter/matter-ui/PlantinNowVariable-Upright.woff2?trail-proof")');
        document.fonts.add(face);
        // A fresh URL loads real repository font bytes, not a synthetic event.
        void document.fonts.load('20px "MatterTrailProof"', "Matter").catch(() => undefined);
      });
      await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loading");
      await expect(page.locator(`${TRAIL} svg`)).toHaveCount(0);
      release();
      await expect.poll(() => page.evaluate(() => Array.from(document.fonts)
        .some((face) => face.family === "MatterTrailProof" && face.status === "loaded"))).toBe(true);
      await expect(page.locator(`${TRAIL} svg`)).toHaveCount(1);
      const material = await passageBox(page, MIDDLE_ID);
      const target = await beadCentre(page.locator(TARGET));
      expect(Math.abs(target.x - material.left)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(target.y - material.middle)).toBeLessThanOrEqual(2.5);
    } finally {
      release();
    }
  });

  test("node dragging cuts the old attachments and cancellation restores exact current ports", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    await expect(page.locator(`${TRAIL} svg`)).toHaveCount(1);
    const shell = page.locator("main.matter-shell");
    const revision = await shell.getAttribute("data-tree-revision");
    const source = page.locator(`[data-thought-id="${DEEP_ID}"]`);
    const box = (await source.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try {
      await page.mouse.move(box.x + box.width / 2 + 44, box.y + box.height / 2 + 36, { steps: 5 });
      await expect(shell).toHaveAttribute("data-node-dragging", "true");
      await expect(page.locator(`${TRAIL} svg`)).toHaveCount(0);
      await shell.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true });
    } finally {
      await page.mouse.up();
    }
    await expect(shell).not.toHaveAttribute("data-node-dragging", /.+/u);
    await expect(shell).toHaveAttribute("data-tree-revision", revision!);
    await expect(page.locator(`${TRAIL} svg`)).toHaveCount(1);
    const material = await passageBox(page, DEEP_ID);
    const target = await beadCentre(page.locator(TARGET));
    expect(Math.abs(target.x - material.left)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(target.y - material.middle)).toBeLessThanOrEqual(2.5);
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

  test("it rides the camera: beads stay attached to passage boundaries at every zoom", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    for (const zoom of [0.6, 1, 2]) {
      await setZoom(page, zoom);
      const deep = await passageBox(page, DEEP_ID);
      if (zoom === 2) {
        // An offscreen material is not impersonated by a dot pinned to the paper.
        await expect(page.locator(TRAIL)).not.toHaveAttribute("data-pinned", "true");
        await expect(page.locator(TARGET)).toHaveCount(0);
      } else {
        const centre = await beadCentre(page.locator(TARGET));
        expect(Math.abs(centre.x - deep.left)).toBeLessThanOrEqual(2.5);
        expect(Math.abs(centre.y - deep.middle)).toBeLessThanOrEqual(2.5);
      }
      // Screen sizes: the target and the cue do not scale with the camera, and neither do the strokes.
      const sizes = await page.evaluate(() => ({
        target: document.querySelector(".operation-trail__bead--target")?.getBoundingClientRect().width ?? null,
        chevron: document.querySelector(".operation-trail__chevron")?.getBoundingClientRect().width ?? null,
        line: getComputedStyle(document.querySelector(".operation-trail__path--up")!).strokeWidth,
        dots: (() => {
          const dots = document.querySelector(".operation-trail__dots--up");
          return dots === null ? null : getComputedStyle(dots).strokeWidth;
        })(),
      }));
      if (sizes.target !== null) expect(sizes.target).toBeCloseTo(OPERATION_TRAIL_PX.target, 0);
      expect(sizes.line).toBe("2.5px");
      if (sizes.dots !== null) expect(sizes.dots).toBe(`${OPERATION_TRAIL_PX.bead}px`);
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
        arrows: arrows === null ? null : getComputedStyle(arrows).stroke,
        target: getComputedStyle(target).fill,
      };
    });
    expect(receipt.stroke).toBe(receipt.canvasText);
    expect(receipt.dots).toBe(receipt.canvasText);
    if (receipt.arrows !== null) expect(receipt.arrows).toBe(receipt.canvasText);
    expect(receipt.target).toBe(receipt.canvasText);
  });

  for (const handle of ["bottom", "top"] as const) {
    test(`a pending Elastic turn from the ${handle} grip attaches to visible text and releases when the turn ends`, async ({ page }) => {
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
      const grip = page.getByRole("slider", { name: handle === "top"
        ? "用上握点设置所选文字的展开程度"
        : "用下握点设置所选文字的展开程度" });
      await expect(grip).toHaveAttribute("aria-valuenow", "0");
      await expect(page.locator(TRAIL)).toHaveCount(0);
      await grip.focus();
      await page.keyboard.press("PageUp");
      await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
      await expect(page.locator(TRAIL)).toHaveCount(0);

      await page.keyboard.press("Enter");
      await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
      await expect(page.locator(TRAIL)).toHaveAttribute("data-strength", "operating");
      const split = page.locator(`[data-thought-id="${DEEP_ID}"] > .language-split-projection[data-preview-mode="expand"]`);
      await expect(split).toHaveAttribute("data-layout-mode", "expand");
      // This address starts at the first canonical segment. With the upper grip
      // the visible first row moves; the transparent canonical button does not.
      await expect.poll(async () => {
        if (await page.locator(TARGET).count() !== 1) return false;
        const port = await split.locator(".language-split-selected-copy").evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const first = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
            .sort((left, right) => left.top - right.top)[0];
          range.detach();
          if (first === undefined) throw new Error("visible Elastic row missing");
          return { x: first.left - 8, y: first.top + first.height / 2 };
        });
        const target = await beadCentre(page.locator(TARGET));
        return Math.abs(port.x - target.x) <= 2.5 && Math.abs(port.y - target.y) <= 2.5;
      }).toBe(true);

      release();
      await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-transform-phase", "requesting", {
        timeout: 15_000,
      });
      await expect(page.locator(`${TRAIL}[data-strength="operating"]`)).toHaveCount(0);
    });
  }

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
    // Every visible dot belongs to an ancestor's incoming or outgoing text port.
    const dots = await dotCentres(page, ".operation-trail__dots--up");
    expect(dots.length).toBeGreaterThanOrEqual(1);
    expect(dots.length).toBeLessThanOrEqual(passages.length * 2 - 1);
    const ports = await Promise.all(passages.map((id) => passageBox(page, id)));
    for (const dot of dots) {
      // A compatible first child shares an in-row source ordinate, not the
      // ancestor's independent midpoint. It must still belong to that row.
      expect(ports.some((port) =>
        Math.min(Math.abs(dot.x - port.left), Math.abs(dot.x - port.right)) <= 2 &&
        dot.y >= port.rowTop - 1 && dot.y <= port.rowBottom + 1,
      )).toBe(true);
    }
  });

  test("a selected passage with children draws them below it, lighter, with the same vocabulary", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, MIDDLE_ID);
    await showAncestors(page);
    await expect(page.locator(".operation-trail__path--down")).toHaveCount(1);
    // Two child ports share one deduplicated parent port; no mark floats in a column gutter.
    const dots = await dotCentres(page, ".operation-trail__dots--down");
    expect(dots).toHaveLength(3);
    const arrows = page.locator(".operation-trail__arrows--down");
    await expect(arrows).toHaveCSS("display", "none");
    expect((await arrows.getAttribute("d")) ?? "").not.toMatch(/Z/u);
    const strokes = await page.locator(".operation-trail__path--up, .operation-trail__path--down")
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).stroke));
    expect(strokes).toHaveLength(2);
    expect(strokes[0]).not.toBe(strokes[1]);
    const [parent, time, relations] = await Promise.all([MIDDLE_ID, DEEP_ID, SIBLING_ID].map((id) => passageBox(page, id)));
    for (const port of [{ x: parent!.right, y: parent!.middle }, { x: time!.left, y: time!.middle }, { x: relations!.left, y: relations!.middle }]) {
      expect(dots.some((dot) => Math.abs(dot.x - port.x) <= 2.5 && Math.abs(dot.y - port.y) <= 2.5)).toBe(true);
    }
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

for (const dpr of [1, 2]) {
  test.describe(`endpoint screen metrics at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test("one metric owner keeps points attached and clear at both zoom bounds", async ({ page }) => {
      await openSettled(page);
      await selectThoughtThroughMaterialIndex(page, DEEP_ID);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(dpr);
      const shell = page.locator("main.matter-shell");
      for (const zoom of [0.6, 1, 1.8]) {
        // Requests beyond a bound reach the actual clamp rather than stopping
        // within the ordinary helper's five-percent approach tolerance.
        await setZoom(page, zoom === 0.6 ? 0.5 : zoom === 1.8 ? 2 : zoom);
        expect(Number(await shell.getAttribute("data-viewport-zoom"))).toBeCloseTo(zoom, zoom === 1 ? 1 : 5);
        await frameBridgePorts(page, MIDDLE_ID, DEEP_ID);
        const trail = page.locator(TRAIL);
        await expect(trail).toHaveAttribute("data-strength", "selected");
        const metrics = await trail.evaluate((element) => {
          const style = getComputedStyle(element);
          const line = getComputedStyle(element.querySelector(".operation-trail__path--up")!);
          const dots = getComputedStyle(element.querySelector(".operation-trail__dots--up")!);
          const target = element.querySelector(".operation-trail__bead--target")!.getBoundingClientRect();
          return {
            stroke: Number.parseFloat(style.getPropertyValue("--operation-trail-stroke")),
            bead: Number.parseFloat(style.getPropertyValue("--operation-trail-bead")),
            more: Number.parseFloat(style.getPropertyValue("--operation-trail-more-dot")),
            lineWidth: Number.parseFloat(line.strokeWidth),
            dotWidth: Number.parseFloat(dots.strokeWidth),
            cap: dots.strokeLinecap,
            vector: dots.vectorEffect,
            targetWidth: target.width,
            targetHeight: target.height,
          };
        });
        expect(metrics).toMatchObject({
          stroke: OPERATION_TRAIL_PX.stroke,
          bead: OPERATION_TRAIL_PX.bead,
          more: OPERATION_TRAIL_PX.moreDot,
          lineWidth: OPERATION_TRAIL_PX.stroke,
          dotWidth: OPERATION_TRAIL_PX.bead,
          cap: "round",
          vector: "non-scaling-stroke",
        });
        expect(metrics.targetWidth).toBeCloseTo(OPERATION_TRAIL_PX.target, 2);
        expect(metrics.targetHeight).toBeCloseTo(OPERATION_TRAIL_PX.target, 2);
        const [parent, child] = await Promise.all([MIDDLE_ID, DEEP_ID].map((id) => passageBox(page, id)));
        const dots = await dotCentres(page, ".operation-trail__dots--up");
        const source = dots.find((dot) => Math.abs(dot.x - parent!.right) <= 1);
        expect(source, "the real parent outgoing point must remain drawn").toBeDefined();
        const target = await beadCentre(page.locator(TARGET));
        const lastBridge = (await bridgePorts(page)).at(-1)!;
        expect(Math.hypot(lastBridge.from.x - source!.x, lastBridge.from.y - source!.y)).toBeLessThan(0.1);
        expect(Math.hypot(lastBridge.to.x - target.x, lastBridge.to.y - target.y)).toBeLessThan(0.1);
        expect(dots.some((dot) => Math.hypot(dot.x - target.x, dot.y - target.y) < 0.1)).toBe(false);
        // Allow one screen pixel of snapping, not another marker radius.
        expect(source!.x - parent!.inkRight - metrics.dotWidth / 2)
          .toBeGreaterThanOrEqual(OPERATION_TRAIL_PX.clearance - OPERATION_TRAIL_PX.bead / 2 - 1);
        expect(child!.inkLeft - target.x - metrics.targetWidth / 2)
          .toBeGreaterThanOrEqual(OPERATION_TRAIL_PX.clearance - OPERATION_TRAIL_PX.target / 2 - 1);
      }
      await test.info().attach(`endpoint-metrics-dpr-${dpr}-candidate-not-accepted`, {
        body: await page.screenshot({ animations: "disabled" }), contentType: "image/png",
      });
    });
  });
}

async function bridgePorts(page: Page): Promise<Readonly<{ from: Point; to: Point }>[]> {
  return page.locator(".operation-trail__path--up").evaluate((element) => {
    const matrix = (element as SVGGraphicsElement).getScreenCTM();
    if (matrix === null) throw new Error("bridge transform missing");
    return ((element.getAttribute("d") ?? "").match(/M[^M]+/gu) ?? []).map((part) => {
      const start = /^M(-?[\d.]+) (-?[\d.]+)/u.exec(part);
      const end = [...part.matchAll(/L(-?[\d.]+) (-?[\d.]+)/gu)].at(-1);
      if (start === null || end === undefined) throw new Error("bridge endpoints missing");
      const from = new DOMPoint(Number(start[1]), Number(start[2])).matrixTransform(matrix);
      const to = new DOMPoint(Number(end[1]), Number(end[2])).matrixTransform(matrix);
      return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } };
    });
  });
}

/** Frame real ports through Pan only; index navigation may change readable zoom. */
async function frameBridgePorts(page: Page, parentId: string, childId: string): Promise<void> {
  const shell = page.locator("main.matter-shell");
  const before = await shell.getAttribute("data-viewport-zoom");
  const paper = (await page.locator(".matter-document").boundingBox())!;
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();
  for (let step = 0; step < 8; step += 1) {
    const [parent, child] = await Promise.all([parentId, childId].map((id) => passageBox(page, id)));
    const dx = paper.x + paper.width / 2 - (parent!.right + child!.left) / 2;
    const dy = paper.y + paper.height * 0.44 - (parent!.middle + child!.middle) / 2;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
    const x = paper.x + paper.width / 2;
    const y = paper.y + paper.height - 96;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + Math.max(-200, Math.min(200, dx)), y + Math.max(-150, Math.min(150, dy)), { steps: 8 });
    await page.mouse.up();
  }
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan, exact: true }).click();
  expect(await shell.getAttribute("data-viewport-zoom")).toBe(before);
  for (const [id, side] of [[parentId, "right"], [childId, "left"]] as const) {
    const box = await passageBox(page, id);
    expect(box[side]).toBeGreaterThan(paper.x + 64);
    expect(box[side]).toBeLessThan(paper.x + paper.width - 64);
    expect(box.middle).toBeGreaterThan(paper.y + 64);
    expect(box.middle).toBeLessThan(paper.y + paper.height - 64);
  }
}

/** Real-page style hypotheses only; no production toggle or acceptance claim. */
async function attachBridgeHypotheses(page: Page): Promise<void> {
  const style = await page.addStyleTag({ content: `
    .operation-trail[data-review-arrows] .operation-trail__arrows { display: block; }
    .operation-trail[data-review-arrows] .operation-trail__dots,
    .operation-trail[data-review-arrows] .operation-trail__bead { display: none; }
  ` });
  try {
    for (const theme of ["light", "dark"] as const) {
      // Auto follows the person's local clock, not prefers-color-scheme.
      // Use the product control so the review matches an explicit preference.
      for (let step = 0; step < 3; step += 1) {
        const paper = page.locator(".matter-document");
        if (await paper.getAttribute("data-canvas-theme-preference") === theme) break;
        await page.locator('[data-chrome-control="appearance"]').click();
      }
      await expect(page.locator(".matter-document")).toHaveAttribute("data-canvas-theme-preference", theme);
      await expect(page.locator(".matter-document")).toHaveAttribute("data-canvas-theme", theme);
      for (const fx of [false, true]) {
        const control = page.locator('[data-chrome-control="fx"]');
        if (await control.getAttribute("aria-pressed") !== String(fx)) await control.click();
        await expect(control).toHaveAttribute("aria-pressed", String(fx));
        for (const variant of ["A", "B"] as const) {
          await page.locator(TRAIL).evaluate((element, candidate) => {
            element.toggleAttribute("data-review-arrows", candidate === "B");
          }, variant);
          await test.info().attach(`visible-material-${variant}-${theme}-fx-${fx ? "on" : "off"}-not-accepted`, {
            body: await page.screenshot({ animations: "disabled" }), contentType: "image/png",
          });
        }
      }
    }
  } finally {
    await style.evaluate((element) => { element.parentNode?.removeChild(element); });
    await page.locator(TRAIL).evaluate((element) => element.removeAttribute("data-review-arrows"));
  }
}

/** Use the real Pan controller; never fake a camera transform for a screenshot. */
async function frameAdjacentMaterialPair(page: Page, parentId: string, childId: string): Promise<void> {
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan, exact: true }).click();
  const paper = (await page.locator(".matter-document").boundingBox())!;
  for (let step = 0; step < 8; step += 1) {
    const bounds = await Promise.all([parentId, childId].map((id) => passageBox(page, id)));
    const left = Math.min(...bounds.map((box) => box.envelopeLeft));
    const right = Math.max(...bounds.map((box) => box.envelopeRight));
    const top = Math.min(...bounds.map((box) => box.top));
    const bottom = Math.max(...bounds.map((box) => box.bottom));
    const dx = paper.x + paper.width / 2 - (left + right) / 2;
    const dy = paper.y + paper.height * 0.44 - (top + bottom) / 2;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
    const x = paper.x + paper.width / 2;
    const y = paper.y + paper.height - 96;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + Math.max(-200, Math.min(200, dx)), y + Math.max(-150, Math.min(150, dy)), { steps: 8 });
    await page.mouse.up();
  }
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan, exact: true }).click();
  for (const id of [parentId, childId]) {
    const box = await passageBox(page, id);
    expect(box.envelopeLeft).toBeGreaterThan(paper.x + 24);
    expect(box.envelopeRight).toBeLessThan(paper.x + paper.width - 24);
    expect(box.top).toBeGreaterThan(paper.y + 24);
    expect(box.bottom).toBeLessThan(paper.y + paper.height - 24);
  }
}

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
    const label = element.querySelector(":scope > [data-thought-text-id]");
    if (label === null) throw new Error("visible material text missing");
    const range = document.createRange();
    range.selectNodeContents(label);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    range.detach();
    if (rects.length === 0) throw new Error("visible material bounds missing");
    const first = [...rects].sort((left, right) => left.top - right.top)[0]!;
    const firstRow = rects.filter((rect) => rect.top < first.bottom && rect.bottom > first.top);
    const left = Math.min(...firstRow.map((rect) => rect.left));
    const right = Math.max(...firstRow.map((rect) => rect.right));
    const rowTop = Math.min(...firstRow.map((rect) => rect.top));
    const rowBottom = Math.max(...firstRow.map((rect) => rect.bottom));
    const picture = element.querySelector(".passage-picture")?.getBoundingClientRect();
    if (picture !== undefined && picture.width > 0 && picture.height > 0) rects.push(picture);
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    // Eight pixels is text-to-centre clearance; visible air also subtracts radius.
    return {
      left: left - 8, right: right + 8, top, bottom, middle: (rowTop + rowBottom) / 2, rowTop, rowBottom,
      inkLeft: left, inkRight: right,
      envelopeLeft: Math.min(...rects.map((rect) => rect.left)),
      envelopeRight: Math.max(...rects.map((rect) => rect.right)),
    };
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
    points.push({ x: box.x, y: box.y + box.height / 2 });
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
