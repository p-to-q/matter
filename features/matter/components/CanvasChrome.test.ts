import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_LANGUAGE_OPTIONS,
  DEFAULT_CANVAS_PREFERENCES,
  type CanvasLanguage,
} from "./canvas-preferences";
import {
  CANVAS_CHROME_INFO,
  CanvasChrome,
  isCanvasChromeInfoOverlay,
  nextMenuFocusIndex,
  projectInquiryDictationControl,
  type CanvasChromeProps,
} from "./CanvasChrome";
import { toolRailCopy } from "./tool-rail-copy";

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
    expect(markup).toMatch(/<p[^>]*aria-atomic="true"[^>]*aria-live="polite"[^>]*role="status"/);
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
    expect(CANVAS_CHROME_INFO["en-US"].about.body.join(" ")).toContain("Live voice input, transcript repair, and Ask Matter are available");
    expect(CANVAS_CHROME_INFO["en-US"].about.body.join(" ")).toContain("material transformation remains unavailable");
    expect(CANVAS_CHROME_INFO["zh-CN"].about.body.join(" ")).toContain("未完成想法获得形体的界面");
    expect(CANVAS_CHROME_INFO["zh-CN"].about.body.join(" ")).toContain("实时语音输入、语音整理和询问 Matter 已可使用");
    expect(CANVAS_CHROME_INFO["zh-CN"].about.body.join(" ")).toContain("材料生成变换尚未开放");
    expect(CANVAS_CHROME_INFO["zh-TW"].about.body.join(" ")).toContain("實時語音輸入、語音整理和詢問 Matter 已可使用");
    expect(CANVAS_CHROME_INFO["zh-TW"].about.body.join(" ")).toContain("材料生成變換尚未開放");
    expect(CANVAS_CHROME_INFO["ja-JP"].about.body.join(" ")).toContain("リアルタイム音声入力");
    expect(CANVAS_CHROME_INFO["ja-JP"].about.body.join(" ")).toContain("生成機能はまだ利用できません");
    expect(CANVAS_CHROME_INFO["de-DE"].about.body.join(" ")).toContain("Live-Spracheingabe, Transkriptreparatur und Matter fragen sind verfügbar");
    expect(CANVAS_CHROME_INFO["de-DE"].about.body.join(" ")).toContain("Materialtransformation bleibt deaktiviert");
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
    expect(css).toMatch(/\.topRight::before\s*{\s*inset:\s*-14px -18px;/s);
    expect(css).toMatch(/\.topRight::after\s*{\s*inset:\s*-7px -10px;/s);
    expect(css).toMatch(/\.bottomRight::before\s*{\s*inset:\s*-22px -28px;/s);
    expect(css).toMatch(/\.bottomRight::after\s*{\s*inset:\s*-11px -15px;/s);
    expect(css).toContain("backdrop-filter: var(--corner-optical-outer-filter)");
    expect(css).toContain("mask-image: var(--corner-optical-inner-mask)");
    expect(globalCss).toMatch(/--corner-optical-outer-filter:\s*blur\(\.8px\)/);
    expect(globalCss).toMatch(/--corner-optical-inner-filter:\s*blur\(3\.25px\)/);
    expect(globalCss).toMatch(/--corner-optical-outer-mask:[^;]*\.72\) 30%[^;]*\.24\) 70%[^;]*\.03\) 89%[^;]*\.008\) 94%[^;]*\.004\) 97%[^;]*transparent 100%/s);
    expect(globalCss).toMatch(/--corner-optical-inner-mask:[^;]*\.9\) 72%[^;]*\.72\) 77%[^;]*\.32\) 81%[^;]*\.02\) 91%[^;]*\.004\) 96%[^;]*transparent 100%/s);
    expect(globalCss).toMatch(/\.matter-guidance::before,\s*\.matter-guidance::after\s*{[^}]*z-index:\s*0/s);
    expect(globalCss).toMatch(/\.matter-guidance::before\s*{[^}]*inset:\s*-18px -22px;[^}]*--corner-optical-outer-mask/s);
    expect(globalCss).toMatch(/\.matter-guidance::after\s*{[^}]*inset:\s*-9px -12px;[^}]*--corner-optical-inner-mask/s);
    expect(globalCss).toMatch(/\.matter-guidance\s*{[^}]*pointer-events:\s*auto;[^}]*transition:\s*color/s);
    expect(globalCss).toMatch(/\.matter-guidance__next\s*{[^}]*animation:\s*matter-guidance-in/s);
    expect(globalCss).toMatch(/\.matter-guidance__next::before\s*{[^}]*inset:\s*0 -4px;[^}]*background:\s*transparent/s);
    expect(globalCss).toMatch(/\.matter-guidance:hover\s+\.matter-guidance__next::before[^}]*background:\s*var\(--chrome-hover-bg/s);
    expect(css).toMatch(/\.gearButton\s*{[^}]*width:\s*30px;[^}]*height:\s*30px;/s);
    expect(css).toMatch(/\.gearButton svg\s*{[^}]*width:\s*14px;[^}]*height:\s*14px;/s);
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toMatch(/\.mobileTrigger\s*{[^}]*width:\s*52px;[^}]*height:\s*56px;/s);
    expect(css).toContain("width: min(320px, 85%);");
    expect(css).toMatch(/\.inquiryAnchor\s*{[^}]*right:\s*0;[^}]*bottom:\s*30px;/s);
  });
});

describe("projectInquiryDictationControl", () => {
  const labels = Object.freeze({
    startLabel: "Dictate",
    stopLabel: "Stop dictating",
    cancelLabel: "Cancel dictation",
  });

  it("keeps the same control available to cancel long transcription", () => {
    expect(projectInquiryDictationControl({
      ...labels,
      listening: false,
      transcribing: true,
      supported: true,
    })).toEqual({
      action: "cancel",
      disabled: false,
      label: "Cancel dictation",
      pressed: true,
    });
  });

  it("keeps an unavailable idle control inert without disabling active ownership", () => {
    expect(projectInquiryDictationControl({
      ...labels,
      listening: false,
      transcribing: false,
      supported: null,
    })).toMatchObject({ action: "start", disabled: true, pressed: false });
    expect(projectInquiryDictationControl({
      ...labels,
      listening: true,
      transcribing: false,
      supported: null,
    })).toMatchObject({ action: "stop", disabled: false, pressed: true });
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

describe("canvas chrome info parity", () => {
  // The info overlay is the only place the product states its pre-release
  // legal posture. A locale that silently drops that sentence gives its
  // readers a weaker disclosure than an English reader, so parity is an
  // invariant here rather than a per-locale phrase assertion.
  const PRE_RELEASE_PRIVACY_DISCLOSURE: Readonly<Record<CanvasLanguage, string>> = {
    "en-US": "A published privacy policy is not available for this pre-release.",
    "zh-CN": "尚未发布正式隐私政策",
    "zh-TW": "正式隱私政策尚未發布",
    "ja-JP": "正式なプライバシーポリシーはまだありません",
    "de-DE": "Eine veröffentlichte Datenschutzerklärung gibt es noch nicht.",
  };
  const LOCAL_FALLBACK_ASSET_DISCLOSURE: Readonly<Record<CanvasLanguage, string>> = {
    "en-US": "tokenizer and WASM runtime assets may download separately",
    "zh-CN": "分词器和 WASM 运行时资源可能另行下载",
    "zh-TW": "分詞器和 WASM 執行期資源可能另行下載",
    "ja-JP": "トークナイザーと WASM ランタイムの資産は別途取得されることがあります",
    "de-DE": "Tokenizer- und WASM-Laufzeitressourcen können getrennt geladen werden",
  };

  it.each(CANVAS_LANGUAGE_OPTIONS.map((option) => option.value))(
    "%s discloses that no privacy policy is published yet",
    (locale) => {
      const body = CANVAS_CHROME_INFO[locale].privacy.body.join(" ");
      expect(body).toContain(PRE_RELEASE_PRIVACY_DISCLOSURE[locale]);
    },
  );

  it.each(CANVAS_LANGUAGE_OPTIONS.map((option) => option.value))(
    "%s gives a truthful local-speech fallback disclosure",
    (locale) => {
      const body = CANVAS_CHROME_INFO[locale].privacy.body.join(" ");
      // The fallback stays local only after browser-managed recognition is
      // unavailable; silence about its first-use model download would make the
      // privacy surface materially weaker than the actual voice contract.
      expect(body).toContain("Hugging Face");
      expect(body).toContain(LOCAL_FALLBACK_ASSET_DISCLOSURE[locale]);
      expect(CANVAS_CHROME_INFO[locale].privacy.body).toHaveLength(3);
    },
  );

  it.each(CANVAS_LANGUAGE_OPTIONS.map((option) => option.value))(
    "%s inquiry copy names the controls that locale's tool rail renders",
    (locale) => {
      const body = CANVAS_CHROME_INFO[locale].inquiry.body.join(" ");
      const rail = toolRailCopy(locale);
      // Naming a control the rail does not show sends the person hunting for
      // a button that is not there. Localizing the rail must localize this copy.
      expect(body).toContain(rail.lasso);
      expect(body).toContain(rail.branch);
      expect(body).toContain(rail.undo);
    },
  );

  it.each(["about", "inquiry", "pricing", "privacy", "terms"] as const)(
    "%s keeps the same paragraph count in every locale",
    (section) => {
      const expected = CANVAS_CHROME_INFO["en-US"][section].body.length;
      for (const { value } of CANVAS_LANGUAGE_OPTIONS) {
        expect(CANVAS_CHROME_INFO[value][section].body).toHaveLength(expected);
      }
    },
  );
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
