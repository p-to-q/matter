import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./use-structural-material-selection.ts", import.meta.url),
  "utf8",
);

describe("structural material selection measurement", () => {
  it("projects the selected label without putting browser geometry in navigation", () => {
    expect(source).toContain('querySelector<HTMLElement>(".spatial-thought__label")');
    expect(source).toContain("range.selectNodeContents(label)");
    expect(source).toContain('partitionKey: "structural-selection"');
    expect(source).not.toContain("navigation.");
  });

  it("fails closed when the selected material is no longer rendered", () => {
    expect(source).toContain("root === null || label === null");
    expect(source).toContain("setReceipt(null)");
  });

  it("measures after paint ownership changes and gates stale identities", () => {
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("structuralReceiptMatchesInput(receipt, input)");
    expect(source).toContain('basis.partitionKey === "structural-selection"');
  });

  it("remeasures after the material plane or camera finishes moving", () => {
    expect(source).toContain('addEventListener("transitionend", finishPositioningTransition)');
    expect(source).toContain('addEventListener("transitioncancel", finishPositioningTransition)');
    expect(source).toContain('target.classList.contains("matter-world")');
  });
});
