import { describe, expect, it } from "vitest";
import canaries from "../../../scripts/probe-model-pool-canaries.json";
import {
  decideModelRequest,
  deriveProvisionalLabel,
  labelQuestionIdentity,
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
    // The server cache keys on a digest of exactly this identity, so distinct
    // identities are distinct cache entries and every round reaches the model.
    const identities = inputs.map((input) => labelQuestionIdentity(input));
    const nextRunIdentities = inputsFor("runb").map((input) => labelQuestionIdentity(input));

    expect(new Set(identities).size).toBe(canaries.length);
    expect(new Set([...identities, ...nextRunIdentities]).size).toBe(canaries.length * 2);
    for (const input of inputs) {
      expect(decideModelRequest(input, deriveProvisionalLabel(input))).toEqual({
        request: true,
        reason: "material-is-spoken",
      });
    }
  });
});
