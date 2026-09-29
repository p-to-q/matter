import { describe, expect, it } from "vitest";
import { combineWikiAdmissionEvidence } from "./wiki-admission";
import type { WikiObserveEvidenceEvent } from "./wiki-model";

describe("Wiki admission planning", () => {
  it("lets only a unique relation from a claiming producer suppress its source term", () => {
    const source = term("Englebart");
    expect(combineWikiAdmissionEvidence(
      [source],
      [relation("Englebart", "Engelbart", "latin-internal-edit-v2")],
    )).toEqual([relation("Englebart", "Engelbart", "latin-internal-edit-v2")]);
    expect(combineWikiAdmissionEvidence(
      [source],
      [relation("Englebart", "Engelbart", "en-metaphone-v1")],
    )).toEqual([source, relation("Englebart", "Engelbart", "en-metaphone-v1")]);
    expect(combineWikiAdmissionEvidence([source], [
      relation("Englebart", "Engelbart", "latin-internal-edit-v2"),
      relation("Englebart", "Engelbert", "latin-internal-edit-v2"),
    ])).toHaveLength(3);
  });
});

function term(canonical: string): WikiObserveEvidenceEvent {
  return Object.freeze({
    type: "observe-evidence",
    source: "recent-material",
    locale: "en-US",
    canonical,
    producer: "locale-segment-v1",
  });
}

function relation(
  form: string,
  canonical: string,
  producer: "latin-internal-edit-v2" | "en-metaphone-v1",
): WikiObserveEvidenceEvent {
  return Object.freeze({
    type: "observe-evidence",
    source: "machine-inference",
    locale: "en-US",
    channel: "spoken",
    boundary: "word",
    form,
    canonical,
    producer,
  });
}
