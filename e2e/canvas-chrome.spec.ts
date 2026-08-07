import { expect, test } from "@playwright/test";

const PREFERENCES_KEY = "matter.canvas-preferences.v1";

test("desktop canvas chrome keeps Lefos geometry and Matter semantics", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");

  const paper = page.getByRole("region", { name: "Thought material" });
  const rootThought = page.locator('[data-thought-id="thought_fixture_root"]');
  const about = page.getByRole("button", { name: "关于", exact: true });
  const settings = page.getByRole("button", { name: "Matter 设置", exact: true });
  const askMatter = page.getByRole("button", { name: "询问 Matter", exact: true });
  const guidance = page.locator(".matter-guidance");
  const paperBox = await paper.boundingBox();
  const aboutBox = await about.boundingBox();
  const settingsBox = await settings.boundingBox();
  const askMatterBox = await askMatter.boundingBox();
  const guidanceBox = await guidance.boundingBox();
  if ([paperBox, aboutBox, settingsBox, askMatterBox, guidanceBox].some((box) => box === null)) {
    throw new Error("desktop canvas chrome geometry is not visible");
  }

  expectInset(aboutBox!.y - paperBox!.y, 25);
  expectInset(paperBox!.x + paperBox!.width - settingsBox!.x - settingsBox!.width, 25);
  expect(paperBox!.x + paperBox!.width - askMatterBox!.x - askMatterBox!.width).toBeGreaterThan(180);
  expectInset(paperBox!.y + paperBox!.height - askMatterBox!.y - askMatterBox!.height, 25);
  expectInset(guidanceBox!.x - paperBox!.x, 21);
  expectInset(paperBox!.y + paperBox!.height - guidanceBox!.y - guidanceBox!.height, 25);
  expect(await guidance.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      fontSize: style.fontSize,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
    };
  })).toEqual({
    family: expect.stringContaining("departureMono"),
    fontSize: "14px",
    letterSpacing: "0.7px",
    lineHeight: "20px",
  });

  await page.waitForTimeout(1100);
  await guidance.evaluate((element) => { element.style.animation = "none"; });
  await askMatter.evaluate((element) => { element.style.animation = "none"; });
  await guidance.hover();
  await page.waitForTimeout(200);
  expect(["rgb(22, 29, 39)", "rgb(245, 245, 242)"])
    .toContain(await guidance.evaluate((element) => getComputedStyle(element, "::before").backgroundColor));
  await askMatter.hover();
  await page.waitForTimeout(200);
  expect(["rgb(22, 29, 39)", "rgb(245, 245, 242)"])
    .toContain(await askMatter.evaluate((element) => getComputedStyle(element, "::before").backgroundColor));

  await settings.click();
  const settingsMenu = page.getByRole("menu", { name: "Matter 设置" });
  await expect(settingsMenu).toBeVisible();
  expect(await settingsMenu.getByRole("menuitem").allTextContents()).toEqual([
    "定价",
    "隐私政策",
    "服务条款",
  ]);
  const settingsMenuBox = await settingsMenu.boundingBox();
  expect(settingsMenuBox?.width).toBeCloseTo(160, 0);
  expect(settingsMenuBox?.height).toBeCloseTo(104, 0);

  await settingsMenu.getByRole("menuitem", { name: "定价", exact: true }).click();
  const pricing = page.getByRole("dialog", { name: "定价" });
  await expect(pricing).toBeVisible();
  await expect(page.locator(".tool-rail")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".tool-rail")).toBeHidden();
  await expect(pricing.locator("input, textarea, form, [contenteditable=true]")).toHaveCount(0);
  await pricing.getByRole("button", { name: "关闭: 定价" }).click();
  await expect(pricing).toHaveCount(0);
  await expect(page.locator(".tool-rail")).not.toHaveAttribute("aria-hidden", "true");
  await expect(settings).toBeFocused();

  await askMatter.click();
  const inquiryDialog = page.getByRole("dialog", { name: "询问 Matter" });
  await expect(inquiryDialog).toBeVisible();
  await page.waitForTimeout(180);
  const inquiryBox = await inquiryDialog.boundingBox();
  const currentAskMatterBox = await askMatter.boundingBox();
  if (inquiryBox === null || currentAskMatterBox === null) {
    throw new Error("desktop inquiry geometry is not visible");
  }
  expectInset(inquiryBox.x + inquiryBox.width, currentAskMatterBox.x + currentAskMatterBox.width);
  expectInset(
    currentAskMatterBox.y + currentAskMatterBox.height - (inquiryBox.y + inquiryBox.height),
    30,
  );
  const inquiryField = inquiryDialog.getByRole("textbox", { name: "问一句关于这份材料的话" });
  const dictate = inquiryDialog.getByRole("button", { name: "口述", exact: true });
  await expect(inquiryDialog).toContainText("先用麦克风说出根想法，再选中一段材料，继续向下生长。");
  await expect(inquiryField).toBeFocused();
  await expect(dictate).toBeVisible();
  await dictate.click();
  const stopDictating = inquiryDialog.getByRole("button", { name: "停止口述", exact: true });
  await expect(stopDictating).toBeVisible();
  await page.waitForTimeout(400);
  await stopDictating.click();
  await expect(dictate).toBeVisible({ timeout: 10_000 });
  await inquiryField.fill("这份材料在怀念什么？");
  await inquiryDialog.getByRole("button", { name: "询问", exact: true }).click();
  const matterTurn = inquiryDialog.locator('[data-inquiry-role="matter"]');
  await expect(matterTurn).not.toContainText("正在询问…", { timeout: 20_000 });
  await expect(matterTurn).toHaveText(/\S/u);
  await page.keyboard.press("Escape");
  await expect(inquiryDialog).toBeHidden();
  await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "none");
  await page.locator('[data-chrome-control="language"]').click({ force: true });
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.locator(".matter-guidance__next")).toHaveText("Select one thought.");
  await expect(page.getByRole("button", { name: "Ask Matter", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Leaf shadows: On" }).click();
  await expect(paper).toHaveAttribute("data-leaf-fx", "off");
  await expect(page.locator("[data-matter-ambient='leaf-shadows']")).toHaveAttribute("data-fx", "off");

  await page.getByRole("button", { name: "Appearance: Auto" }).click();
  await expect(paper).toHaveAttribute("data-canvas-theme-preference", "light");
  await expect(paper).toHaveAttribute("data-canvas-theme", "light");
  await rootThought.locator("[data-thought-text-id]").click();
  await expect(rootThought).toHaveAttribute("data-selected", "true");
  await expect(rootThought.locator(".spatial-thought__label"))
    .toHaveCSS("background-color", "rgba(22, 29, 39, 0.08)");
  await page.getByRole("button", { name: "Appearance: Light" }).click();
  await expect(paper).toHaveAttribute("data-canvas-theme-preference", "dark");
  await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
  await expect(rootThought).toHaveAttribute("data-selected", "true");
  await expect(rootThought.locator("[data-thought-text-id]")).toHaveCSS("color", "rgb(243, 244, 241)");
  await expect(rootThought.locator(".spatial-thought__label"))
    .toHaveCSS("background-color", "rgba(245, 245, 242, 0.15)");
  await expect(page.locator("[data-matter-ambient='leaf-shadows'] .matter-ambient__poster"))
    .toHaveCSS("filter", "grayscale(1) contrast(0.9) brightness(0.9)");
  await expect(page.locator("[data-matter-ambient='leaf-shadows'] .matter-ambient__video"))
    .toHaveCSS("filter", "grayscale(1) contrast(0.9) brightness(0.9)");

  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PREFERENCES_KEY))
    .toEqual({ version: 1, language: "en-US", leafFx: false, appearance: "dark" });
  await page.reload();
  await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
  await expect(paper).toHaveAttribute("data-leaf-fx", "off");
  await expect(page.getByRole("button", { name: "Ask Matter", exact: true })).toBeVisible();
});

test("mobile canvas menu stays inside the paper and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matter");

  const paper = page.getByRole("region", { name: "Thought material" });
  const trigger = page.getByRole("button", { name: "打开 Matter 菜单" });
  await expect(page.getByRole("button", { name: "关于", exact: true })).toBeHidden();
  await expect(trigger).toBeVisible();

  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Matter" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator(".tool-rail")).toHaveAttribute("aria-hidden", "true");
  const paperBox = await paper.boundingBox();
  const sheetBox = await sheet.boundingBox();
  if (paperBox === null || sheetBox === null) throw new Error("mobile sheet geometry is not visible");
  expect(sheetBox.width).toBeLessThanOrEqual(320);
  expectInset(paperBox.x + paperBox.width - sheetBox.x - sheetBox.width, 1);
  expectInset(sheetBox.y - paperBox.y, 1);
  expectInset(paperBox.height - sheetBox.height, 2);

  await sheet.getByRole("button", { name: "询问 Matter", exact: true }).click();
  const inquiry = page.getByRole("dialog", { name: "询问 Matter" });
  await expect(inquiry).toBeVisible();
  await expect(inquiry).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(inquiry).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await sheet.getByRole("button", { name: "关于 Matter" }).click();
  const aboutDialog = page.getByRole("dialog", { name: "关于 Matter" });
  await expect(aboutDialog).toContainText("Matter 邀请你在一个想法变成答案之前");
  await aboutDialog.getByRole("button", { name: "关闭: 关于 Matter" }).click();
  await expect(aboutDialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator(".tool-rail")).not.toHaveAttribute("aria-hidden", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

function expectInset(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.1);
}
