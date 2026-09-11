import { describe, expect, it } from "vitest";
import { fontLoadAffectsMaterialGeometry } from "./lasso-font-ownership";

describe("lasso font ownership", () => {
  const material = ['"Hiragino Sans GB", "Matter, Sans", sans-serif'];

  it("fails closed when a browser event cannot name its font faces", () => {
    expect(fontLoadAffectsMaterialGeometry(null, material)).toBe(true);
  });

  it("does not treat an explicit empty loading set as changed geometry", () => {
    expect(fontLoadAffectsMaterialGeometry([], material)).toBe(false);
  });

  it("ignores a font loaded only for independently lazy chrome", () => {
    expect(fontLoadAffectsMaterialGeometry(["__nextjs-Geist"], material)).toBe(false);
  });

  it("matches computed material families exactly across quotes and case", () => {
    expect(fontLoadAffectsMaterialGeometry(["hiragino sans gb"], material)).toBe(true);
    expect(fontLoadAffectsMaterialGeometry(["Matter, Sans"], material)).toBe(true);
    expect(fontLoadAffectsMaterialGeometry(["Hiragino Sans"], material)).toBe(false);
  });
});
