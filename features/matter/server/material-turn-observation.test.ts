import { describe, expect, it, vi } from "vitest";
import { createMaterialTurnObservationOwner } from "./material-turn-observation";

describe("material turn observation", () => {
  it("emits one allowlisted terminal receipt without hostile material or identity", () => {
    const hostile = "MATERIAL_SENTINEL tree_secret request_secret 203.0.113.9";
    const observe = vi.fn();
    const times = [100, 137];
    const owner = createMaterialTurnObservationOwner("expand-in-place", {
      observe,
      now: () => times.shift() ?? 137,
    });

    owner.noteRequestBytes(2_048);
    owner.noteBasis({ locale: hostile, amount: .6, targetGraphemes: 48 });
    owner.noteScenario({
      scenario: "matter-transform",
      reason: "MODEL_REJECTED",
      rejectionReason: hostile,
      elapsedMs: 12,
    });
    owner.settle({ outcome: "rejected", reason: hostile, responseBytes: 512 });
    owner.settle({ outcome: "success", reason: "NONE", responseBytes: 512 });

    expect(observe).toHaveBeenCalledOnce();
    const receipt = observe.mock.calls[0]?.[0];
    expect(receipt).toEqual({
      operation: "expand-in-place",
      outcome: "rejected",
      reason: "POLICY_REJECTED",
      locale: "unknown",
      amountBucket: "0.40-0.74",
      lengthBucket: "21-80",
      requestBytesBucket: "1-4KiB",
      responseBytesBucket: "0-1KiB",
      elapsedMs: 37,
    });
    expect(Object.keys(receipt)).toEqual([
      "operation",
      "outcome",
      "reason",
      "locale",
      "amountBucket",
      "lengthBucket",
      "requestBytesBucket",
      "responseBytesBucket",
      "elapsedMs",
    ]);
    expect(JSON.stringify(receipt)).not.toContain(hostile);
  });

  it("keeps an observation sink failure outside the material turn", () => {
    const owner = createMaterialTurnObservationOwner("paraphrase-in-place", {
      observe: () => { throw new Error("telemetry unavailable"); },
      now: () => 0,
    });
    expect(() => owner.settle({ outcome: "success", reason: "NONE", responseBytes: 1 }))
      .not.toThrow();
  });
});
