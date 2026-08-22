import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CANVAS_PREFERENCES } from "./canvas-preferences";
import {
  CANVAS_CHROME_INFO,
  CanvasChrome,
  isCanvasChromeInfoOverlay,
  nextMenuFocusIndex,
  type CanvasChromeProps,
} from "./CanvasChrome";

describe("CanvasChrome", () => {
  it("renders the desktop corner system and one mobile menu trigger", () => {
    const markup = renderChrome();

    expect(markup).toContain('data-language="zh-CN"');
    expect(markup).toContain('data-chrome-region="desktop"');
    expect(markup).toContain('data-chrome-region="top"');
    expect(markup).toContain('data-chrome-region="bottom"');
    expect(markup).toContain('data-chrome-control="about"');
    expect(markup).toContain('data-chrome-control="settings"');
    expect(markup).toContain('data-chrome-control="inquiry"');
    expect(markup).toContain('data-chrome-control="language"');
    expect(markup).toContain('data-chrome-control="fx"');
    expect(markup).toContain('data-chrome-control="appearance"');
    expect(markup.match(/data-chrome-control="menu"/g)).toHaveLength(1);
  });

  it("keeps settings and preferences semantic", () => {
    const markup = renderChrome();

    expect(markup).toContain('role="menu"');
    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain('role="menuitemradio"');
    expect(markup).toContain("定价");
    expect(markup).toContain("隐私政策");
    expect(markup).toContain("服务条款");
    expect(markup).toContain("询问 Matter");
  });

  it("exposes one closed inquiry field without a persistent chat surface", () => {
    const markup = renderChrome();

    expect(markup.match(/<textarea\b/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<(?:input|form)\b/);
    expect(markup).toContain('id="matter-inquiry"');
    expect(markup).toContain('data-inquiry-phase="idle"');
    expect(markup).toMatch(/id="matter-inquiry"[^>]*hidden|hidden[^>]*id="matter-inquiry"/);
    expect(markup).toContain('aria-controls="matter-inquiry"');
    expect(markup).not.toContain("data-inquiry-thread");
    expect(markup).not.toMatch(/chat|assistant|history/i);
  });

  it("hides the inquiry in CSS even though the component owns display", () => {
    const css = readFileSync(new URL("./CanvasChrome.module.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.inquiry\[hidden\]\s*\{[^}]*display:\s*none/);
  });

  it("keeps the inquiry waiting mark compact and cyclic", () => {
    const css = readFileSync(new URL("./CanvasChrome.module.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.inquiryLoading\s*\{[^}]*width:\s*3ch;/s);
    expect(css).toContain("inquiryLoadingFirst 180ms");
    expect(css).toContain("inquiryLoadingCycle 760ms");
    expect(css).toMatch(/@keyframes inquiryLoadingFirst\s*\{\s*from, to\s*\{[^}]*2ch/s);
    expect(css).toContain("0%, 49% { clip-path: inset(0 1ch 0 0); }");
    expect(css).toContain("50%, 100% { clip-path: inset(0 0 0 0); }");
  });

  it("keeps pre-release information honest and task-oriented", () => {
    expect(CANVAS_CHROME_INFO["en-US"].about.body.join(" ")).toContain("interface for unfinished thought");
    expect(CANVAS_CHROME_INFO["en-US"].about.body.join(" ")).toContain("Live voice input is available");
    expect(CANVAS_CHROME_INFO["en-US"].about.body.join(" ")).toContain("separately gated");
    expect(CANVAS_CHROME_INFO["zh-CN"].about.body.join(" ")).toContain("未完成想法获得形体的界面");
    expect(CANVAS_CHROME_INFO["zh-CN"].about.body.join(" ")).toContain("实时语音输入已可使用");
    expect(CANVAS_CHROME_INFO["zh-CN"].about.body.join(" ")).toContain("仍需单独开启");
    expect(CANVAS_CHROME_INFO["zh-TW"].about.body.join(" ")).toContain("實時語音輸入已可使用");
    expect(CANVAS_CHROME_INFO["ja-JP"].about.body.join(" ")).toContain("リアルタイム音声入力");
    expect(CANVAS_CHROME_INFO["de-DE"].about.body.join(" ")).toContain("Live-Spracheingabe ist verfügbar");
    expect(CANVAS_CHROME_INFO["en-US"].pricing.body.join(" ")).toContain("no paid plan");
    expect(CANVAS_CHROME_INFO["en-US"].privacy.body.join(" ")).toContain("bounded lassoed language");
    expect(CANVAS_CHROME_INFO["en-US"].privacy.body.join(" ")).toContain("held-aside material is not sent");
    expect(CANVAS_CHROME_INFO["en-US"].terms.body.join(" ")).toContain("pre-release software");
    expect(CANVAS_CHROME_INFO["en-US"].inquiry.body.join(" ")).toContain("Asking never changes it");
    expect(CANVAS_CHROME_INFO["zh-CN"].inquiry.body.join(" ")).toContain("询问不会改变它");
    expect(CANVAS_CHROME_INFO["zh-CN"].privacy.body.join(" ")).toContain("受限长度");
    expect(CANVAS_CHROME_INFO["zh-CN"].privacy.body.join(" ")).toContain("暂不纳入的材料不会发送");
    expect(CANVAS_CHROME_INFO["zh-TW"].privacy.body.join(" ")).toContain("受限長度");
    expect(CANVAS_CHROME_INFO["zh-TW"].privacy.body.join(" ")).toContain("暫不納入的材料不會傳送");
    expect(CANVAS_CHROME_INFO["ja-JP"].privacy.body.join(" ")).toContain("上限内");
    expect(CANVAS_CHROME_INFO["ja-JP"].privacy.body.join(" ")).toContain("除外した素材は送りません");
    expect(CANVAS_CHROME_INFO["de-DE"].privacy.body.join(" ")).toContain("begrenztes, mit Lasso markiertes Sprachmaterial");
    expect(CANVAS_CHROME_INFO["de-DE"].privacy.body.join(" ")).toContain("zurückgestelltes Material wird nicht gesendet");
  });

  it("pins the desktop corners, accessible gear target, and 767px mobile handoff", () => {
    const css = readFileSync(
      new URL("./CanvasChrome.module.css", import.meta.url),
      "utf8",
    );
    const globalCss = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.topRight\s*{[^}]*top:\s*24px;[^}]*right:\s*24px;/s);
    expect(css).toMatch(/\.bottomRight\s*{[^}]*right:\s*24px;[^}]*bottom:\s*24px;/s);
    expect(css).toMatch(/\.topRight::before\s*{\s*inset:\s*-24px -30px;/s);
    expect(css).toMatch(/\.topRight::after\s*{\s*inset:\s*-13px -17px;/s);
    expect(css).toMatch(/\.bottomRight::before\s*{\s*inset:\s*-22px -28px;/s);
    expect(css).toMatch(/\.bottomRight::after\s*{\s*inset:\s*-11px -15px;/s);
    expect(css).toContain("backdrop-filter: var(--corner-optical-outer-filter)");
    expect(css).toContain("mask-image: var(--corner-optical-inner-mask)");
    expect(globalCss).toMatch(/--corner-optical-outer-filter:\s*blur\(\.8px\)/);
    expect(globalCss).toMatch(/--corner-optical-inner-filter:\s*blur\(3\.25px\)/);
    expect(globalCss).toMatch(/--corner-optical-outer-mask:[^;]*\.72\) 30%[^;]*\.24\) 70%[^;]*\.03\) 89%[^;]*\.008\) 94%[^;]*\.004\) 97%[^;]*transparent 100%/s);
    expect(globalCss).toMatch(/--corner-optical-inner-mask:[^;]*\.9\) 72%[^;]*\.72\) 77%[^;]*\.32\) 81%[^;]*\.02\) 91%[^;]*\.004\) 96%[^;]*transparent 100%/s);
    expect(globalCss).toMatch(/\.matter-guidance::before\s*{[^}]*inset:\s*-24px -32px;[^}]*--corner-optical-outer-mask/s);
    expect(globalCss).toMatch(/\.matter-guidance::after\s*{[^}]*inset:\s*-12px -18px;[^}]*--corner-optical-inner-mask/s);
    expect(css).toMatch(/\.gearButton\s*{[^}]*width:\s*30px;[^}]*height:\s*30px;/s);
    expect(css).toMatch(/\.gearButton svg\s*{[^}]*width:\s*14px;[^}]*height:\s*14px;/s);
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toMatch(/\.mobileTrigger\s*{[^}]*width:\s*52px;[^}]*height:\s*56px;/s);
    expect(css).toContain("width: min(320px, 85%);");
    expect(css).toMatch(/\.inquiryAnchor\s*{[^}]*right:\s*0;[^}]*bottom:\s*30px;/s);
  });
});

describe("isCanvasChromeInfoOverlay", () => {
  it.each(["about", "pricing", "privacy", "terms"] as const)(
    "accepts the %s information surface across localized copy maps",
    (overlay) => expect(isCanvasChromeInfoOverlay(overlay)).toBe(true),
  );

  it.each([null, "settings", "language", "inquiry", "mobile"] as const)(
    "rejects the %s non-information surface",
    (overlay) => expect(isCanvasChromeInfoOverlay(overlay)).toBe(false),
  );
});

describe("nextMenuFocusIndex", () => {
  it.each([
    ["ArrowDown", -1, 3, 0],
    ["ArrowDown", 2, 3, 0],
    ["ArrowUp", -1, 3, 2],
    ["ArrowUp", 0, 3, 2],
    ["Home", 2, 3, 0],
    ["End", 0, 3, 2],
    ["Tab", 0, 3, null],
    ["ArrowDown", 0, 0, null],
  ])("maps %s from %i across %i items", (key, current, count, expected) => {
    expect(nextMenuFocusIndex(key, current, count)).toBe(expected);
  });
});

function renderChrome(overrides: Partial<CanvasChromeProps> = {}): string {
  const props: CanvasChromeProps = {
    preferences: DEFAULT_CANVAS_PREFERENCES,
    resolvedAppearance: "light",
    setAppearance: vi.fn(),
    setLanguage: vi.fn(),
    setLeafFx: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(createElement(CanvasChrome, props));
}
