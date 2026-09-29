import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

describe("canvas control interaction styles", () => {
  it("keeps search focus to the caret without drawing a box or underline", () => {
    expect(css).toMatch(
      /\.material-files__search:has\(input:focus-visible\)\s*\{[^}]*box-shadow:\s*none;/s,
    );
    expect(css).toMatch(
      /\.material-files__search input:focus-visible\s*\{[^}]*outline:\s*0;/s,
    );
    expect(css).not.toMatch(/\.material-files__search:has\(input:focus-visible\)\s*\{[^}]*border-bottom:/s);

    const forcedColors = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forcedColors).toMatch(
      /\.material-files__search:has\(input:focus-visible\)\s*\{[^}]*outline:\s*2px solid Highlight;[^}]*outline-offset:\s*2px;[^}]*box-shadow:\s*none;/s,
    );
  });

  it("keeps one chip geometry while separating hover from a compressed press", () => {
    expect(css).toMatch(
      /\.tool-rail__button::before\s*\{[^}]*inset:\s*0 14px;[^}]*border-radius:\s*13px;[^}]*transform:\s*scale\(1\);/s,
    );
    // Hover lives only where a pointer can hover; focus and press stay
    // ungated. An unavailable tool is aria-disabled so it keeps focus.
    expect(css).toMatch(
      /@media \(hover: hover\) \{ \.tool-rail__button:hover:not\(\[aria-disabled="true"\]\)::before \{[^}]*background:\s*var\(--rail-hover\);/s,
    );
    expect(css).toMatch(
      /\n\.tool-rail__button:focus-visible::before\s*\{[^}]*background:\s*var\(--rail-hover\);/s,
    );
    expect(css).toMatch(
      /@media \(hover: hover\) \{ \.tool-rail__button:hover:not\(\[aria-disabled="true"\]\) \{[^}]*--tool-icon-rest-scale:\s*\.92;/s,
    );
    expect(css).toMatch(
      /\n\.tool-rail__button:active:not\(\[aria-disabled="true"\]\)::before\s*\{[^}]*transform:\s*scale\(\.82\);/s,
    );
    expect(css).toMatch(
      /\n\.tool-rail__button:active:not\(\[aria-disabled="true"\]\) svg\s*\{[^}]*transform:\s*scale\(\.8\);/s,
    );
    expect(css).toMatch(
      /\.tool-rail__button\s*\{[^}]*width:\s*72px;[^}]*height:\s*44px;/s,
    );
    expect(css).toMatch(
      /@media \(pointer: coarse\)[\s\S]*?\.tool-rail__button::before,[\s\S]*?\.tool-rail__button\[data-tool-emphasis="primary"\]::before\s*\{[^}]*inset-block:\s*2px;/s,
    );
  });

  it("lets only the icon overshoot after a completed activation", () => {
    expect(css).toMatch(
      /\.tool-rail__button::before\s*\{[^}]*transform 220ms cubic-bezier\(\.2,\.8,\.2,1\);/s,
    );
    expect(css).toMatch(
      /\.tool-rail__button\[data-click-motion="a"\] svg\s*\{[^}]*animation:\s*tool-rail-icon-release-a 480ms;/s,
    );
    expect(css).not.toMatch(/tool-rail-icon-release-[ab] 480ms both/);
    expect(css).toMatch(
      /@keyframes tool-rail-icon-release-a[\s\S]*?44%\s*\{\s*transform:\s*scale\(1\.08\);/s,
    );
  });

  it("lets a guidance line with a release wrap instead of clipping it", () => {
    expect(css).toMatch(
      /\.matter-guidance\[data-guidance-action\] \.matter-guidance__next\s*\{[^}]*white-space:\s*normal;/s,
    );
    expect(css).toMatch(/\.matter-guidance__action\s*\{[^}]*white-space:\s*nowrap;/s);
  });

  it("collapses the spring transitions for reduced motion", () => {
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reducedMotion).toMatch(
      /\*, \*::before, \*::after\s*\{[^}]*transition-duration:\s*1ms !important;/s,
    );
  });

  it("keeps focus and selection visible when the system forces colors", () => {
    const forcedColors = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forcedColors).toMatch(/\.node-action-lens__button:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight;/s);
    expect(forcedColors).toMatch(
      /\.tool-rail__button\[data-tool-emphasis="primary"\]::before\s*\{[^}]*outline:\s*2px solid Highlight;/s,
    );
    expect(forcedColors).toMatch(/\.stretch-handle::after\s*\{[^}]*forced-color-adjust:\s*none;[^}]*background:\s*ButtonText;/s);
    const chrome = readFileSync(new URL("./CanvasChrome.module.css", import.meta.url), "utf8");
    const chromeForced = chrome.slice(chrome.indexOf("@media (forced-colors: active)"));
    expect(chromeForced).toMatch(
      /\.settingsMenu button:focus-visible,\s*\.languageMenu button:focus-visible,\s*\.segmentedControl button\[aria-pressed="true"\]\s*\{[^}]*outline:\s*2px solid Highlight;/s,
    );
  });

  it("gates every hover affordance to devices that can hover", () => {
    // A tap on a touch screen leaves :hover stuck until the next tap elsewhere.
    for (const url of [
      "../../../app/globals.css",
      "./CanvasChrome.module.css",
      "./WikiSettingsSection.module.css",
    ]) {
      const source = readFileSync(new URL(url, import.meta.url), "utf8");
      const ungated = stripHoverMedia(source).match(/[^{}]*:hover[^{}]*\{/gu) ?? [];
      expect(ungated, url).toEqual([]);
    }
  });
});

/** Removes every `@media (hover: hover) { ... }` block, however it is nested. */
function stripHoverMedia(source: string): string {
  let result = "";
  let index = 0;
  const marker = "@media (hover: hover)";
  while (index < source.length) {
    const start = source.indexOf(marker, index);
    if (start === -1) {
      result += source.slice(index);
      break;
    }
    result += source.slice(index, start);
    let depth = 0;
    let cursor = source.indexOf("{", start);
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
  return result;
}
