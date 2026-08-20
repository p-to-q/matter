import { expect, test, type Page } from "@playwright/test";

const ROOT_ID = "thought_fixture_root";
const SOURCE = "我们怀念的也许不是一个真实存在过的过去";
const EXPANDED = "我们怀念的也许不是一个真实存在过的、拥有非常清楚边界和十分完整形状的过去";

test("Elastic Language commits one laptop drag, then Undo, Redo, and reload stay exact", async ({ page }) => {
  await runElasticReceipt(page, "drag");
});

test("Elastic Language keeps its keyboard alternative and reduced-motion arrival atomic", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await runElasticReceipt(page, "keyboard");
  await expect(page.locator(".transform-text")).toHaveCount(0);
});

test("Elastic Language cancels below-threshold and late turns without changing material", async ({ page }) => {
  let turnRequests = 0;
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    const envelope = route.request().postDataJSON() as {
      protocolVersion: "0.2";
      requestVersion: "transform/2";
      id: string;
      treeId: string;
      treeRevision: number;
      selection: { nodeId: string; start: number; end: number };
    };
    await new Promise((resolve) => setTimeout(resolve, 450));
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
          text: EXPANDED,
          intent: "expand",
        },
        presentation: { motionHint: "grow" },
      }),
    }).catch(() => undefined);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, false);
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));
  const grip = page.getByRole("slider", {
    name: "Set selected language expansion with the lower handle",
  });
  const box = await grip.boundingBox();
  if (box === null) throw new Error("lower stretch grip missing");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 12);
  await page.mouse.up();
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  expect(turnRequests).toBe(0);

  await grip.focus();
  await page.keyboard.press("PageUp");
  await page.keyboard.press("Enter");
  await expect(page.locator(".stretch-status-marker[data-phase=requesting]")).toHaveText("正在展开");
  await page.keyboard.press("Escape");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await page.waitForTimeout(550);
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("Elastic Language uses a tap rail and tap grip without requiring drag", async ({ page }) => {
    await runElasticReceipt(page, "tap");
  });
});

async function runElasticReceipt(
  page: Page,
  input: "drag" | "tap" | "keyboard",
): Promise<void> {
  const browserErrors: string[] = [];
  let turnRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.route("**/api/turn", async (route) => {
    turnRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });

  if (input !== "tap") await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await focusRoot(page, input === "tap");
  await page.getByRole("button", { name: "Circle-select language", exact: true }).click();
  const text = page.locator(`[data-thought-text-id="${ROOT_ID}"] .spatial-thought__label`);
  await expect(text).toContainText(SOURCE);
  await drawEarlyReleaseLoop(page, await segmentProbeRect(text, 0));

  const grip = page.getByRole("slider", {
    name: "Set selected language expansion with the lower handle",
  });
  const rail = page.getByRole("slider", {
    name: "Set selected language expansion amount without dragging",
  });
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await expect(rail).toHaveAttribute("aria-valuenow", "0");

  if (input === "drag") {
    const box = await grip.boundingBox();
    if (box === null) throw new Error("lower stretch grip missing");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 60, { steps: 5 });
    await page.mouse.up();
  } else if (input === "tap") {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const railBox = await rail.boundingBox();
    if (railBox === null) throw new Error("tap amount rail missing");
    expect(railBox.width).toBeGreaterThanOrEqual(48);
    expect(railBox.height).toBe(120);
    await expect(rail).toHaveAttribute("data-stretch-mode", "armed");
    await page.touchscreen.tap(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    expect(turnRequests).toBe(0);
    const ratioTop = await page.locator(".stretch-handle__ratio").evaluate((element) =>
      getComputedStyle(element).top,
    );
    expect(ratioTop).toBe("-52px");
    const gripBox = await grip.boundingBox();
    if (gripBox === null) throw new Error("adjusted lower grip missing");
    await page.touchscreen.tap(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  } else {
    await grip.focus();
    await page.keyboard.press("PageUp");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    expect(turnRequests).toBe(0);
    await page.keyboard.press("Enter");
  }

  await expect(page.locator(".stretch-status-marker[data-phase=requesting]")).toHaveText("正在展开");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-transform-phase", "requesting");
  await expect(text).toContainText(EXPANDED);
  expect(turnRequests).toBe(1);
  if (input === "keyboard") {
    const animations = await page.locator(".transform-text__group").evaluateAll((groups) =>
      groups.map((group) => getComputedStyle(group).animationName),
    );
    expect(animations.every((name) => name === "none")).toBe(true);
  } else {
    const groupCount = Number(await page.locator(".transform-text").getAttribute("data-transform-reveal-groups"));
    expect(groupCount).toBeGreaterThanOrEqual(2);
    expect(groupCount).toBeLessThanOrEqual(4);
  }
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.getByRole("button", { name: "Undo last change", exact: true }).click();
  await expect(text).toContainText(SOURCE);
  await expect(text).not.toContainText(EXPANDED);
  await expect(page.locator(".transform-text")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+Z");
  await expect(text).toContainText(EXPANDED);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  await expect(page.locator("#material-files")).toHaveAttribute("data-persistence-phase", "saved");

  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await expect(page.locator(`[data-thought-text-id="${ROOT_ID}"]`)).toContainText(EXPANDED);
  await expect(page.locator(".transform-text")).toHaveCount(0);
  expect(turnRequests).toBe(1);
  expect(browserErrors).toEqual([]);
}

async function focusRoot(page: Page, narrow: boolean): Promise<void> {
  const rootText = page.locator(`[data-thought-text-id="${ROOT_ID}"]`);
  if (narrow) await rootText.click();
  else await rootText.hover();
  await page.getByRole("toolbar", { name: "Thought actions" })
    .getByRole("button", { name: "Focus this thought" })
    .click();
  await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
}

async function segmentProbeRect(
  text: ReturnType<Page["locator"]>,
  segmentIndex: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return text.evaluate((element, index) => {
    const textNode = element.firstChild;
    if (!(textNode instanceof Text)) throw new Error("plain text node missing");
    const content = textNode.data;
    const delimiters = ["，", "。", "；", "：", "！", "？", ",", ".", ";", ":", "!", "?"];
    const segments: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (let cursor = 0; cursor < content.length; cursor += 1) {
      if (!delimiters.includes(content[cursor]!)) continue;
      if (cursor > start) segments.push({ start, end: cursor });
      start = cursor + 1;
    }
    if (start < content.length) segments.push({ start, end: content.length });
    const segment = segments[index];
    if (segment === undefined) throw new Error("fixture segment missing");
    const range = document.createRange();
    range.setStart(textNode, segment.start);
    range.setEnd(textNode, segment.end);
    const rect = Array.from(range.getClientRects()).sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (rect === undefined) throw new Error("fixture fragment missing");
    return {
      x: rect.left + rect.width / 2 - 2,
      y: rect.top + rect.height / 2 - 2,
      width: 4,
      height: 4,
    };
  }, segmentIndex);
}

async function drawEarlyReleaseLoop(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
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
