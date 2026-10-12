import { expect, test, type Locator, type Page } from "@playwright/test";
import { SEEDED_DOCUMENT_NODE_IDS } from "../features/matter/material/seeded-document";
import { settleLassoGeometry } from "./lasso-driver";
import { selectThoughtThroughMaterialIndex } from "./material-index-driver";
import { fixtureUiCopy } from "./matter-ui-copy";

// While an AI operation is addressed at a passage the canvas draws the line from
// the root down to it, and only then. These journeys prove when it exists, that
// it joins the passages it names, and that it never takes part in hit-testing.

const ROOT_ID = SEEDED_DOCUMENT_NODE_IDS.root;
const MIDDLE_ID = SEEDED_DOCUMENT_NODE_IDS.imaginedLives;
const DEEP_ID = SEEDED_DOCUMENT_NODE_IDS.imaginedTime;
const DIRECTION_LABEL = "告诉 AI 这段文字应该怎样改变";
const REWRITTEN = "也许我们怀念的，是一种不必马上证明效率的时间，它还没有被切成可以交付的单位。";
const DESKTOP = { width: 1440, height: 900 } as const;
const LINE = ".operation-line";

type Point = Readonly<{ x: number; y: number }>;

test.describe("operation line", () => {
  test("selecting, hovering, and focusing a passage draw no line", async ({ page }) => {
    await openSettled(page);
    await selectThoughtThroughMaterialIndex(page, DEEP_ID);
    const passage = passageText(page, DEEP_ID);
    await expect(page.locator(LINE)).toHaveCount(0);
    await passage.hover();
    await expect(page.locator("[data-node-action-lens]")).toBeVisible();
    await expect(page.locator(LINE)).toHaveCount(0);
    await passage.focus();
    await page.waitForTimeout(150);
    await expect(page.locator(LINE)).toHaveCount(0);
    await passage.click();
    await page.waitForTimeout(150);
    await expect(page.locator(LINE)).toHaveCount(0);
    expect(await page.locator("svg.operation-line, .operation-line__path").count()).toBe(0);
  });

  test("Point and Talk on a deep passage draws one line from the root-level passage to it", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);

    const line = page.locator(LINE);
    await expect(line).toHaveCount(1);
    await expect(page.locator(`${LINE} path`)).toHaveCount(1);
    await expect(line).toHaveAttribute("aria-hidden", "true");
    await expect(line).not.toHaveAttribute("tabindex", /.*/u);
    expect(await line.evaluate((element) => ({
      focusable: element.getAttribute("focusable"),
      pointerEvents: getComputedStyle(element).pointerEvents,
      text: element.textContent,
      inWorld: element.closest(".matter-world") !== null,
      beforeList: element.nextElementSibling?.classList.contains("spatial-thoughts") ?? false,
    }))).toEqual({
      focusable: "false",
      inWorld: true,
      beforeList: true,
      pointerEvents: "none",
      text: "",
    });

    const geometry = await readLine(page);
    // root -> imagined lives -> imagined time: two edges, one sub-path each.
    expect(geometry.subpaths).toHaveLength(2);
    const root = await passageBox(page, ROOT_ID);
    const middle = await passageBox(page, MIDDLE_ID);
    const deep = await passageBox(page, DEEP_ID);
    const first = geometry.subpaths[0]!;
    const second = geometry.subpaths[1]!;
    expectNear(first.start, { x: root.right, y: root.middle });
    expectNear(first.end, { x: middle.left, y: middle.middle });
    expectNear(second.start, { x: middle.right, y: middle.middle });
    expectNear(second.end, { x: deep.left, y: deep.middle });
    // Right-angle elbows: every leg is horizontal or vertical.
    for (const subpath of geometry.subpaths) {
      for (let index = 1; index < subpath.points.length; index += 1) {
        const from = subpath.points[index - 1]!;
        const to = subpath.points[index]!;
        expect(Math.min(Math.abs(from.x - to.x), Math.abs(from.y - to.y))).toBeLessThan(.5);
      }
    }
  });

  test("the line is one quiet element: still, thin, and in the paper's ink", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);
    const path = page.locator(`${LINE} path`);
    await expect(path).toHaveCount(1);
    expect(await path.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        fill: style.fill,
        linecap: style.strokeLinecap,
        transitionProperty: style.transitionProperty,
        vectorEffect: style.vectorEffect,
        width: style.strokeWidth,
      };
    })).toEqual({
      animationName: "none",
      fill: "none",
      linecap: "square",
      transitionProperty: "none",
      vectorEffect: "non-scaling-stroke",
      width: "1px",
    });
    // Ink at 28%, the colour the index ancestor mark also draws with.
    await expect(path).toHaveCSS("stroke", /\/ 0\.28\)$|rgba\(22, 29, 39, 0\.28\)$/u);
  });

  test("it leaves the instant the field closes, whatever closes it", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);
    await expect(page.locator(LINE)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(LINE)).toHaveCount(0);

    await openField(page, DEEP_ID);
    await expect(page.locator(LINE)).toHaveCount(1);
    await page.mouse.click(40, DESKTOP.height / 2);
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  test("a submitted rewrite keeps its line until the result settles", async ({ page }) => {
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
    await expect(page.locator(LINE)).toHaveCount(1);

    // Pressing elsewhere closes the field, but the submitted work is still the
    // operation: the line stays with it.
    await page.mouse.click(40, DESKTOP.height / 2);
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(LINE)).toHaveCount(1);

    release();
    await expect(passageText(page, DEEP_ID)).toContainText(REWRITTEN);
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  test("it ends with the settled result of an open field too", async ({ page }) => {
    await routeRewrite(page, Promise.resolve());
    await openSettled(page);
    await openField(page, DEEP_ID);
    await page.getByRole("textbox", { name: DIRECTION_LABEL }).fill("更凝练一些");
    await page.getByRole("button", { name: "改写", exact: true }).click();
    await expect(passageText(page, DEEP_ID)).toContainText(REWRITTEN);
    await expect(page.locator(LINE)).toHaveCount(0);
    await expect(page.locator(".point-talk")).toHaveCount(0);
  });

  test("it leaves when the target goes stale", async ({ page }) => {
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
    await expect(page.locator(LINE)).toHaveCount(1);

    // The target vanishes while its rewrite is in flight.
    await passageText(page, DEEP_ID).click();
    await expect(page.locator(".point-talk")).toHaveCount(0);
    await expect(page.locator(LINE)).toHaveCount(1);
    await page.keyboard.press("Delete");
    await expect(page.locator(`[data-thought-id="${DEEP_ID}"]`)).toHaveCount(0);
    await expect(page.locator(LINE)).toHaveCount(0);
    release();
    await page.waitForTimeout(300);
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  test("the line never changes what the pointer reaches, and adds at most a dozen elements", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);
    await expect(page.locator(LINE)).toHaveCount(1);

    const size = await page.evaluate(() => ({
      line: document.querySelectorAll(".operation-line, .operation-line *").length,
      all: document.querySelectorAll("*").length,
    }));
    expect(size.line).toBeLessThanOrEqual(12);
    expect(size.all).toBeGreaterThan(size.line);

    const points = await samplePoints(page);
    const withLine = await hitTargets(page, points);
    expect(withLine.some((entry) => entry.includes("spatial-thought"))).toBe(true);
    await page.locator(LINE).evaluate((element) => {
      element.setAttribute("data-e2e-hidden", "");
      (element as unknown as HTMLElement).style.display = "none";
    });
    const withoutLine = await hitTargets(page, points);
    expect(withLine).toEqual(withoutLine);
    expect(withLine.some((entry) => entry.includes("operation-line"))).toBe(false);

    // The passages did not move to make room for it either.
    const before = await passageBox(page, DEEP_ID);
    await page.locator(LINE).evaluate((element) => {
      (element as unknown as HTMLElement).style.display = "";
    });
    expect(await passageBox(page, DEEP_ID)).toEqual(before);
  });

  test("the line is the same in world coordinates after the camera moves", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);
    const before = await readLine(page);
    const root = await passageBox(page, ROOT_ID);

    const pan = page.getByRole("navigation", { name: fixtureUiCopy.toolRail.editingTools })
      .getByRole("button", { name: fixtureUiCopy.toolRail.canvasPan });
    await page.keyboard.press("Escape");
    await expect(page.locator(LINE)).toHaveCount(0);
    await pan.click();
    const shell = page.locator("main.matter-shell");
    const pivot = { x: root.right + 80, y: root.middle };
    await shell.dispatchEvent("wheel", {
      clientX: pivot.x,
      clientY: pivot.y,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -240,
    });
    await page.getByRole("button", { name: fixtureUiCopy.toolRail.exitCanvasPan }).click();
    await expect.poll(() => page.locator("main.matter-shell").getAttribute("data-viewport-zoom"))
      .not.toBe("1");

    await openField(page, DEEP_ID);
    const after = await readLine(page);
    expect(after.d).toBe(before.d);
    const rootAfter = await passageBox(page, ROOT_ID);
    expect(rootAfter.right).not.toBeCloseTo(root.right, 0);
    expectNear(after.subpaths[0]!.start, { x: rootAfter.right, y: rootAfter.middle });
    const deep = await passageBox(page, DEEP_ID);
    expectNear(after.subpaths[1]!.end, { x: deep.left, y: deep.middle });
  });

  test("forced colours draw it in CanvasText, and reduced motion changes nothing", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await openSettled(page);
    await openField(page, DEEP_ID);
    const path = page.locator(`${LINE} path`);
    await expect(path).toHaveCount(1);
    expect(await path.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const canvasText = getComputedStyle(probe).color;
      probe.remove();
      return {
        animationName: style.animationName,
        canvasText,
        stroke: style.stroke,
        transitionProperty: style.transitionProperty,
        width: style.strokeWidth,
      };
    })).toMatchObject({ animationName: "none", transitionProperty: "none", width: "1px" });
    const receipt = await path.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const canvasText = getComputedStyle(probe).color;
      probe.remove();
      return { canvasText, stroke: getComputedStyle(element).stroke };
    });
    expect(receipt.stroke).toBe(receipt.canvasText);
    expect((await readLine(page)).subpaths).toHaveLength(2);
  });

  test("a pending Elastic turn draws the line to its passage and drops it when the turn ends", async ({ page }) => {
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
    // Choosing the degree is not yet an operation.
    const text = page.locator(`[data-thought-text-id="${DEEP_ID}"] .spatial-thought__label`);
    await drawLoop(page, await firstSegmentProbe(text));
    const grip = page.getByRole("slider", { name: "用下握点设置所选文字的展开程度" });
    await expect(grip).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator(LINE)).toHaveCount(0);
    await grip.focus();
    await page.keyboard.press("PageUp");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(page.locator(LINE)).toHaveCount(0);

    await page.keyboard.press("Enter");
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
    await expect(page.locator(LINE)).toHaveCount(1);
    expect((await readLine(page)).subpaths).toHaveLength(2);

    release();
    await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-transform-phase", "requesting", {
      timeout: 15_000,
    });
    await expect(page.locator(LINE)).toHaveCount(0);
  });

  test("the index underlines exactly the passages the line joins", async ({ page }) => {
    await openSettled(page);
    await openField(page, DEEP_ID);
    const geometry = await readLine(page);
    const joined = await page.evaluate((starts) => {
      const ids: string[] = [];
      for (const start of starts) {
        const match = Array.from(document.querySelectorAll<HTMLElement>("[data-thought-id]"))
          .find((element) => {
            const rect = element.getBoundingClientRect();
            return Math.abs(rect.right - start.x) < 3 &&
              Math.abs(rect.top + rect.height / 2 - start.y) < 3;
          });
        if (match?.dataset.thoughtId !== undefined) ids.push(match.dataset.thoughtId);
      }
      return ids;
    }, geometry.subpaths.map((subpath) => subpath.start));
    expect(joined).toEqual([ROOT_ID, MIDDLE_ID]);

    const underlined = await page.locator("aside.material-files .material-file[data-in-lineage='true']")
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.nodeId ?? ""));
    // The document root names the index's outline; it is not a passage.
    const passages = underlined.filter((id) => id.length > 0 && !id.startsWith("matter_document_root_"));
    expect(new Set(passages)).toEqual(new Set(joined));
  });
});

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
  await page.mouse.move(24, DESKTOP.height - 24);
  const mark = page.locator("[data-node-action=point-talk]");
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(page.locator('.point-talk[data-presence="present"]')).toHaveAttribute("data-placed", "");
  await expect(page.getByRole("textbox", { name: DIRECTION_LABEL })).toBeFocused();
}

async function passageBox(page: Page, nodeId: string) {
  return page.locator(`[data-thought-id="${nodeId}"]`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, middle: rect.top + rect.height / 2 };
  });
}

function expectNear(actual: Point, expected: Point, tolerance = 3): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
}

/** The line's path in world coordinates (`d`) and in viewport pixels per sub-path. */
async function readLine(page: Page): Promise<Readonly<{
  d: string;
  subpaths: ReadonlyArray<Readonly<{ points: Point[]; start: Point; end: Point }>>;
}>> {
  return page.locator(`${LINE} path`).evaluate((element) => {
    const d = element.getAttribute("d") ?? "";
    const matrix = (element as SVGGraphicsElement).getScreenCTM();
    if (matrix === null) throw new Error("the line has no screen transform");
    const subpaths = d.split("M").filter((part) => part.length > 0).map((part) => {
      const points = part.split("L").map((pair) => {
        const [x, y] = pair.trim().split(" ").map(Number);
        const mapped = new DOMPoint(x, y).matrixTransform(matrix);
        return { x: mapped.x, y: mapped.y };
      });
      return { points, start: points[0]!, end: points[points.length - 1]! };
    });
    return { d, subpaths };
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
    points.push({ x: box.x - 6, y: box.y + box.height / 2 });
    points.push({ x: box.x + box.width + 6, y: box.y + box.height / 2 });
    points.push({ x: box.x + box.width / 2, y: box.y + box.height + 4 });
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
