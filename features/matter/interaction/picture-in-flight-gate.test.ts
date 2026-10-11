import { describe, expect, it } from "vitest";
import { createPictureInFlightGate } from "./picture-in-flight-gate";

describe("picture in-flight gate", () => {
  it("admits one holder and refuses every other while the slot is taken", () => {
    const gate = createPictureInFlightGate();
    const release = gate.tryEnter("node-1");
    expect(release).toBeTypeOf("function");
    expect(gate.heldBy()).toBe("node-1");
    expect(gate.tryEnter("node-2")).toBeNull();
    expect(gate.tryEnter("node-1")).toBeNull();
    expect(gate.heldBy()).toBe("node-1");
  });

  it("frees the slot on release and admits the next holder", () => {
    const gate = createPictureInFlightGate();
    gate.tryEnter("node-1")!();
    expect(gate.heldBy()).toBeNull();
    expect(gate.tryEnter("node-2")).toBeTypeOf("function");
    expect(gate.heldBy()).toBe("node-2");
  });

  it("makes release idempotent and unable to free a later holder", () => {
    const gate = createPictureInFlightGate();
    const first = gate.tryEnter("node-1")!;
    first();
    const second = gate.tryEnter("node-2")!;
    first();
    first();
    expect(gate.heldBy()).toBe("node-2");
    expect(gate.tryEnter("node-3")).toBeNull();
    second();
    expect(gate.heldBy()).toBeNull();
  });

  it("is independent per gate", () => {
    const left = createPictureInFlightGate();
    const right = createPictureInFlightGate();
    expect(left.tryEnter("node-1")).not.toBeNull();
    expect(right.tryEnter("node-1")).not.toBeNull();
  });
});
