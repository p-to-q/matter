import { describe, expect, it } from "vitest";
import canaries from "../../../scripts/probe-model-pool-canaries.json";
import {
  decideModelRequest,
  deriveProvisionalLabel,
  labelFingerprint,
  normalizeLabelInput,
} from "./semantic-label";

describe("model-pool label canaries", () => {
  it("keeps every allowed round unique and on the real model-request path", () => {
    const inputsFor = (runId: string) => canaries.map((text) => normalizeLabelInput({
      text,
      locale: "en-US",
      maxGraphemes: 28,
      context: { siblingLabels: [`Canary ${runId}`] },
    }));
    const inputs = inputsFor("runa");
    const fingerprints = inputs.map((input) => labelFingerprint(input));
    const nextRunFingerprints = inputsFor("runb").map((input) => labelFingerprint(input));

    expect(new Set(fingerprints).size).toBe(canaries.length);
    expect(new Set([...fingerprints, ...nextRunFingerprints]).size).toBe(canaries.length * 2);
    for (const input of inputs) {
      expect(decideModelRequest(input, deriveProvisionalLabel(input))).toEqual({
        request: true,
        reason: "material-is-spoken",
      });
    }
  });
});
