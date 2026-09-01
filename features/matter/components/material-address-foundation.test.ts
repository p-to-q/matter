import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rooted = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");
const layer = readFileSync(new URL("./MaterialAddressLayer.tsx", import.meta.url), "utf8");

describe("material address foundation", () => {
  it("keeps layout reads outside the pointer preview publisher", () => {
    const previewStart = rooted.indexOf("const updateElasticPreview = useCallback");
    const previewEnd = rooted.indexOf("const renderedElasticPreviewSource", previewStart);
    const publisher = rooted.slice(previewStart, previewEnd);
    expect(previewStart).toBeGreaterThan(-1);
    expect(previewEnd).toBeGreaterThan(previewStart);
    expect(publisher).not.toContain("getBoundingClientRect");
    expect(publisher).not.toContain("offsetHeight");
    expect(publisher).toContain("publishMaterialAddressProjection");
  });

  it("keeps the old paint as fallback until the new path reports painted", () => {
    expect(rooted).toContain("material-address-selection-set--fallback");
    expect(layer).toContain('className="material-address-layer__path"');
  });

  it("does not expose selected material text through presentation keys", () => {
    expect(rooted).not.toContain("selectedText}`");
    expect(rooted).not.toContain("selectedText}:`");
  });
});
