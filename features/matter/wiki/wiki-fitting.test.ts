import { describe, expect, it } from "vitest";
import { applyWikiEvent, createEmptyWikiState } from "./wiki-evidence";
import {
  compileWikiFitSnapshot,
  fitCommittedWikiText,
  wikiFitSnapshotMatchesState,
} from "./wiki-fitting";
import type { WikiState } from "./wiki-model";

describe("Wiki fitting", () => {
  it("proposes bounded spoken evidence for one conservative internal typo", () => {
    const snapshot = compileWikiFitSnapshot(withLexemes("Engelbart"));

    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart described the demo",
    })).toEqual([{
      type: "observe-evidence",
      locale: "en-US",
      channel: "spoken",
      boundary: "word",
      form: "Englebart",
      canonical: "Engelbart",
      source: "machine-inference",
    }]);
  });

  it("abstains for written output, short words, mixed scripts, and protected literals", () => {
    const snapshot = compileWikiFitSnapshot(withLexemes("Engelbart", "Codex"));

    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "written",
      text: "Englebart",
    })).toEqual([]);
    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Codecs xnglebart https://example.com/Englebart `Englebart`",
    })).toEqual([]);
  });

  it("keeps all unique candidates so the evidence policy can abstain on ambiguity", () => {
    const snapshot = compileWikiFitSnapshot(withLexemes("Abcxefgh", "Abcyefgh"));

    expect(fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text: "Abczefgh",
    }).map((event) => event.canonical)).toEqual(["Abcxefgh", "Abcyefgh"]);
  });

  it("respects generated-range authority and never retains the source text", () => {
    const snapshot = compileWikiFitSnapshot(withLexemes("Engelbart"));
    const text = "Source Englebart. Generated Englebart";
    const start = text.lastIndexOf("Englebart");
    const events = fitCommittedWikiText(snapshot, {
      locale: "en-US",
      channel: "spoken",
      text,
      eligibleRanges: [{ start, end: start + "Englebart".length }],
    });

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("Source");
  });

  it("invalidates the candidate cache and excludes written-only lexemes", () => {
    const both = withLexemes("Engelbart");
    const snapshot = compileWikiFitSnapshot(both);
    const changed = applyWikiEvent(both, {
      type: "rename-lexeme",
      lexemeId: both.lexemes[0].id,
      locale: "en-US",
      canonical: "Engelbart",
      scope: "written",
    });
    if (!changed.ok) throw new Error(changed.error.message);

    expect(wikiFitSnapshotMatchesState(snapshot, changed.state)).toBe(false);
    const writtenOnly = compileWikiFitSnapshot(changed.state);
    expect(writtenOnly.stats.eligibleLexemeCount).toBe(0);
    expect(fitCommittedWikiText(writtenOnly, {
      locale: "en-US",
      channel: "spoken",
      text: "Englebart",
    })).toEqual([]);
  });
});

function withLexemes(...canonicals: string[]): WikiState {
  let state = createEmptyWikiState();
  for (const canonical of canonicals) {
    const result = applyWikiEvent(state, {
      type: "create-lexeme",
      locale: "en-US",
      canonical,
      scope: "both",
    });
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  }
  return state;
}
