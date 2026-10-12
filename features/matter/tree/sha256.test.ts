import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHA256_HEX, sha256Hex } from "./sha256";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sha256Hex", () => {
  it("matches Node's SHA-256 for empty, small and large input, as bytes or a buffer", async () => {
    const large = new Uint8Array(100_000).map((_, index) => (index * 7) % 256);
    for (const bytes of [new Uint8Array(0), new TextEncoder().encode("abc"), large]) {
      const expected = createHash("sha256").update(bytes).digest("hex");
      await expect(sha256Hex(bytes)).resolves.toBe(expected);
      await expect(sha256Hex(bytes.slice().buffer)).resolves.toBe(expected);
    }
  });

  it("hashes only the viewed window of a larger buffer", async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    await expect(sha256Hex(backing.subarray(2, 5)))
      .resolves.toBe(createHash("sha256").update(Uint8Array.from([1, 2, 3])).digest("hex"));
  });

  it("produces exactly the shape SHA256_HEX accepts", async () => {
    expect(await sha256Hex(new Uint8Array(1))).toMatch(SHA256_HEX);
    for (const bad of ["", "A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64)]) {
      expect(SHA256_HEX.test(bad)).toBe(false);
    }
  });

  it("rejects where Web Crypto is missing, so callers decide what that means", async () => {
    vi.stubGlobal("crypto", {});
    await expect(sha256Hex(new Uint8Array(1))).rejects.toBeInstanceOf(Error);
  });
});
