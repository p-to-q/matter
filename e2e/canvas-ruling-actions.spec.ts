import { expect, test, type Page } from "@playwright/test";

const PREFERENCES_KEY = "matter.canvas-preferences.v1";
const ROOT_ID = "thought_fixture_root";

for (const viewport of [
  { name: "laptop", width: 1280, height: 800, cell: "636px 160px", clearance: 58, lens: { width: 54, height: 102 } },
  { name: "narrow", width: 390, height: 844, cell: "344px 128px", clearance: 32, lens: { width: 58, height: 110 } },
]) {
  test(`structural paper and one local action lens remain bounded at ${viewport.name}`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.addInitScript(({ key }) => {
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        language: "zh-CN",
        leafFx: false,
        appearance: "light",
      }));
    }, { key: PREFERENCES_KEY });
    await page.setViewportSize(viewport);
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

    const ruling = page.locator("[data-canvas-ruling='structural']");
    const root = page.locator(`[data-thought-id="${ROOT_ID}"]`);
    const rootText = root.locator("[data-thought-text-id]");
    await expect(ruling).toHaveCount(1);
    await expect(ruling).toHaveAttribute("data-active", "true");
    await expect(ruling).toHaveCSS("pointer-events", "none");
    await expect(ruling).toHaveCSS("opacity", "1");
    expect(await ruling.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.maskSize || style.webkitMaskSize;
    })).toBe(viewport.cell);

    const rulingGeometry = await page.evaluate(({ clearance, rootId }) => {
      const rulingElement = document.querySelector<HTMLElement>("[data-canvas-ruling]");
      const rootElement = document.querySelector<HTMLElement>(`[data-thought-id="${rootId}"]`);
      const paperElement = document.querySelector<HTMLElement>(".matter-document");
      if (rulingElement === null || rootElement === null || paperElement === null) return null;
      const rulingRect = rulingElement.getBoundingClientRect();
      const rootRect = rootElement.getBoundingClientRect();
      const paperRect = paperElement.getBoundingClientRect();
      return {
        expectedLeft: Math.max(paperRect.left, rootRect.left - clearance),
        left: rulingRect.left,
        paperLeft: paperRect.left,
      };
    }, { clearance: viewport.clearance, rootId: ROOT_ID });
    expect(rulingGeometry).not.toBeNull();
    expect(Math.abs(rulingGeometry!.left - rulingGeometry!.expectedLeft)).toBeLessThanOrEqual(1);
    expect(rulingGeometry!.left).toBeGreaterThanOrEqual(rulingGeometry!.paperLeft);

    if (viewport.name === "narrow") await rootText.click();
    else await rootText.hover();
    const lens = page.getByRole("toolbar", { name: "Thought actions" });
    await expect(lens).toBeVisible();
    await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
    await expect(lens.getByRole("button")).toHaveCount(2);
    await expect(lens.getByRole("button", { name: "Extend from this thought" })).toBeVisible();
    await expect(lens.getByRole("button", { name: "Focus this thought" })).toBeVisible();
    const expectedTarget = viewport.name === "narrow" ? 48 : 44;
    expect(await lens.getByRole("button").evaluateAll((buttons, target) => buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return Math.round(rect.width) === target && Math.round(rect.height) === target;
    }), expectedTarget)).toBe(true);
    expect(await lens.evaluate((element) => {
      const lensRect = element.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll("button"), (button) => button.getBoundingClientRect());
      return {
        width: Math.round(lensRect.width),
        height: Math.round(lensRect.height),
        centers: buttons.map((button) => Math.round((button.left + button.width / 2 - lensRect.left) * 10) / 10),
        lensCenter: Math.round(lensRect.width * 5) / 10,
      };
    })).toEqual({
      ...viewport.lens,
      centers: [viewport.lens.width / 2, viewport.lens.width / 2],
      lensCenter: viewport.lens.width / 2,
    });
    expect(await noLensCollision(page)).toBe(true);

    const beforeBranch = await page.locator("[data-thought-id]").count();
    await lens.getByRole("button", { name: "Extend from this thought" }).click();
    await expect(page.locator("[data-thought-id]")).toHaveCount(beforeBranch + 1);
    await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
    await page.getByRole("navigation", { name: "Editing tools" })
      .getByRole("button", { name: "Undo last change" }).click();
    await expect(page.locator("[data-thought-id]")).toHaveCount(beforeBranch);

    await rootText.hover();
    await lens.getByRole("button", { name: "Focus this thought" }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "focus");
    await rootText.hover();
    await expect(lens.getByRole("button")).toHaveCount(1);
    await expect(lens.getByRole("button", { name: "Show all material" })).toBeVisible();
    await lens.getByRole("button", { name: "Show all material" }).click();
    await expect(page.locator("main.matter-shell")).toHaveAttribute("data-view", "full");

    await rootText.hover();
    await expect(lens).toBeVisible();
    await page.getByRole("navigation", { name: "Editing tools" })
      .getByRole("button", { name: "Circle-select language" }).click();
    await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
    await page.getByRole("navigation", { name: "Editing tools" })
      .getByRole("button", { name: "Exit language selection" }).click();

    if (viewport.name === "laptop") {
      await page.locator('[data-chrome-control="appearance"]').click();
      await expect(page.locator(".matter-document")).toHaveAttribute("data-canvas-theme", "dark");
      await expect(ruling).toHaveCSS("background-color", "rgba(240, 242, 243, 0.09)");
      await rootText.hover();
      await expect(lens).toBeVisible();
      await expect(lens).toHaveCSS("color", "rgb(243, 244, 241)");
      expect(await lens.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain("blur(12px)");
      await page.locator('[data-chrome-control="fx"]').click();
      await expect(ruling).not.toHaveAttribute("data-active", "true");
      await expect(ruling).toHaveCSS("opacity", "0");
      await expect(page.locator("[data-matter-ambient='leaf-shadows']")).toHaveAttribute("data-fx", "on");
    }

    expect(browserErrors).toEqual([]);
  });
}

test("the action lens is hoverable across its clear gap and yields to pan and chrome overlays", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const rootText = page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`);
  const lens = page.getByRole("toolbar", { name: "Thought actions" });
  await rootText.hover();
  await expect(lens).toBeVisible();
  const textBox = await rootText.boundingBox();
  const lensBox = await lens.boundingBox();
  if (textBox === null || lensBox === null) throw new Error("thought and action lens must be measurable");
  const gapPoint = nearestGapPoint(textBox, lensBox);
  await page.mouse.move(gapPoint.x, gapPoint.y);
  await page.waitForTimeout(80);
  await page.mouse.move(lensBox.x + lensBox.width / 2, lensBox.y + lensBox.height / 2);
  await expect(lens).toBeVisible();

  const pan = page.getByRole("navigation", { name: "Editing tools" })
    .getByRole("button", { name: "Canvas pan" });
  await pan.click();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await page.getByRole("button", { name: "Exit canvas pan" }).click();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await rootText.hover();
  await expect(lens).toBeVisible();

  await page.locator('[data-chrome-control="settings"]').click();
  await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "settings");
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await rootText.hover();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "none");
  await page.mouse.move(0, 0);
  await rootText.focus();
  await expect(lens).toBeVisible();
});

test("the action lens has one direct keyboard path and restores the thought focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");

  const rootText = page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`);
  const lens = page.getByRole("toolbar", { name: "Thought actions" });
  const branch = lens.getByRole("button", { name: "Extend from this thought" });
  const focus = lens.getByRole("button", { name: "Focus this thought" });
  await rootText.focus();
  await expect(rootText).toBeFocused();
  await expect(lens).toBeVisible();
  await rootText.press("ArrowRight");
  await expect(branch).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(focus).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(branch).toBeFocused();
  await page.keyboard.press("End");
  await expect(focus).toBeFocused();
  await page.keyboard.press("Home");
  await expect(branch).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(rootText).toBeFocused();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
});

test("held-aside material never exposes local actions", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  const heldRow = page.locator("aside.material-files .material-file").nth(1);
  const heldId = await heldRow.getAttribute("data-node-id");
  if (heldId === null) throw new Error("fixture held-aside branch is missing");
  const heldThought = page.locator(`[data-thought-id="${heldId}"]`);
  const heldText = heldThought.locator("[data-thought-text-id]");
  await heldText.hover();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
  await heldRow.hover();
  await heldRow.locator(".material-file__context-control--set-aside").click();
  await expect(heldThought).toHaveAttribute("data-context-excluded", "true");
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
  await heldText.hover({ force: true });
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);
});

test.describe("coarse pointer action lens", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("uses selection rather than hover and retains the 48px target floor", async ({ page }) => {
    await page.goto("/matter");
    await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const rootText = page.locator(`[data-thought-id="${ROOT_ID}"] [data-thought-text-id]`);
    await rootText.tap();
    const lens = page.getByRole("toolbar", { name: "Thought actions" });
    await expect(lens).toBeVisible();
    expect(await lens.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    })).toEqual({ width: 58, height: 110 });
    expect(await lens.locator("button").evaluateAll((buttons) => buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      return Math.round(rect.width) === 48 && Math.round(rect.height) === 48;
    }))).toBe(true);
  });
});

test("the 2,000-node canvas still mounts one ruling and one delegated action lens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter/performance");
  await expect(page.locator("[data-thought-id]")).toHaveCount(2_000);
  await expect(page.locator("[data-canvas-ruling]")).toHaveCount(1);
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(0);

  const first = page.locator('[data-thought-id="perf_thought_0000"] [data-thought-text-id]');
  const next = page.locator('[data-thought-id="perf_thought_0001"] [data-thought-text-id]');
  await first.hover();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
  await expect(page.locator("[data-node-action-lens] button")).toHaveCount(2);
  await next.hover();
  await expect(page.locator("[data-node-action-lens]")).toHaveCount(1);
  await expect(page.locator("[data-node-action-lens]")).toHaveAttribute("data-node-id", "perf_thought_0001");
});

async function noLensCollision(page: Page): Promise<boolean> {
  return page.evaluate((rootId) => {
    const lens = document.querySelector<HTMLElement>("[data-node-action-lens]");
    const text = document.querySelector<HTMLElement>(`[data-thought-text-id="${rootId}"]`);
    const paper = document.querySelector<HTMLElement>(".matter-document");
    const rail = document.querySelector<HTMLElement>(".tool-rail");
    const guidance = document.querySelector<HTMLElement>(".matter-guidance");
    if (lens === null || text === null || paper === null || rail === null || guidance === null) return false;
    const lensRect = lens.getBoundingClientRect();
    const paperRect = paper.getBoundingClientRect();
    const overlaps = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return lensRect.left < rect.right && lensRect.right > rect.left &&
        lensRect.top < rect.bottom && lensRect.bottom > rect.top;
    };
    return lensRect.left >= paperRect.left + 12 && lensRect.right <= paperRect.right - 12 &&
      lensRect.top >= paperRect.top + 12 && lensRect.bottom <= paperRect.bottom - 12 &&
      !overlaps(text) && !overlaps(rail) && !overlaps(guidance);
  }, ROOT_ID);
}

function nearestGapPoint(
  text: Readonly<{ x: number; y: number; width: number; height: number }>,
  lens: Readonly<{ x: number; y: number; width: number; height: number }>,
) {
  const textRight = text.x + text.width;
  const textBottom = text.y + text.height;
  const lensRight = lens.x + lens.width;
  const lensBottom = lens.y + lens.height;
  if (lens.x >= textRight) return { x: (textRight + lens.x) / 2, y: lens.y + lens.height / 2 };
  if (lensRight <= text.x) return { x: (lensRight + text.x) / 2, y: lens.y + lens.height / 2 };
  if (lens.y >= textBottom) return { x: lens.x + lens.width / 2, y: (textBottom + lens.y) / 2 };
  return { x: lens.x + lens.width / 2, y: (lensBottom + text.y) / 2 };
}
