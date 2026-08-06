import { describe, expect, it } from "vitest";
import { normalizeMatterInitialDocument } from "./initial-document";

describe("Matter initial document configuration", () => {
  it("accepts the explicit root-only public preview", () => {
    expect(normalizeMatterInitialDocument("root")).toBe("root");
  });

  it.each([undefined, "", "expanded", "ROOT", "unknown"])(
    "keeps the expanded local fixture for %j",
    (value) => {
      expect(normalizeMatterInitialDocument(value)).toBe("expanded");
    },
  );
});
