import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./use-native-material-selection.ts", import.meta.url),
  "utf8",
);

describe("native material selection observer", () => {
  it("coalesces selection changes and fails open outside one material range", () => {
    expect(source).toContain('document.addEventListener("selectionchange", invalidateAndSchedule)');
    expect(source).toMatch(/const invalidateAndSchedule = \(\) => \{[^]*?flushSync\(\(\) => setPresentation\(currentPresence\(\)\)\);[^]*?schedule\(\)/);
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("selection.rangeCount !== 1");
    expect(source).toContain("startRoot !== endRoot");
    expect(source).toContain("setPresentation(BROWSER_NATIVE_SELECTION)");
  });

  it("limits the custom corridor while leaving the browser Selection intact", () => {
    expect(source).toContain("MATERIAL_ADDRESS_NATIVE_ROW_LIMIT");
    expect(source).not.toContain("removeAllRanges");
    expect(source).not.toContain("selection.empty");
  });

  it("never returns a receipt from an older layout identity", () => {
    expect(source).toContain("nativeReceiptMatchesInput(presentation.receipt, input)");
    expect(source).toContain("basis.documentEpoch === input.documentEpoch");
    expect(source).toContain("basis.viewportKey === input.viewportKey");
  });

  it("remeasures when a disclosure or camera transform settles", () => {
    expect(source).toContain('addEventListener("transitionend", finishPositioningTransition)');
    expect(source).toContain('addEventListener("transitioncancel", finishPositioningTransition)');
    expect(source).toContain('target.classList.contains("matter-world")');
  });
});
