import { describe, expect, it } from "vitest";
import {
  TypographyHeightLedger,
  assertPositiveHeight,
} from "./typography-height-ledger";

const BASIS = Object.freeze({
  documentEpoch: 1,
  fontEpoch: 2,
  grammarEpoch: 3,
  projectionKey: "tree:revision:full",
  styleEpoch: 4,
});

describe("TypographyHeightLedger", () => {
  it("commits one complete positive transaction and rejects stale tokens", () => {
    const ledger = new TypographyHeightLedger(3);
    const first = ledger.begin(BASIS);
    expect(ledger.commit(first, new Map([["a", 20], ["b", 30]]))).toBe(true);
    expect(ledger.get(first, "a")).toBe(20);

    ledger.invalidate();
    expect(ledger.get(first, "a")).toBeUndefined();
    expect(ledger.commit(first, new Map([["late", 40]]))).toBe(false);
    expect(ledger.size).toBe(0);
  });

  it("validates every staged value before publishing any prefix", () => {
    const ledger = new TypographyHeightLedger();
    const token = ledger.begin(BASIS);
    expect(() => ledger.commit(token, new Map([["valid", 20], ["zero", 0]]))).toThrow(
      "finite positive scalar",
    );
    expect(ledger.size).toBe(0);
    expect(() => ledger.commit(token, new Map([["nan", Number.NaN]]))).toThrow();
    expect(() => ledger.commit(token, new Map([["infinity", Number.POSITIVE_INFINITY]]))).toThrow();
    expect(ledger.size).toBe(0);
  });

  it("does not expose hit recency from a rejected transaction", () => {
    const ledger = new TypographyHeightLedger(2);
    const token = ledger.begin(BASIS);
    expect(ledger.commit(token, new Map([["a", 10], ["b", 20]]))).toBe(true);
    expect(() => ledger.commit(token, new Map([["invalid", 0]]), ["a"])).toThrow();
    expect(ledger.commit(token, new Map([["c", 30]]))).toBe(true);
    expect(ledger.peek(token, "a")).toBeUndefined();
    expect(ledger.peek(token, "b")).toBe(20);
    expect(ledger.peek(token, "c")).toBe(30);
  });

  it("uses bounded least-recently-used order", () => {
    const ledger = new TypographyHeightLedger(2);
    const token = ledger.begin(BASIS);
    expect(ledger.commit(token, new Map([["a", 10], ["b", 20]]))).toBe(true);
    expect(ledger.get(token, "a")).toBe(10);
    expect(ledger.commit(token, new Map([["c", 30]]))).toBe(true);
    expect(ledger.get(token, "b")).toBeUndefined();
    expect(ledger.get(token, "a")).toBe(10);
    expect(ledger.get(token, "c")).toBe(30);
    expect(ledger.size).toBe(2);
  });

  it("does not accept a numerically identical token from another owner", () => {
    const first = new TypographyHeightLedger();
    const second = new TypographyHeightLedger();
    const token = first.begin(BASIS);
    expect(first.commit(token, new Map([["a", 10]]))).toBe(true);
    expect(second.get(token, "a")).toBeUndefined();
    expect(second.commit(token, new Map([["a", 10]]))).toBe(false);
  });

  it("rejects invalid limits, bases, and scalar heights", () => {
    expect(() => new TypographyHeightLedger(0)).toThrow();
    const ledger = new TypographyHeightLedger();
    expect(() => ledger.begin({ ...BASIS, documentEpoch: -1 })).toThrow();
    expect(() => ledger.begin({ ...BASIS, projectionKey: "" })).toThrow();
    expect(() => assertPositiveHeight(-1)).toThrow();
  });
});
