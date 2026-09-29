import { describe, expect, it } from "vitest";
import {
  combineWikiAdmissionEvidence,
  planWikiAdmissionBatch,
  type WikiAdmissionProducerResult,
  type WikiAdmissionTurn,
} from "./wiki-admission";
import type { WikiObserveEvidenceEvent } from "./wiki-model";

const TURN: WikiAdmissionTurn = Object.freeze({
  observed: Object.freeze({ locale: "en-US", channel: "spoken", text: "Englebart spoke" }),
  committed: Object.freeze({ locale: "en-US", channel: "spoken", text: "Engelbart spoke" }),
});
const ENGLISH = Object.freeze({ locale: "en-US", channel: "spoken", scripts: ["latin"] });

describe("Wiki admission planning", () => {
  it("offers a complete scan as the turn's comparable opportunity", () => {
    const batch = planWikiAdmissionBatch(
      TURN,
      result("ok", [term("Engelbart")]),
      result("ok", []),
    );

    expect(batch.events).toEqual([term("Engelbart")]);
    expect(batch.tick).toEqual({
      term: { disposition: "observed", opportunity: ENGLISH },
      alias: { disposition: "quiet", opportunity: ENGLISH },
    });
  });

  it("pauses a producer that did not run and ages nothing after a partial scan", () => {
    const batch = planWikiAdmissionBatch(
      TURN,
      null,
      result("partial", [relation("Englebart", "Engelbart", "latin-internal-edit-v2")]),
    );

    expect(batch.events).toHaveLength(1);
    expect(batch.tick).toEqual({
      term: { disposition: "paused" },
      alias: { disposition: "partial" },
    });
  });

  it("censors a producer failure and a turn without eligible content", () => {
    expect(planWikiAdmissionBatch(TURN, result("censored", []), null).tick.term)
      .toEqual({ disposition: "censored" });
    const generatedOnly: WikiAdmissionTurn = Object.freeze({
      observed: Object.freeze({ ...TURN.observed, eligibleRanges: Object.freeze([]) }),
      committed: Object.freeze({ ...TURN.committed, eligibleRanges: Object.freeze([]) }),
    });
    expect(planWikiAdmissionBatch(
      generatedOnly,
      result("ok", []),
      result("ok", []),
    ).tick).toEqual({
      term: { disposition: "censored" },
      alias: { disposition: "censored" },
    });
  });

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

function result(
  status: WikiAdmissionProducerResult["status"],
  events: readonly WikiObserveEvidenceEvent[],
): WikiAdmissionProducerResult {
  return Object.freeze({
    status,
    events: Object.freeze([...events]),
    scannedScripts: Object.freeze(status === "censored" ? [] : ["latin" as const]),
  });
}

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
