import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./use-native-material-selection.ts", import.meta.url),
  "utf8",
);

describe("native material selection observer", () => {
  it("coalesces selection changes and fails open outside one material range", () => {
    expect(source).toContain('document.addEventListener("selectionchange", schedule)');
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("selection.rangeCount !== 1");
    expect(source).toContain("startRoot !== endRoot");
    expect(source).toContain("setReceipt(null)");
  });

  it("limits the custom corridor while leaving the browser Selection intact", () => {
    expect(source).toContain("MATERIAL_ADDRESS_NATIVE_ROW_LIMIT");
    expect(source).not.toContain("removeAllRanges");
    expect(source).not.toContain("selection.empty");
  });
});
