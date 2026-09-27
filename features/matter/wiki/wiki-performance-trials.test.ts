import { describe, expect, it } from "vitest";
import { selectBestCompleteWikiPerformanceTrial } from
  "../../../scripts/wiki/qualification/performance-trials";

describe("Wiki qualification performance trials", () => {
  it("never splices passing metrics from two failing trials", () => {
    const trials = [
      { id: "compile", compileMicros: 40, lookupP95Micros: 60 },
      { id: "lookup", compileMicros: 60, lookupP95Micros: 40 },
    ] as const;

    const selected = selectBestCompleteWikiPerformanceTrial(trials, {
      maximumCompileMicros: 50,
      maximumLookupP95Micros: 50,
    });

    expect(trials).toContain(selected);
    expect(selected.compileMicros <= 50 && selected.lookupP95Micros <= 50).toBe(false);
  });

  it("minimizes the worst normalized budget ratio", () => {
    const selected = selectBestCompleteWikiPerformanceTrial([
      { id: "compile-heavy", compileMicros: 90, lookupP95Micros: 20 },
      { id: "balanced", compileMicros: 60, lookupP95Micros: 50 },
      { id: "lookup-heavy", compileMicros: 20, lookupP95Micros: 90 },
    ], {
      maximumCompileMicros: 100,
      maximumLookupP95Micros: 100,
    });

    expect(selected.id).toBe("balanced");
  });
});
