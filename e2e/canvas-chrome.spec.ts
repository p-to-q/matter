import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixtureUiCopy } from "./matter-ui-copy";

const PREFERENCES_KEY = "matter.canvas-preferences.v1";

test("desktop canvas chrome keeps Lefos geometry and Matter semantics", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const inquiryQuestions: string[] = [];
  await page.route("**/api/inquiry", async (route) => {
    const request = route.request().postDataJSON() as {
      protocolVersion: string;
      requestId: string;
      question: string;
      context: {
        treeId: string;
        revision: number;
        scope: "selection" | "tree";
        lineage: Array<{ text: string }>;
        thoughtCount: number;
        clipped: boolean;
      };
    };
    inquiryQuestions.push(request.question);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        protocolVersion: request.protocolVersion,
        basis: {
          requestId: request.requestId,
          treeId: request.context.treeId,
          revision: request.context.revision,
          scope: request.context.scope,
        },
        status: "answered",
        text: "它怀念的是过去仍允许人想象的其他生活。",
        receipt: {
          scope: request.context.scope,
          lineageNodes: request.context.lineage.length,
          contextCodePoints: request.context.lineage.reduce(
            (total, node) => total + Array.from(node.text).length,
            0,
          ),
          clipped: request.context.clipped,
          thoughtCount: request.context.thoughtCount,
        },
      }),
    });
  });
  await page.goto("/matter");
  await page.evaluate(async () => document.fonts.ready);

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

  expectInset(aboutBox!.y + aboutBox!.height / 2 - paperBox!.y, 34);
  const settingsIconBox = await settings.locator("svg").boundingBox();
  if (settingsIconBox === null) throw new Error("settings icon geometry is not visible");
  expectInset(paperBox!.x + paperBox!.width - settingsIconBox.x - settingsIconBox.width, 25);
  expect(paperBox!.x + paperBox!.width - askMatterBox!.x - askMatterBox!.width).toBeGreaterThan(180);
  expectInset(paperBox!.y + paperBox!.height - (askMatterBox!.y + askMatterBox!.height / 2), 34);
  expectInset(guidanceBox!.x - paperBox!.x, 21);
  expectInset(paperBox!.y + paperBox!.height - guidanceBox!.y - guidanceBox!.height, 25);
  expect(await guidance.evaluate((element) => {
    const style = getComputedStyle(element);
    const label = element.querySelector<HTMLElement>(".matter-guidance__next");
    if (label === null) throw new Error("guidance label is missing");
    return {
      containerAnimation: style.animationName,
      family: style.fontFamily,
      fontSize: style.fontSize,
      labelAnimation: getComputedStyle(label).animationName,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
    };
  })).toEqual({
    containerAnimation: "none",
    family: expect.stringContaining("departureMono"),
    fontSize: "14px",
    labelAnimation: "matter-guidance-in",
    letterSpacing: "0.7px",
    lineHeight: "20px",
  });
  expect(await measureControlFloor(page, '[data-chrome-region="desktop"] [data-chrome-control]')).toEqual([]);
  const bottomChrome = page.locator('[data-chrome-region="bottom"]');
  const topOptical = await readOpticalClearance(page.locator('[data-chrome-region="top"]'));
  const bottomOptical = await readOpticalClearance(bottomChrome);
  const guidanceOptical = await readOpticalClearance(page.locator('[data-optical-clearance="guidance"]'));
  expect(bottomOptical).toMatchObject({
    outerBlur: "blur(0.8px)",
    outerBackground: "rgba(0, 0, 0, 0)",
    outerTop: "-22px",
    outerRight: "-28px",
    // Chromium quantizes mask alpha to 8-bit values: the shared .004 zero-foot
    // is exactly one alpha step. The browser receipt freezes that real output,
    // the deliberately shallow outer shoulder, and the inner soft step.
    outerMask: expect.stringMatching(/radial-gradient\(.+rgba\(0, 0, 0, 0\.72\) 30%.+rgba\(0, 0, 0, 0\.24\) 70%.+rgba\(0, 0, 0, 0\.03\) 89%.+rgba\(0, 0, 0, 0\.008\) 94%.+rgba\(0, 0, 0, 0\.004\) 97%.+rgba\(0, 0, 0, 0\) 100%\)/),
    innerBlur: "blur(3.25px)",
    innerBackground: "rgba(0, 0, 0, 0)",
    innerTop: "-11px",
    innerRight: "-15px",
    innerMask: expect.stringMatching(/radial-gradient\(.+rgba\(0, 0, 0, 0\.9\) 72%.+rgba\(0, 0, 0, 0\.72\) 77%.+rgba\(0, 0, 0, 0\.32\) 81%.+rgba\(0, 0, 0, 0\.02\) 91%.+rgba\(0, 0, 0, 0\.004\) 96%.+rgba\(0, 0, 0, 0\) 100%\)/),
    outerPointerEvents: "none",
    innerPointerEvents: "none",
  });
  expect(topOptical).toMatchObject({
    outerBlur: bottomOptical.outerBlur,
    outerBackground: "rgba(0, 0, 0, 0)",
    outerTop: "-14px",
    outerRight: "-18px",
    outerMask: bottomOptical.outerMask,
    innerBlur: bottomOptical.innerBlur,
    innerBackground: "rgba(0, 0, 0, 0)",
    innerTop: "-7px",
    innerRight: "-10px",
    innerMask: bottomOptical.innerMask,
    outerPointerEvents: "none",
    innerPointerEvents: "none",
  });
  expect(guidanceOptical).toMatchObject({
    outerBlur: bottomOptical.outerBlur,
    outerBackground: "rgba(0, 0, 0, 0)",
    outerTop: "-18px",
    outerRight: "-22px",
    outerMask: bottomOptical.outerMask,
    innerBlur: bottomOptical.innerBlur,
    innerBackground: "rgba(0, 0, 0, 0)",
    innerTop: "-9px",
    innerRight: "-12px",
    innerMask: bottomOptical.innerMask,
    outerPointerEvents: "none",
    innerPointerEvents: "none",
    outerZIndex: "0",
    innerZIndex: "0",
  });

  await page.waitForTimeout(1100);
  await guidance.locator(".matter-guidance__next").evaluate((element) => {
    (element as HTMLElement).style.animation = "none";
  });
  await askMatter.evaluate((element) => { element.style.animation = "none"; });
  await guidance.hover();
  await page.waitForTimeout(200);
  // Hover belongs to the label, not to the corner's backdrop-sampling owner.
  // The two optical planes keep treating the canvas behind the full group.
  const canvasTheme = await paper.getAttribute("data-canvas-theme");
  const expectedHoverBackground = canvasTheme === "dark"
    ? "rgb(245, 245, 242)"
    : canvasTheme === "light"
      ? "rgb(22, 29, 39)"
      : null;
  if (expectedHoverBackground === null) {
    throw new Error(`guidance has no resolved canvas theme: ${canvasTheme}`);
  }
  expect(await guidance.evaluate((element) => {
    const label = element.querySelector<HTMLElement>(".matter-guidance__next");
    if (label === null) throw new Error("guidance label is missing");
    return {
      containerBackground: getComputedStyle(element).backgroundColor,
      hovered: element.matches(":hover"),
      labelBackground: getComputedStyle(label, "::before").backgroundColor,
      pointerEvents: getComputedStyle(element).pointerEvents,
    };
  })).toEqual({
    containerBackground: "rgba(0, 0, 0, 0)",
    hovered: true,
    labelBackground: expectedHoverBackground,
    pointerEvents: "auto",
  });
  expect(await readOpticalClearance(page.locator('[data-optical-clearance="guidance"]')))
    .toEqual(guidanceOptical);
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
  await inquiryDialog.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
  const inquiryBox = await inquiryDialog.boundingBox();
  const currentAskMatterBox = await askMatter.boundingBox();
  if (inquiryBox === null || currentAskMatterBox === null) {
    throw new Error("desktop inquiry geometry is not visible");
  }
  expectInset(inquiryBox.x + inquiryBox.width, currentAskMatterBox.x + currentAskMatterBox.width);
  expectInset(
    currentAskMatterBox.y + currentAskMatterBox.height / 2 + 10 - (inquiryBox.y + inquiryBox.height),
    30,
  );
  const inquiryField = inquiryDialog.getByRole("textbox", { name: "问一句关于这份材料的话" });
  const dictate = inquiryDialog.getByRole("button", { name: "口述", exact: true });
  await expect(inquiryDialog).toContainText("就画面里被纳入的材料问一句短问题。询问不会改变它。");
  await expect(inquiryField).toBeFocused();
  await expect(dictate).toBeVisible();
  // The composer's controls carry data-inquiry-control rather than
  // data-chrome-control, so the earlier floor never saw them. They only exist
  // while the composer is open, which is why the check belongs here.
  expect(await measureControlFloor(page, "[data-inquiry-control]")).toEqual([]);
  await dictate.click();
  const stopDictating = inquiryDialog.getByRole("button", { name: "停止口述", exact: true });
  await expect(stopDictating).toBeVisible();
  await page.waitForTimeout(400);
  await stopDictating.click();
  await expect(dictate).toBeVisible({ timeout: 10_000 });
  await inquiryField.fill("这份材料在怀念什么？");
  await inquiryField.press("Shift+Enter");
  await inquiryField.type("保留这里的停顿。");
  await expect(inquiryField).toHaveValue("这份材料在怀念什么？\n保留这里的停顿。");
  await expect(inquiryDialog.getByRole("button", { name: "询问", exact: true })).toBeEnabled();
  await inquiryField.press("Enter");
  const matterTurn = inquiryDialog.locator('[data-inquiry-role="matter"]');
  await expect(matterTurn).not.toContainText("正在询问…", { timeout: 20_000 });
  await expect(matterTurn).toHaveText(/\S/u);
  expect(inquiryQuestions).toEqual(["这份材料在怀念什么？\n保留这里的停顿。"]);
  // Beginning another lasso swaps the context callback while its projected
  // tree context is still the same. That render must not discard this reply.
  await page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true }).click();
  // Hover rather than a measured offset. A node's box may begin left of the
  // paper it is clipped by, and a raw `x + 8` then lands in the material index
  // — an outside pointer-down, which legitimately dismisses the bubble. Hover
  // picks a point the element actually receives, so this asserts the product
  // rule instead of racing the canvas position.
  await rootThought.locator("[data-thought-text-id]").hover();
  await page.mouse.down();
  await expect(matterTurn).toHaveText("它怀念的是过去仍允许人想象的其他生活。");
  await page.mouse.up();
  // An ordinary text click leaves Lasso and selects material; the reply stays
  // stable through that context transition until the person closes inquiry.
  await expect(page.locator("main.matter-shell")).not.toHaveAttribute("data-lasso-mode", "true");
  await expect(page.getByRole("button", { name: fixtureUiCopy.toolRail.circleSelectLanguage, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inquiryDialog).toBeHidden();
  await expect(page.locator("[data-canvas-chrome]")).toHaveAttribute("data-overlay", "none");
  await page.reload();
  await expect(page.locator(".matter-canvas")).toHaveAttribute("data-layout-ready", "true");
  await askMatter.click();
  await expect(inquiryDialog).not.toContainText("这份材料在怀念什么？");
  await expect(inquiryDialog.locator("[data-inquiry-thread]")).toHaveCount(0);
  await expect(inquiryDialog.getByRole("button", { name: "清除记录", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator('[data-chrome-control="language"]').click({ force: true });
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.locator(".matter-guidance__next")).toHaveText("Select one thought.");
  await expect(page.getByRole("button", { name: "Ask Matter", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Leaf shadows: On" }).click();
  await expect(paper).toHaveAttribute("data-leaf-fx", "off");
  await expect(page.locator("[data-matter-ambient='leaf-shadows']")).toHaveAttribute("data-fx", "off");
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
  await expect(page.locator("[data-matter-ambient-foreground-pass]")).toHaveCount(0);

  await page.getByRole("button", { name: "Appearance: Auto" }).click();
  await expect(paper).toHaveAttribute("data-canvas-theme-preference", "light");
  await expect(paper).toHaveAttribute("data-canvas-theme", "light");
  await rootThought.locator("[data-thought-text-id]").click();
  await expect(rootThought).toHaveAttribute("data-selected", "true");
  const structuralAddress = page.locator(
    '.material-address-layer[data-address-variant="structural"]',
  );
  const structuralPath = structuralAddress.locator(".material-address-layer__path");
  await expect(structuralAddress).toHaveAttribute("data-material-address-painted", "true");
  await expect(rootThought.locator(".spatial-thought__label"))
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(structuralPath).toHaveCSS("fill", "rgba(22, 29, 39, 0.08)");
  await page.getByRole("button", { name: "Appearance: Light" }).click();
  await expect(paper).toHaveAttribute("data-canvas-theme-preference", "dark");
  await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
  await expect(rootThought).toHaveAttribute("data-selected", "true");
  await expect(rootThought.locator("[data-thought-text-id]")).toHaveCSS("color", "rgb(243, 244, 241)");
  await expect(rootThought.locator(".spatial-thought__label"))
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(structuralPath).toHaveCSS("fill", "rgba(240, 242, 243, 0.15)");
  await expect(page.locator("[data-matter-ambient='leaf-shadows'] .matter-ambient__poster"))
    .toHaveCSS("filter", "grayscale(1) contrast(0.9) brightness(1.31)");

  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PREFERENCES_KEY))
    .toEqual({ version: 1, language: "en-US", leafFx: false, appearance: "dark" });
  await page.reload();
  await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
  await expect(paper).toHaveAttribute("data-leaf-fx", "off");
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Matter", exact: true })).toBeVisible();
});

test("native leaf media crosses quiet corners while active chrome rises above it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/matter");

  const paper = page.getByRole("region", { name: "Thought material" });
  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  const media = ambient.locator(".matter-ambient__poster, .matter-ambient__video");
  const wash = ambient.locator(".matter-ambient__wash");
  const canvasChrome = page.locator("[data-canvas-chrome]");
  const guidance = page.locator(".matter-guidance");
  await expect(media).toHaveCount(1);
  await expect(ambient).toHaveAttribute("data-presentation", /poster|video/);
  await expect(ambient).toHaveCSS("z-index", "auto");
  await expect(ambient).toHaveCSS("pointer-events", "none");
  await expect(media).toHaveCSS("z-index", "37");
  await expect(wash).toHaveCSS("z-index", "3");
  await expect(canvasChrome).toHaveCSS("z-index", "36");
  await expect(guidance).toHaveCSS("z-index", "9");
  for (const control of ["appearance", "settings", "language", "inquiry"]) {
    expect(await page.locator(`[data-chrome-control="${control}"]`).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      )?.closest("[data-chrome-control]")?.getAttribute("data-chrome-control");
    })).toBe(control);
  }
  await page.locator('[data-chrome-control="appearance"]').click();
  await expect(paper).toHaveAttribute("data-canvas-theme", "light");
  await expect.poll(() => paper.evaluate((element) => ({
    overflow: getComputedStyle(element).overflow,
    scrollTop: element.scrollTop,
  }))).toEqual({ overflow: "clip", scrollTop: 0 });
  await page.getByRole("button", { name: "Matter 设置", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Matter 设置" })).toBeVisible();
  await expect(media).toHaveCount(1);
  await expect(media).toHaveCSS("filter", "grayscale(1) contrast(0.84) brightness(1.08)");
  await expect(media).toHaveCSS("mix-blend-mode", "multiply");
  await expect(media).toHaveCSS("opacity", "0.32");
  await expect(canvasChrome).toHaveCSS("z-index", "38");

  await page.locator('[data-chrome-control="settings"]').click();
  await expect(canvasChrome).toHaveCSS("z-index", "36");
  for (const control of ["language", "inquiry"]) {
    await page.locator(`[data-chrome-control="${control}"]`).click();
    await expect(media).toHaveCount(1);
    await expect(media).toHaveCSS("opacity", "0.32");
    await expect(canvasChrome).toHaveCSS("z-index", "38");
    await page.locator(`[data-chrome-control="${control}"]`).click();
  }

  await page.locator('[data-chrome-control="appearance"]').click();
  await expect(paper).toHaveAttribute("data-canvas-theme", "dark");
  await expect(media).toHaveCount(1);
  await expect(media).toHaveCSS("filter", "grayscale(1) contrast(0.9) brightness(1.31)");
  await expect(media).toHaveCSS("mix-blend-mode", "normal");
  await expect(media).toHaveCSS("opacity", "0.24");
  await page.locator('[data-chrome-control="language"]').click();
  await expect(media).toHaveCount(1);
  await expect(media).toHaveCSS("opacity", "0.24");
  await expect(canvasChrome).toHaveCSS("z-index", "38");
});

test("reduced motion keeps the native poster without loading leaf video", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      language: "zh-CN",
      leafFx: true,
      appearance: "light",
    }));
  }, PREFERENCES_KEY);
  await page.goto("/matter");

  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  const poster = ambient.locator(".matter-ambient__poster");
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await expect(poster).toHaveCSS("z-index", "37");
  await expect(poster).toHaveCSS("opacity", "0.32");

  await page.locator('[data-chrome-control="appearance"]').click();
  await expect(page.getByRole("region", { name: "Thought material" }))
    .toHaveAttribute("data-canvas-theme", "dark");
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
  await expect(poster).toHaveCSS("mix-blend-mode", "normal");
  await expect(poster).toHaveCSS("opacity", "0.24");
});

test("explicit network cost keeps the poster and never requests motion assets", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: {
        addEventListener() {},
        effectiveType: "4g",
        removeEventListener() {},
        saveData: true,
      },
    });
  });
  const motionRequests: string[] = [];
  page.on("request", (request) => {
    if (/shadows-loop\.(?:mp4|webm)$/.test(new URL(request.url()).pathname)) {
      motionRequests.push(request.url());
    }
  });
  await page.goto("/matter");
  await page.waitForTimeout(1_500);

  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await expect(ambient.locator(".matter-ambient__poster, .matter-ambient__video")).toHaveCount(1);
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
  expect(motionRequests).toEqual([]);
});

test("a rejected native play request returns to one static poster", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __matterAmbientPlayAttempts?: number }).__matterAmbientPlayAttempts = 0;
    HTMLMediaElement.prototype.play = function rejectAmbientPlay() {
      const target = window as Window & { __matterAmbientPlayAttempts?: number };
      target.__matterAmbientPlayAttempts = (target.__matterAmbientPlayAttempts ?? 0) + 1;
      return Promise.reject(new DOMException("blocked for proof", "NotAllowedError"));
    };
  });
  await page.goto("/matter");

  await expect.poll(() => page.evaluate(() => (
    window as Window & { __matterAmbientPlayAttempts?: number }
  ).__matterAmbientPlayAttempts ?? 0)).toBeGreaterThan(0);
  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await expect(ambient.locator(".matter-ambient__poster, .matter-ambient__video")).toHaveCount(1);
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
});

test("failed native motion sources return to one static poster", async ({ page }) => {
  const failedSources: string[] = [];
  await page.route("**/matter-ui/shadows-loop.*", async (route) => {
    failedSources.push(new URL(route.request().url()).pathname);
    await route.abort("failed");
  });
  await page.goto("/matter");

  await expect.poll(() => failedSources.length).toBeGreaterThan(0);
  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await expect(ambient.locator(".matter-ambient__poster, .matter-ambient__video")).toHaveCount(1);
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
});

test("forced colors removes ambient paint without covering material or controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/matter");

  const ambient = page.locator("[data-matter-ambient='leaf-shadows']");
  await expect(ambient).toHaveAttribute("data-presentation", "poster");
  await expect(ambient.locator(".matter-ambient__poster")).toHaveCSS("display", "none");
  await expect(ambient.locator(".matter-ambient__wash")).toHaveCSS("display", "none");
  await expect(page.locator("video.matter-ambient__video")).toHaveCount(0);
  await expect(page.locator('[data-thought-id="thought_fixture_root"] [data-thought-text-id]')).toBeVisible();
  const settings = page.locator('[data-chrome-control="settings"]');
  await expect(settings).toBeVisible();
  expect(await settings.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    )?.closest("[data-chrome-control]")?.getAttribute("data-chrome-control");
  })).toBe("settings");
});

test("mobile canvas menu stays inside the paper and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/matter");

  const paper = page.getByRole("region", { name: "Thought material" });
  const trigger = page.getByRole("button", { name: "打开 Matter 菜单" });
  const indexTrigger = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles });
  const mobileMedia = page.locator(
    "[data-matter-ambient='leaf-shadows'] .matter-ambient__poster, "
    + "[data-matter-ambient='leaf-shadows'] .matter-ambient__video",
  );
  await expect(mobileMedia).toHaveCount(1);
  await expect(mobileMedia).toHaveCSS("z-index", "3");
  await expect(page.getByRole("button", { name: "关于", exact: true })).toBeHidden();
  await expect(trigger).toBeVisible();
  await expect(indexTrigger).toBeVisible();

  const indexTriggerBox = await indexTrigger.boundingBox();
  const menuTriggerBox = await trigger.boundingBox();
  const indexIconBox = await indexTrigger.locator("svg").boundingBox();
  const menuIconBox = await trigger.locator("svg").boundingBox();
  if (indexTriggerBox === null || menuTriggerBox === null || indexIconBox === null || menuIconBox === null) {
    throw new Error("narrow instrument geometry is not visible");
  }
  expect(indexTriggerBox.width).toBeCloseTo(48, 1);
  expect(indexTriggerBox.height).toBeCloseTo(48, 1);
  expect(menuTriggerBox.width).toBeCloseTo(48, 1);
  expect(menuTriggerBox.height).toBeCloseTo(48, 1);
  expect(indexTriggerBox.x + indexTriggerBox.width)
    .toBeCloseTo(menuTriggerBox.x + menuTriggerBox.width, 1);
  expect(menuTriggerBox.y - indexTriggerBox.y - indexTriggerBox.height)
    .toBeGreaterThanOrEqual(9);
  expect(menuTriggerBox.y - indexTriggerBox.y - indexTriggerBox.height)
    .toBeLessThanOrEqual(11);
  expect(indexIconBox.width).toBeCloseTo(20, 1);
  expect(indexIconBox.height).toBeCloseTo(20, 1);
  expect(menuIconBox.width).toBeCloseTo(20, 1);
  expect(menuIconBox.height).toBeCloseTo(20, 1);
  const [indexPaint, menuPaint] = await Promise.all([
    readSvgPaintBounds(indexTrigger.locator("svg")),
    readSvgPaintBounds(trigger.locator("svg")),
  ]);
  expect(Math.abs(indexPaint.width - menuPaint.width)).toBeLessThanOrEqual(1);
  for (const [target, paint] of [[indexTriggerBox, indexPaint], [menuTriggerBox, menuPaint]] as const) {
    expect(Math.abs(target.x + target.width / 2 - paint.centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(target.y + target.height / 2 - paint.centerY)).toBeLessThanOrEqual(1);
  }
  const header = page.locator(".matter-header");
  const [headerBox, topPaperBox] = await Promise.all([header.boundingBox(), paper.boundingBox()]);
  if (headerBox === null || topPaperBox === null) throw new Error("compact top-band geometry is not visible");
  await expect(header).toHaveCSS("top", "25.5px");
  await expect(header).toHaveCSS("left", "18px");
  expect(headerBox.y).toBeCloseTo(25.5, 1);
  expect(headerBox.x).toBeCloseTo(18, 1);
  expect(headerBox.height).toBeCloseTo(15, 1);
  const topBandCenter = topPaperBox.y / 2;
  expect(headerBox.y + headerBox.height / 2).toBeCloseTo(topBandCenter, 1);
  expect(indexTriggerBox.y + indexTriggerBox.height / 2).toBeCloseTo(topBandCenter, 1);
  expect(indexPaint.centerY).toBeCloseTo(topBandCenter, 1);

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
  expect(await measureControlFloor(page, "[data-inquiry-control]", 48)).toEqual([]);
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

test("compact corner controls keep one tokenized geometry through the former 721px seam", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 844 });
  await page.goto("/matter");

  const indexTrigger = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles });
  const menuTrigger = page.getByRole("button", { name: "打开 Matter 菜单" });
  const header = page.locator(".matter-header");
  const [indexBox, menuBox, indexIcon, menuIcon, headerBox, paperBox] = await Promise.all([
    indexTrigger.boundingBox(),
    menuTrigger.boundingBox(),
    indexTrigger.locator("svg").boundingBox(),
    menuTrigger.locator("svg").boundingBox(),
    header.boundingBox(),
    page.locator(".matter-document").boundingBox(),
  ]);
  if (indexBox === null || menuBox === null || indexIcon === null || menuIcon === null || headerBox === null || paperBox === null) {
    throw new Error("compact control geometry is not visible at 740px");
  }
  for (const box of [indexBox, menuBox]) {
    expect(box.width).toBeCloseTo(48, 1);
    expect(box.height).toBeCloseTo(48, 1);
  }
  for (const box of [indexIcon, menuIcon]) {
    expect(box.width).toBeCloseTo(20, 1);
    expect(box.height).toBeCloseTo(20, 1);
  }
  const [indexPaint, menuPaint] = await Promise.all([
    readSvgPaintBounds(indexTrigger.locator("svg")),
    readSvgPaintBounds(menuTrigger.locator("svg")),
  ]);
  expect(Math.abs(indexPaint.width - menuPaint.width)).toBeLessThanOrEqual(1);
  for (const [target, paint] of [[indexBox, indexPaint], [menuBox, menuPaint]] as const) {
    expect(Math.abs(target.x + target.width / 2 - paint.centerX)).toBeLessThanOrEqual(1);
    expect(Math.abs(target.y + target.height / 2 - paint.centerY)).toBeLessThanOrEqual(1);
  }
  expect(indexBox.x + indexBox.width).toBeCloseTo(menuBox.x + menuBox.width, 1);
  await expect(header).toHaveCSS("top", "25.5px");
  await expect(header).toHaveCSS("left", "18px");
  expect(headerBox.y).toBeCloseTo(25.5, 1);
  expect(headerBox.x).toBeCloseTo(18, 1);
  expect(headerBox.height).toBeCloseTo(15, 1);
  const topBandCenter = paperBox.y / 2;
  expect(headerBox.y + headerBox.height / 2).toBeCloseTo(topBandCenter, 1);
  expect(indexBox.y + indexBox.height / 2).toBeCloseTo(topBandCenter, 1);
  expect(indexPaint.centerY).toBeCloseTo(topBandCenter, 1);
});

test("tablet index and settings controls share the 40px instrument scale", async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 844 });
  await page.goto("/matter");

  const mobileIndexTrigger = page.getByRole("button", {
    name: fixtureUiCopy.materialFiles.showMaterialFiles,
  });
  const [mobileIndexBox, mobileIndexIcon] = await Promise.all([
    mobileIndexTrigger.boundingBox(),
    mobileIndexTrigger.locator("svg").boundingBox(),
  ]);
  const mobileMenuIcon = await page.getByRole("button", { name: "打开 Matter 菜单" }).locator("svg").boundingBox();
  if (mobileIndexBox === null || mobileIndexIcon === null || mobileMenuIcon === null) {
    throw new Error("767px mobile glyph handoff is not visible");
  }
  expect(mobileIndexIcon.width).toBeCloseTo(20, 1);
  expect(mobileMenuIcon.width).toBeCloseTo(20, 1);
  const mobileHeader = page.locator(".matter-header");
  const [mobileHeaderBox, mobileIndexPaint, mobilePaperBox] = await Promise.all([
    mobileHeader.boundingBox(),
    readSvgPaintBounds(page.getByRole("button", {
      name: fixtureUiCopy.materialFiles.showMaterialFiles,
    }).locator("svg")),
    page.locator(".matter-document").boundingBox(),
  ]);
  if (mobileHeaderBox === null || mobilePaperBox === null) throw new Error("767px top-band geometry is not visible");
  await expect(mobileHeader).toHaveCSS("top", "25.5px");
  await expect(mobileHeader).toHaveCSS("left", "18px");
  expect(mobileHeaderBox.y).toBeCloseTo(25.5, 1);
  expect(mobileHeaderBox.x).toBeCloseTo(18, 1);
  expect(mobileHeaderBox.height).toBeCloseTo(15, 1);
  const mobileTopBandCenter = mobilePaperBox.y / 2;
  expect(mobileHeaderBox.y + mobileHeaderBox.height / 2).toBeCloseTo(mobileTopBandCenter, 1);
  expect(mobileIndexBox.y + mobileIndexBox.height / 2).toBeCloseTo(mobileTopBandCenter, 1);
  expect(mobileIndexPaint.centerY).toBeCloseTo(mobileTopBandCenter, 1);

  for (const width of [768, 834, 959]) {
    await page.setViewportSize({ width, height: 844 });
    const indexTrigger = page.getByRole("button", { name: fixtureUiCopy.materialFiles.showMaterialFiles });
    const settingsTrigger = page.locator('[data-chrome-control="settings"]');
    await expect(indexTrigger).toBeVisible();
    await expect(settingsTrigger).toBeVisible();
    const header = page.locator(".matter-header");
    const [indexBox, settingsBox, indexIcon, settingsIcon, headerBox] = await Promise.all([
      indexTrigger.boundingBox(),
      settingsTrigger.boundingBox(),
      indexTrigger.locator("svg").boundingBox(),
      settingsTrigger.locator("svg").boundingBox(),
      header.boundingBox(),
    ]);
    if (indexBox === null || settingsBox === null || indexIcon === null || settingsIcon === null || headerBox === null) {
      throw new Error(`tablet control geometry is not visible at ${width}px`);
    }
    for (const box of [indexBox, settingsBox]) {
      expect(box.width).toBeCloseTo(40, 1);
      expect(box.height).toBeCloseTo(40, 1);
    }
    for (const box of [indexIcon, settingsIcon]) {
      expect(box.width).toBeCloseTo(14, 1);
      expect(box.height).toBeCloseTo(14, 1);
    }
    if (width === 768) {
      expect(mobileIndexIcon.width - indexIcon.width).toBeCloseTo(6, 1);
      await expect(page.getByRole("button", { name: "打开 Matter 菜单" })).toBeHidden();
    }
    const [indexPaint, settingsPaint] = await Promise.all([
      readSvgPaintBounds(indexTrigger.locator("svg")),
      readSvgPaintBounds(settingsTrigger.locator("svg")),
    ]);
    expect(Math.abs(indexPaint.width - settingsPaint.width)).toBeLessThanOrEqual(1);
    for (const [target, paint] of [[indexBox, indexPaint], [settingsBox, settingsPaint]] as const) {
      expect(Math.abs(target.x + target.width / 2 - paint.centerX)).toBeLessThanOrEqual(1);
      expect(Math.abs(target.y + target.height / 2 - paint.centerY)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(indexBox.x + indexBox.width / 2 - (settingsBox.x + settingsBox.width / 2)))
      .toBeLessThanOrEqual(1);
    await expect(header).toHaveCSS("top", "27px");
    expect(headerBox.y).toBeCloseTo(27, 1);
    expect(headerBox.height).toBeCloseTo(15, 1);
    expect(Math.abs(indexPaint.centerY - (headerBox.y + headerBox.height / 2)))
      .toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 960, height: 844 });
  await expect(page.locator(".material-files-toggle")).toHaveCount(0);
});

function expectInset(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.1);
}

async function readSvgPaintBounds(svg: Locator) {
  return svg.evaluate((root) => {
    const shapes = Array.from(root.querySelectorAll<SVGGraphicsElement>(
      "path,rect,circle,ellipse,line,polyline,polygon",
    ));
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const shape of shapes) {
      const box = shape.getBBox();
      const matrix = shape.getScreenCTM();
      if (matrix === null) continue;
      const strokeOutset = (Number.parseFloat(getComputedStyle(shape).strokeWidth) || 0) / 2;
      for (const point of [
        new DOMPoint(box.x - strokeOutset, box.y - strokeOutset),
        new DOMPoint(box.x + box.width + strokeOutset, box.y - strokeOutset),
        new DOMPoint(box.x + box.width + strokeOutset, box.y + box.height + strokeOutset),
        new DOMPoint(box.x - strokeOutset, box.y + box.height + strokeOutset),
      ]) {
        const projected = point.matrixTransform(matrix);
        left = Math.min(left, projected.x);
        top = Math.min(top, projected.y);
        right = Math.max(right, projected.x);
        bottom = Math.max(bottom, projected.y);
      }
    }
    if (![left, top, right, bottom].every(Number.isFinite)) {
      throw new Error("SVG has no measurable painted shapes");
    }
    return {
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
      height: bottom - top,
      width: right - left,
    };
  });
}

async function readOpticalClearance(element: Locator) {
  return element.evaluate((target) => {
    const outer = getComputedStyle(target, "::before");
    const inner = getComputedStyle(target, "::after");
    return {
      outerBlur: outer.backdropFilter || outer.getPropertyValue("-webkit-backdrop-filter"),
      outerBackground: outer.backgroundColor,
      outerTop: outer.top,
      outerRight: outer.right,
      outerMask: outer.maskImage || outer.getPropertyValue("-webkit-mask-image"),
      innerBlur: inner.backdropFilter || inner.getPropertyValue("-webkit-backdrop-filter"),
      innerBackground: inner.backgroundColor,
      innerTop: inner.top,
      innerRight: inner.right,
      innerMask: inner.maskImage || inner.getPropertyValue("-webkit-mask-image"),
      outerPointerEvents: outer.pointerEvents,
      innerPointerEvents: inner.pointerEvents,
      outerZIndex: outer.zIndex,
      innerZIndex: inner.zIndex,
    };
  });
}

/** Reports every matched control that falls below its CSS pixel pointer floor. */
async function measureControlFloor(page: Page, selector: string, floor = 24) {
  const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }));
  if (boxes.length === 0) throw new Error(`no controls matched ${selector}`);
  return boxes.filter((box) => box.width < floor || box.height < floor);
}
