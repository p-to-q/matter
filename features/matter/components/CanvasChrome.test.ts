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
    expect(CANVAS_CHROME_INFO["en-US"].privacy.body.join(" ")).toContain("visible root-to-focus lineage");
    expect(CANVAS_CHROME_INFO["en-US"].terms.body.join(" ")).toContain("pre-release software");
    expect(CANVAS_CHROME_INFO["en-US"].inquiry.body.join(" ")).toContain("Asking never changes it");
    expect(CANVAS_CHROME_INFO["zh-CN"].inquiry.body.join(" ")).toContain("询问不会改变它");
    expect(CANVAS_CHROME_INFO["zh-CN"].privacy.body.join(" ")).toContain("根节点至焦点路径");
  });

  it("pins the desktop corners, accessible gear target, and 767px mobile handoff", () => {
    const css = readFileSync(
      new URL("./CanvasChrome.module.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(/\.topRight\s*{[^}]*top:\s*24px;[^}]*right:\s*24px;/s);
    expect(css).toMatch(/\.bottomRight\s*{[^}]*right:\s*24px;[^}]*bottom:\s*24px;/s);
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
