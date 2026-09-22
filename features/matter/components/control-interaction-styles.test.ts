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
    expect(css).toMatch(
      /\.tool-rail__button:hover:not\(:disabled\)::before,[\s\S]*?\.tool-rail__button:focus-visible::before\s*\{[^}]*background:\s*var\(--rail-hover\);/s,
    );
    expect(css).toMatch(
      /\.tool-rail__button:hover:not\(:disabled\)\s*\{[^}]*--tool-icon-rest-scale:\s*\.92;/s,
    );
    expect(css).toMatch(
      /\.tool-rail__button:active:not\(:disabled\)::before\s*\{[^}]*transform:\s*scale\(\.82\);/s,
    );
    expect(css).toMatch(
      /\.tool-rail__button:active:not\(:disabled\) svg\s*\{[^}]*transform:\s*scale\(\.8\);/s,
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

  it("collapses the spring transitions for reduced motion", () => {
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reducedMotion).toMatch(
      /\*, \*::before, \*::after\s*\{[^}]*transition-duration:\s*1ms !important;/s,
    );
  });
});
