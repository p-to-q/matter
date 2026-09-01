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
});
