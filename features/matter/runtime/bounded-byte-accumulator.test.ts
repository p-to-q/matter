import { describe, expect, it } from "vitest";
import { BoundedByteAccumulator } from "./bounded-byte-accumulator";

const decoder = new TextDecoder();

describe("bounded byte accumulator", () => {
  it("accepts the exact limit and rejects the next fragment atomically", () => {
    const accumulator = new BoundedByteAccumulator(4);
    expect(accumulator.append(Uint8Array.of(1, 2))).toBe(true);
    expect(accumulator.append(Uint8Array.of(3, 4))).toBe(true);
    expect(accumulator.append(Uint8Array.of(5))).toBe(false);
    expect([...accumulator.snapshot()]).toEqual([1, 2, 3, 4]);
  });

  it("owns a fragment before its backing buffer is reused or mutated", () => {
    const accumulator = new BoundedByteAccumulator(4);
    const backing = new Uint8Array(1);
    for (const byte of new TextEncoder().encode("null")) {
      backing[0] = byte;
      expect(accumulator.append(backing.subarray(0, 1))).toBe(true);
    }
    backing[0] = 0xff;
    expect(decoder.decode(accumulator.snapshot())).toBe("null");
  });

  it("returns snapshots that cannot mutate retained bytes", () => {
    const accumulator = new BoundedByteAccumulator(8);
    expect(accumulator.append(new TextEncoder().encode("safe"))).toBe(true);
    const first = accumulator.snapshot();
    first.fill(0);
    expect(decoder.decode(accumulator.snapshot())).toBe("safe");
  });

  it("absorbs one million tiny fragments into one exact result", () => {
    const limit = 1_000_000;
    const accumulator = new BoundedByteAccumulator(limit);
    const fragment = Uint8Array.of(0x61);
    let accepted = true;
    for (let index = 0; index < limit; index += 1) {
      accepted = accumulator.append(fragment) && accepted;
    }
    expect(accepted).toBe(true);
    const bytes = accumulator.snapshot();
    expect(bytes).toHaveLength(limit);
    expect(bytes[0]).toBe(0x61);
    expect(bytes.at(-1)).toBe(0x61);
  });

  it("rejects invalid construction and fragment types", () => {
    for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new BoundedByteAccumulator(limit)).toThrow(RangeError);
    }
    const accumulator = new BoundedByteAccumulator(4);
    expect(() => accumulator.append("no bytes" as unknown as Uint8Array)).toThrow(TypeError);
  });
});
