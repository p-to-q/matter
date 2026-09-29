import { describe, expect, it } from "vitest";
import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  admitWikiOccurrences,
  advanceWikiOccurrenceDwell,
  advanceWikiOccurrencePerception,
  decideWikiOccurrenceSettlement,
  INITIAL_WIKI_OCCURRENCE_PROGRESS,
  markWikiOccurrenceDisclosed,
  noteWikiOccurrenceAdmission,
  noteWikiOccurrenceCopy,
  remapWikiOccurrenceAddress,
  visibleAreaFraction,
  WIKI_OCCURRENCE_LIFETIME_MS,
  WIKI_OCCURRENCE_PERCEPTION,
  wikiOccurrenceAddressHolds,
  type LiveWikiOccurrence,
  type MaterialView,
  type WikiOccurrenceProgress,
} from "./wiki-occurrence-lifecycle";

const UPDATED_AT = "2026-09-29T00:00:00.000Z";
const TEXT = "我觉得 [p → q] 很重要。";
const START = TEXT.indexOf("[p → q]");
const END = START + "[p → q]".length;

describe("Wiki occurrence lifecycle", () => {
  it("admits only edits whose committed word still stands", () => {
    const material = view(TEXT);
    const [occurrence] = admitWikiOccurrences(publication(), material, 10);
    expect(occurrence).toMatchObject({
      id: "occ_1",
      sourceText: "P to Q",
      admittedAtMs: 10,
      address: {
        nodeId: "thought",
        nodeUpdatedAt: UPDATED_AT,
        start: START,
        end: END,
        canonicalText: "[p → q]",
      },
      progress: INITIAL_WIKI_OCCURRENCE_PROGRESS,
    });

    expect(admitWikiOccurrences(publication({ documentEpoch: 1 }), material, 10)).toEqual([]);
    expect(admitWikiOccurrences(publication({ nodeUpdatedAt: "2026-09-29T00:00:01.000Z" }), material, 10))
      .toEqual([]);
    expect(admitWikiOccurrences(publication({
      edits: [{ start: 0, end: 999, occurrence: "occ_bad", sourceText: "x" }],
    }), material, 10)).toEqual([]);
  });

  it("holds an address only while the exact committed word stands", () => {
    const [occurrence] = admitWikiOccurrences(publication(), view(TEXT), 0);
    const address = occurrence!.address;
    expect(wikiOccurrenceAddressHolds(address, view(TEXT))).toBe(true);
    // Any other commit to the node, including an Undo that restores older
    // text, a repair, or a swap elsewhere in it, moves its timestamp.
    expect(wikiOccurrenceAddressHolds(address, view(TEXT, "2026-09-29T00:00:02.000Z"))).toBe(false);
    expect(wikiOccurrenceAddressHolds(address, view(TEXT.replace("[p → q]", "P to Q")))).toBe(false);
    expect(wikiOccurrenceAddressHolds(address, { ...view(TEXT), documentEpoch: 1 })).toBe(false);
    expect(wikiOccurrenceAddressHolds(address, removedView())).toBe(false);
  });

  it("follows only the person's own restoration of a sibling word", () => {
    const address = admitWikiOccurrences(publication(), view(TEXT), 0)[0]!.address;
    const after = Object.freeze({
      nodeId: "thought",
      nodeUpdatedAt: UPDATED_AT,
      start: END + 2,
      end: END + 4,
      replacementLength: 6,
    });
    const before = Object.freeze({ ...after, start: 0, end: 3, replacementLength: 1 });
    expect(remapWikiOccurrenceAddress(address, after, "later")).toEqual({
      ...address,
      nodeUpdatedAt: "later",
    });
    expect(remapWikiOccurrenceAddress(address, before, "later")).toEqual({
      ...address,
      nodeUpdatedAt: "later",
      start: START - 2,
      end: END - 2,
    });
    expect(remapWikiOccurrenceAddress(address, { ...after, start: START + 1 }, "later")).toBeNull();
    expect(remapWikiOccurrenceAddress(address, { ...after, nodeUpdatedAt: "other" }, "later"))
      .toBe(address);
  });

  it("perceives only a disclosed word that stays perceivable long enough", () => {
    let progress = advanceWikiOccurrencePerception(INITIAL_WIKI_OCCURRENCE_PROGRESS, 5_000, true);
    expect(progress).toBe(INITIAL_WIKI_OCCURRENCE_PROGRESS);

    progress = markWikiOccurrenceDisclosed(progress);
    progress = advanceWikiOccurrencePerception(progress, 1_000, true);
    progress = advanceWikiOccurrencePerception(progress, 3_000, false);
    expect(progress.perceived).toBe(false);
    progress = advanceWikiOccurrencePerception(progress, WIKI_OCCURRENCE_PERCEPTION.visibleMs - 1_001, true);
    expect(progress.perceived).toBe(false);
    progress = advanceWikiOccurrencePerception(progress, 1.9, true);
    expect(progress).toMatchObject({ perceived: true, visibleMs: WIKI_OCCURRENCE_PERCEPTION.visibleMs });
    expect(advanceWikiOccurrencePerception(progress, Number.NaN, true)).toBe(progress);
  });

  it("counts informed facts only after perception", () => {
    const unseen = markWikiOccurrenceDisclosed(INITIAL_WIKI_OCCURRENCE_PROGRESS);
    expect(noteWikiOccurrenceAdmission(unseen)).toBe(unseen);
    expect(noteWikiOccurrenceCopy(unseen)).toBe(unseen);
    expect(advanceWikiOccurrenceDwell(unseen, 60_000, true)).toBe(unseen);

    const seen = perceived();
    expect(noteWikiOccurrenceAdmission(seen).furtherAdmissions).toBe(1);
    expect(noteWikiOccurrenceCopy(seen).copiedOrExported).toBe(true);
    expect(advanceWikiOccurrenceDwell(seen, 250.7, true).dwellMs).toBe(250);
    expect(advanceWikiOccurrenceDwell(seen, 250, false)).toBe(seen);
  });

  it("settles through Wiki's policy: triggers close the wait, never stack", () => {
    const occurrence = (progress: WikiOccurrenceProgress, admittedAtMs = 0): LiveWikiOccurrence => ({
      ...admitWikiOccurrences(publication(), view(TEXT), admittedAtMs)[0]!,
      progress,
    });
    const intact = { addressIntact: true, pageExit: false, nowMs: 1_000 };

    expect(decideWikiOccurrenceSettlement(occurrence(perceived()), intact)).toBe("pending");
    expect(decideWikiOccurrenceSettlement(
      occurrence(noteWikiOccurrenceAdmission(noteWikiOccurrenceAdmission(perceived()))),
      intact,
    )).toBe("accepted-implicit");
    expect(decideWikiOccurrenceSettlement(
      occurrence(advanceWikiOccurrenceDwell(perceived(), 60_000, true)),
      intact,
    )).toBe("accepted-implicit");
    expect(decideWikiOccurrenceSettlement(occurrence(noteWikiOccurrenceCopy(perceived())), intact))
      .toBe("accepted-implicit");
    expect(decideWikiOccurrenceSettlement(occurrence(perceived()), { ...intact, pageExit: true }))
      .toBe("accepted-implicit");
    // Unperceived silence is never approval.
    expect(decideWikiOccurrenceSettlement(
      occurrence(INITIAL_WIKI_OCCURRENCE_PROGRESS),
      { ...intact, pageExit: true },
    )).toBe("censored");
    expect(decideWikiOccurrenceSettlement(
      occurrence(noteWikiOccurrenceCopy(perceived())),
      { ...intact, addressIntact: false },
    )).toBe("censored");
    expect(decideWikiOccurrenceSettlement(
      occurrence(perceived(), 0),
      { ...intact, nowMs: WIKI_OCCURRENCE_LIFETIME_MS },
    )).toBe("censored");
  });

  it("measures the painted share inside the visual viewport", () => {
    const viewport = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(visibleAreaFraction([{ x: 10, y: 10, width: 20, height: 10 }], viewport)).toBe(1);
    expect(visibleAreaFraction([{ x: 90, y: 10, width: 20, height: 10 }], viewport)).toBe(.5);
    expect(visibleAreaFraction([
      { x: 90, y: 10, width: 20, height: 10 },
      { x: 0, y: 150, width: 20, height: 10 },
    ], viewport)).toBe(.25);
    expect(visibleAreaFraction([], viewport)).toBe(0);
  });
});

function perceived(): WikiOccurrenceProgress {
  return advanceWikiOccurrencePerception(
    markWikiOccurrenceDisclosed(INITIAL_WIKI_OCCURRENCE_PROGRESS),
    WIKI_OCCURRENCE_PERCEPTION.visibleMs,
    true,
  );
}

function publication(
  overrides: Partial<MaterialLexicalOccurrencePublication> = {},
): MaterialLexicalOccurrencePublication {
  return {
    treeId: "tree_occurrence",
    documentEpoch: 0,
    nodeId: "thought",
    nodeUpdatedAt: UPDATED_AT,
    stage: "admission",
    channel: "spoken",
    locale: "zh-CN",
    edits: [{ start: START, end: END, occurrence: "occ_1", sourceText: "P to Q" }],
    ...overrides,
  };
}

function view(text: string, updatedAt = UPDATED_AT): MaterialView {
  return { tree: tree(text, updatedAt), documentEpoch: 0 };
}

function removedView(): MaterialView {
  const base = tree(TEXT, UPDATED_AT);
  return {
    tree: { ...base, nodes: { document: { ...base.nodes.document!, children: [] } } },
    documentEpoch: 0,
  };
}

function tree(text: string, updatedAt: string): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_occurrence",
    rootId: "document",
    revision: 3,
    nodes: {
      document: {
        id: "document",
        role: "document-root",
        text: "",
        parentId: null,
        children: ["thought"],
        createdAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
      },
      thought: {
        id: "thought",
        text,
        parentId: "document",
        children: [],
        createdAt: UPDATED_AT,
        updatedAt,
      },
    },
  };
}
