import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELASTIC_PREVIEW_METRICS, elasticPreviewGeometry } from "../interaction/elastic-preview";
import { materialAddressOutline } from "../interaction/material-address-outline";
import {
  materialAddressVariantBlockOutset,
  materialAddressVariantCornerRadius,
  materialAddressVariantOutline,
} from "./MaterialAddressLayer";
import type { MaterialAddressProjection } from "../interaction/projected-layout-receipt";

const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
const rooted = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");
const layer = readFileSync(new URL("./MaterialAddressLayer.tsx", import.meta.url), "utf8");

const ROWS = Object.freeze([
  Object.freeze({ blockEnd: 140, blockStart: 100, inlineEnd: 600, inlineStart: 300 }),
  Object.freeze({ blockEnd: 180, blockStart: 140, inlineEnd: 600, inlineStart: 100 }),
  Object.freeze({ blockEnd: 220, blockStart: 180, inlineEnd: 260, inlineStart: 100 }),
]);

function addressProjection(
  overrides: Partial<MaterialAddressProjection> = {},
): MaterialAddressProjection {
  return Object.freeze({
    attachmentProgress: 0,
    basis: Object.freeze({
      addressKey: "address", documentEpoch: 1, layoutEpoch: 1, nodeId: "node",
      partitionKey: "partition", treeId: "tree", viewportKey: "viewport",
    }),
    column: Object.freeze({ blockEnd: 400, blockStart: 100, inlineEnd: 600, inlineStart: 100 }),
    coordinateSpace: "client-css-px",
    direction: "neutral",
    metrics: Object.freeze({ blockOutset: 3, cornerRadius: 4, inlineOutset: 3 }),
    rows: ROWS,
    run: Object.freeze({ endInline: 260, endRow: 2, startInline: 300, startRow: 0 }),
    slot: null,
    textDirection: "ltr",
    writingMode: "horizontal-tb",
    ...overrides,
  }) as MaterialAddressProjection;
}

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
    expect(css).toMatch(/--address-density-native:\s*\.08/);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.matter-shell ::selection \{[^}]*background:\s*Highlight/);
  });

  it("leaves degree to displacement, not to an opacity ramp", () => {
    // A single numeric ramp cannot be correct for both themes, so no opacity
    // constant may live in the pure geometry module.
    expect(Object.keys(ELASTIC_PREVIEW_METRICS)).not.toContain("minimumOpacity");
    expect(Object.keys(ELASTIC_PREVIEW_METRICS)).not.toContain("maximumOpacity");
    expect(rooted).not.toContain("--elastic-opacity");
    // The single material-address outline owns the selected surface. A second
    // pocket painter would stack density and reopen a seam during projection.
    expect(css).not.toContain(".language-pocket");
    expect(rooted).not.toContain("--pocket-height");
  });

  it("never lets an arrival and a displacement own one property", () => {
    // The fallback once arrived with a scaleY squash on `transform`, which the
    // engaged rule also owns for displacement. Touching a grip inside the
    // arrival cancelled it and moved the mark by half the squash, so no
    // arrival may own a transform-family property.
    const arrival = css.match(/@keyframes lasso-settle \{([^]*?)\n\}/);
    expect(arrival).not.toBeNull();
    expect(arrival![1]).not.toMatch(/transform|scale:|rotate:|translate:/);
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

  it("paints one closed outline instead of per-row capsules", () => {
    const outline = materialAddressOutline(addressProjection())!;
    expect(outline).not.toBeNull();
    expect((outline.path.match(/M/g) ?? []).length).toBe(1);
    expect((outline.path.match(/Z/g) ?? []).length).toBe(1);
    expect(outline.path.length).toBeGreaterThan(0);
    // A precise multi-row range reads as one corridor: the first row runs to
    // the column's logical end rather than stopping at its last glyph.
    expect(outline.bands[0]!.right).toBe(603);
    expect(outline.bands[1]!.left).toBe(97);
  });

  it("keeps neutral, lower, and upper on one path and one colour", () => {
    const paths = [
      materialAddressOutline(addressProjection())!,
      materialAddressOutline(addressProjection({
        attachmentProgress: 1, direction: "selection-then-slot",
        slot: { blockEnd: 300, blockStart: 220 },
      }))!,
      materialAddressOutline(addressProjection({
        attachmentProgress: 1, direction: "slot-then-selection",
        slot: { blockEnd: 100, blockStart: 20 },
      }))!,
    ];
    for (const outline of paths) {
      expect((outline.path.match(/M/g) ?? []).length).toBe(1);
    }
    // One rule fills every variant, so a grip cannot change the address colour.
    const fill = css.match(/\.material-address-layer__path \{([^}]*)\}/);
    expect(fill).not.toBeNull();
    expect(fill![1]).toContain("rgba(var(--selection-control-rgb),var(--address-density");
    expect(css).toMatch(/--address-density-actionable:\s*\.18/);
    expect(css).toMatch(/--address-density-actionable:\s*\.1;/);
    expect(css).toMatch(/--address-density-structural:\s*\.08/);
    expect(css).toMatch(/--address-density-structural:\s*\.15/);
  });

  it("never releases an older paint before the outline is painted", () => {
    // Without the handshake a frame can show grips, or a pill's focus ring,
    // with no address at all.
    expect(css).toContain('[data-address-variant="actionable"][data-material-address-painted]) .material-address-selection-set--fallback');
    expect(css).toContain('[data-address-variant="structural"][data-material-address-painted]) .spatial-thought[data-selected="true"] .spatial-thought__label');
    expect(css).toContain('[data-address-variant="native"][data-material-address-painted]) ::selection');
    // The flag is only set once a path has actually been written.
    expect(layer).toContain('path.setAttribute("d", outline.path)');
    expect(layer).toMatch(/if \(path === null\) \{[^]*?delete layer\.dataset\.materialAddressPainted/);
    // React and the pointer hot path share one variant decision, and the hot
    // path recovers the variant from the mounted layer rather than a second
    // source of truth.
    expect(layer).toContain("materialAddressVariantOutline(projection, variant)");
    expect(layer).toContain("materialAddressVariantOutline(projection, readVariant(layer))");
  });

  it("keeps forced colors on the system contract and settle motion optional", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\[data-address-variant="actionable"\] \.material-address-layer__path,[^]*?\[data-address-variant="structural"\] \.material-address-layer__path \{[^}]*fill:\s*transparent;[^}]*stroke:\s*Highlight/);
    expect(forced).toMatch(/\[data-address-variant="native"\] \{ display: none/);
    expect(forced).toMatch(/::selection \{[^}]*background:\s*Highlight/);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.material-address-layer \{ transition: none/);
    // The settle may only move opacity, never geometry.
    const base = css.match(/\n\.material-address-layer \{([^}]*)\}/);
    expect(base![1]).toMatch(/transition: opacity 120ms/);
  });

  it("clips every fixed address painter to the paper boundary", () => {
    const base = css.match(/\.material-address-layer \{([^}]*)\}/);
    expect(base![1]).toContain("clip-path: inset(var(--shell-gutter)");
    const narrow = css.slice(css.indexOf("@media (max-width: 959px)"));
    expect(narrow).toMatch(/\.material-address-layer \{[^}]*clip-path:\s*inset\(var\(--narrow-paper-top\)/);
  });

  it("caches the hot path node and avoids redundant paint-state writes", () => {
    expect(layer).toContain("const pathByLayer = new WeakMap");
    expect(layer).toContain("pathForLayer(layer)");
    expect(layer).toContain('path.getAttribute("d") !== outline.path');
    expect(layer).toContain('layer.dataset.materialAddressPainted !== "true"');
  });

  it("takes the whole-node rounding from its own rows, not the precise radius", () => {
    const rowsOfHeight = (extent: number) => Object.freeze([0, 1, 2].map((index) =>
      Object.freeze({
        blockEnd: 100 + (index + 1) * extent,
        blockStart: 100 + index * extent,
        inlineEnd: index === 2 ? 260 : 600,
        inlineStart: index === 0 ? 300 : 100,
      })));
    const requested = (extent: number, cornerRadius: number) =>
      materialAddressVariantCornerRadius(
        addressProjection({
          metrics: { blockOutset: 3, cornerRadius, inlineOutset: 3, medianRowExtent: extent },
          rows: rowsOfHeight(extent),
        }),
        "structural",
      );

    // The precise receipt uses a fixed client-pixel corner. A multiple of that
    // cannot reproduce the pill's `.44em`; the structural variant has to keep
    // following the rows it actually measured.
    expect(requested(28, 3)).toBeCloseTo(28 * 0.44, 5);
    expect(requested(60, 3)).toBeCloseTo(60 * 0.44, 5);
    expect(requested(28, 12)).toBeCloseTo(28 * 0.44, 5);
    expect(requested(60, 12)).toBeCloseTo(60 * 0.44, 5);
    // Pinned receipt radius, different rows: structural must still differ.
    expect(requested(28, 12)).not.toBeCloseTo(requested(60, 12), 5);
    // And the same rows under different receipt radii must not move it.
    expect(requested(28, 3)).toBeCloseTo(requested(28, 12), 5);

    // A precise address keeps the receipt radius exactly.
    for (const variant of ["actionable", "native"] as const) {
      const projection = addressProjection({
        metrics: { blockOutset: 3, cornerRadius: 7, inlineOutset: 3, medianRowExtent: 20 },
      });
      expect(materialAddressVariantCornerRadius(projection, variant)).toBe(7);
    }

    // The emitted path uses the requested radius where the edges allow it.
    const outline = materialAddressVariantOutline(
      addressProjection({
        metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 3, medianRowExtent: 60 },
        rows: rowsOfHeight(60),
      }),
      "structural",
    )!;
    const emitted = [...outline.path.matchAll(/A([\d.]+) /g)].map((match) => Number(match[1]));
    expect(Math.max(...emitted)).toBeCloseTo(60 * 0.44, 1);

    // One decision serves React and the pointer hot path.
    expect((layer.match(/materialAddressVariantOutline\(/g) ?? []).length).toBe(3);
    expect(layer).not.toMatch(/\bmaterialAddressOutline\(projection\)/);
  });

  it("keeps precise air shared while whole-node identity retains its quiet old cap", () => {
    const projection = addressProjection({
      metrics: { blockOutset: 4.9, cornerRadius: 3, inlineOutset: 7.2, medianRowExtent: 20 },
    });
    expect(materialAddressVariantBlockOutset(projection, "actionable")).toBe(4.9);
    expect(materialAddressVariantBlockOutset(projection, "native")).toBe(4.9);
    expect(materialAddressVariantBlockOutset(projection, "structural")).toBe(1.6);
  });

  it("never proximity-snaps a precise range endpoint", () => {
    // A boundary endpoint used to snap outward to the column edge when it came
    // within a corner diameter of it. Centred rows are inset by the alignment,
    // not by a missing paper cell, so every variant now keeps its real edge.
    const nearEdge = addressProjection({
      metrics: { blockOutset: 2, cornerRadius: 4, inlineOutset: 8, medianRowExtent: 20 },
      rows: [
        { blockEnd: 140, blockStart: 100, inlineEnd: 600, inlineStart: 107 },
        { blockEnd: 180, blockStart: 140, inlineEnd: 520, inlineStart: 100 },
      ],
      run: { endInline: 520, endRow: 1, startInline: 107, startRow: 0 },
    });
    for (const variant of ["actionable", "native", "structural"] as const) {
      const outline = materialAddressVariantOutline(nearEdge, variant)!;
      expect(outline.bands[0]!.left).toBe(99);
    }
  });

  it("withholds Elastic controls and layout damage when its address cannot be painted", () => {
    const unsupported = addressProjection({
      metrics: { blockOutset: 3, cornerRadius: 4, inlineOutset: 3, medianRowExtent: 20 },
      rows: [
        { blockEnd: 121, blockStart: 100, inlineEnd: 560, inlineStart: 500 },
        { blockEnd: 140, blockStart: 120, inlineEnd: 200, inlineStart: 140 },
      ],
      run: { endInline: 200, endRow: 1, startInline: 500, startRow: 0 },
    });
    expect(materialAddressVariantOutline(unsupported, "actionable")).toBeNull();
    expect(materialAddressVariantOutline(unsupported, "native")).toBeNull();
    expect(materialAddressVariantOutline(unsupported, "structural")).not.toBeNull();
    expect(rooted).toContain("paintableElasticPreviewSource");
    expect(rooted).toContain("previewSource={paintableElasticPreviewSource}");
    expect(rooted).toMatch(/const addressPainted = publishMaterialAddressProjection\([^]*?if \(!addressPainted\)/);
    expect(rooted).toMatch(
      /if \(visibleSplitPreviewMode === "expand" && stretch\.dragging\) return;[^]*?if \(visibleSplitPreviewMode === "expand"\)/,
    );
  });

  it("keeps the whole-node ring and leaves precise addresses a pure fill", () => {
    expect(css).toMatch(
      /\[data-address-variant="structural"\] \.material-address-layer__path \{[^}]*stroke:\s*rgba\(var\(--selection-control-rgb\),var\(--address-ring-structural\)\)/,
    );
    expect(css).toMatch(/\[data-address-variant="structural"\] \.material-address-layer__path \{[^}]*stroke-width:\s*1px/);
    expect(css).toMatch(/\[data-address-variant="structural"\] \.material-address-layer__path \{[^}]*vector-effect:\s*non-scaling-stroke/);
    expect(css).toMatch(/--address-ring-structural:\s*\.13/);
    expect(css).toMatch(/--address-ring-structural:\s*\.16/);
    // Only the structural variant carries a ring.
    const base = css.match(/\n\.material-address-layer__path \{([^}]*)\}/);
    expect(base![1]).toContain("stroke: none");
  });

  it("lays the split partitions out in real flow", () => {
    // The upper grip used to move a shared inline source and cancel the shift
    // on the prefix, so the moving partition never rewrapped and a line was
    // painted across the gap. Nothing here may fake a position again.
    expect(css).not.toContain("language-split-source");
    expect(css).not.toContain("language-split-after-ghost");
    expect(css).not.toContain("--split-after-top");
    const slot = css.match(/\n\.language-split-slot \{([^}]*)\}/);
    expect(slot![1]).toContain("height: var(--split-depth)");
    expect(slot![1]).not.toContain("position: absolute");
    const after = css.match(/\.language-split-block--after \{([^}]*)\}/);
    expect(after).toBeNull();
    // The witness carries the canonical remainder invisibly, which is what
    // keeps the fixed partition's last line breaking and centring as it does
    // in the source.
    expect(css).toMatch(/\.language-split-witness-tail \{[^}]*visibility:\s*hidden/);
    expect(css).toMatch(/\.language-split-witness \{[^}]*height:\s*var\(--witness-block-size/);
    expect(rooted).toContain("language-split-address-copy");
    expect(rooted).toContain("projection.visibleOuterSeam");
    expect(rooted).toContain("projection.outerSeamTail");
    // The projected flow may be staged invisibly for measurement; only its
    // explicit layout mode is allowed to add the moving partition and slot.
    expect(css).toMatch(
      /:not\(\[data-layout-mode="expand"\]\) \.language-split-moving \{ display: none/,
    );
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
