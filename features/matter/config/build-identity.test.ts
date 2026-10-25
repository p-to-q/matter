import { describe, expect, it } from "vitest";
import { parseMatterBuildId, resolveMatterBuildId } from "./build-identity";

describe("Matter artifact identity", () => {
  it("uses only an explicit or platform artifact token, with no inferred fallback", () => {
    expect(resolveMatterBuildId(undefined, undefined)).toBeNull();
    expect(resolveMatterBuildId(undefined, "dpl_platform-42")).toBe("dpl_platform-42");
    expect(resolveMatterBuildId("owner_artifact", "dpl_platform")).toBe("owner_artifact");
    expect(resolveMatterBuildId("a".repeat(128), undefined)).toHaveLength(128);
  });

  it.each(["", " ", "a".repeat(129), "https://example.test", "other.version", "构建", "a\nb", "a/b"])(
    "refuses invalid configured identity rather than falling through: %j", (value) => {
      expect(parseMatterBuildId(value)).toBeNull();
      expect(() => resolveMatterBuildId(value, "valid_platform")).toThrow("build identity");
      expect(() => resolveMatterBuildId(undefined, value)).toThrow("build identity");
    },
  );

  it("does not coerce a health value into an identity", () => {
    for (const value of [null, undefined, 1, [], {}, true]) expect(parseMatterBuildId(value)).toBeNull();
  });
});
