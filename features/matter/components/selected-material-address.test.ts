import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELASTIC_PREVIEW_METRICS, elasticPreviewGeometry } from "../interaction/elastic-preview";

const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
const rooted = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");

/** Every rule body that targets the fragment while Elastic owns the degree. */
function engagedFragmentRules(): readonly string[] {
  const bodies: string[] = [];
  const pattern = /\.lasso-layer[^{}]*\.lasso-selection-fragment[^{}]*\{([^}]*)\}/g;
  for (const match of css.matchAll(pattern)) bodies.push(match[1]);
  return bodies;
}

describe("selected material address", () => {
  it("keeps the reference painted through press, expand, and pending", () => {
    const bodies = engagedFragmentRules();
    // Both the projection-active and expand selectors must exist, and neither
    // may blank the address: degree zero and pending still show the source.
    expect(css).toContain('.lasso-layer[data-selection-projection="true"] .lasso-selection-fragment');
    expect(css).toContain('.lasso-layer:has(.elastic-preview[data-preview-mode="expand"]) .lasso-selection-fragment');
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toMatch(/opacity:\s*0\s*(;|$)/);
  });

  it("gives the reference the upper grip's displacement and nothing else", () => {
    const bodies = engagedFragmentRules();
    expect(bodies.some((body) => body.includes("translateY(var(--address-displacement-y"))).toBe(true);
    // Only the upper grip moves the selected language, so only it displaces
    // the address; the lower grip leaves the reference where it was measured.
    expect(rooted).toContain('`${handle === "top" ? travelDepth : 0}px`');
  });

  it("anchors both grips to their own visual line on first paint and on drag", () => {
    // One occurrence in the render pass, one in the pointer hot path. A whole
    // column centre in either place makes a stepped selection's grips jump.
    const perLine = rooted.match(/\(preview\.topHandle\.x1 \+ preview\.topHandle\.x2\) \/ 2/g);
    expect(perLine).toHaveLength(2);
    expect(rooted).not.toContain("centerX");
    expect(rooted).not.toMatch(/elastic-(top|bottom)-center[^\n]*bounds\.right/);
  });

  it("proves a stepped selection never collapses to one shared centre", () => {
    const stepped = [
      { x: 100, y: 200, width: 120, height: 20 },
      { x: 100, y: 224, width: 48, height: 20 },
    ];
    const preview = elasticPreviewGeometry(stepped, 0)!;
    const top = (preview.topHandle.x1 + preview.topHandle.x2) / 2;
    const bottom = (preview.bottomHandle.x1 + preview.bottomHandle.x2) / 2;
    const column = (preview.sourceBounds.left + preview.sourceBounds.right) / 2;
    expect(top).not.toBe(bottom);
    expect(bottom).not.toBe(column);
  });

  it("keeps a forced-colors reference during expand and pending", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(
      /\.lasso-layer\[data-selection-projection="true"\] \.lasso-selection-fragment,\s*\.lasso-layer:has\(\.elastic-preview\[data-preview-mode="expand"\]\) \.lasso-selection-fragment \{[^}]*border:\s*1px solid Highlight[^}]*opacity:\s*1/,
    );
  });

  it("paints native selection in the neutral ink family", () => {
    expect(css).toMatch(
      /\.matter-shell ::selection \{[^}]*background:\s*rgba\(var\(--selection-control-rgb\),var\(--address-density-native\)\)/,
    );
    expect(css).toMatch(/--address-density-native:\s*\.12/);
    expect(css).toMatch(/--address-density-native:\s*\.16/);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.matter-shell ::selection \{[^}]*background:\s*Highlight/);
  });

  it("leaves degree to displacement, not to an opacity ramp", () => {
    // A single numeric ramp cannot be correct for both themes, so no opacity
    // constant may live in the pure geometry module.
    expect(Object.keys(ELASTIC_PREVIEW_METRICS)).not.toContain("minimumOpacity");
    expect(Object.keys(ELASTIC_PREVIEW_METRICS)).not.toContain("maximumOpacity");
    expect(rooted).not.toContain("--elastic-opacity");
    // The pocket keeps its own constant density.
    expect(css).toMatch(/\.language-pocket \{[^}]*rgba\(var\(--selection-control-rgb\),\.035\)/);
  });

  it("never lets an arrival and a displacement own one property", () => {
    // The mark used to arrive with a scaleY squash on `transform`, which the
    // engaged rule also owned. Touching a grip within the arrival cancelled it
    // and snapped the impression by half the squash. A persistent address does
    // not perform an entrance, so it carries no animation at all.
    const base = css.match(/\n\.lasso-selection-fragment \{([^}]*)\}/);
    expect(base).not.toBeNull();
    expect(base![1]).not.toContain("animation");
    expect(css).not.toContain("lasso-settle");
    // Displacement is the sole owner of the fragment's transform family.
    for (const body of engagedFragmentRules()) {
      expect(body).not.toMatch(/animation-name|scale:|rotate:/);
    }
  });

  it("keeps one actionable address painter while a projection is engaged", () => {
    // The projected duplicate sits exactly under the reference during expand.
    // If it carried its own selection skin the two densities would stack, so
    // the duplicate holds ink only and the fragment owns the address.
    expect(css).not.toMatch(/\.language-split-selected-copy \{[^}]*background:\s*rgba/);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).not.toContain(".language-split-selected-copy");
  });

  it("writes no presentation custom property that no rule reads", () => {
    const written = new Set(
      Array.from(rooted.matchAll(/setProperty\(\s*"(--[a-z-]+)"/g), (match) => match[1]),
    );
    expect(written.size).toBeGreaterThan(8);
    const dead = Array.from(written).filter((name) => !css.includes(`var(${name}`));
    expect(dead).toEqual([]);
  });
});
