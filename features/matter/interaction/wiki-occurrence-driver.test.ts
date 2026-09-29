import { describe, expect, it } from "vitest";
import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  createWikiOccurrenceDriver,
  WIKI_OCCURRENCE_TICK_MS,
  type WikiOccurrenceEnvironment,
  type WikiOccurrenceRestorationRequest,
  type WikiOccurrenceSettleOutcome,
} from "./wiki-occurrence-driver";
import {
  MAX_LIVE_WIKI_OCCURRENCES,
  WIKI_OCCURRENCE_LIFETIME_MS,
  type MaterialView,
} from "./wiki-occurrence-lifecycle";

const T0 = "2026-09-29T00:00:00.000Z";
const T1 = "2026-09-29T00:00:01.000Z";
const TEXT = "我觉得 [p → q] 和 [p → q] 都很重要。";
const FIRST = TEXT.indexOf("[p → q]");
const SECOND = TEXT.lastIndexOf("[p → q]");
const LENGTH = "[p → q]".length;

describe("Wiki occurrence driver", () => {
  it("settles informed silence once after perception and dwell", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    expect(harness.page.attached).toBe(true);
    harness.advance(10_000);
    // Never disclosed, so never perceived, whatever the time on screen.
    expect(harness.settled).toEqual([]);

    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    harness.advance(59_000);
    expect(harness.settled).toEqual([]);
    harness.advance(1_500);
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
    expect(harness.driver.getSnapshot()).toEqual([]);
    expect(harness.page.attached).toBe(false);
    expect(harness.ticking).toBe(false);

    harness.driver.noteHumanAdmission();
    harness.driver.noteExported();
    harness.fire("exit");
    expect(harness.settled).toHaveLength(1);
  });

  it("counts only admissions that follow perception", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.driver.noteHumanAdmission();
    harness.driver.noteHumanAdmission();
    expect(harness.settled).toEqual([]);
    harness.advance(1_500);
    harness.driver.noteHumanAdmission();
    expect(harness.settled).toEqual([]);
    harness.driver.noteHumanAdmission();
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("accepts on copy or export of the unchanged word after perception", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    harness.driver.markDisclosed("occ_a");
    harness.driver.markDisclosed("occ_b");
    harness.driver.noteMaterialCopied(["other"]);
    harness.advance(1_500);
    harness.driver.noteMaterialCopied(["other"]);
    expect(harness.settled).toEqual([]);
    harness.selectionCovers = (address) => address.start === FIRST;
    harness.fire("copy");
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
    harness.driver.noteExported();
    expect(harness.settled).toEqual([
      ["occ_a", "accepted-implicit"],
      ["occ_b", "accepted-implicit"],
    ]);
  });

  it("censors when the address stops holding, including through Material Undo", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    harness.setMaterial(removedTree());
    harness.driver.reconcile();
    expect(harness.settled).toEqual([["occ_a", "censored"]]);

    // Undo restoring the same node never revives or re-settles it.
    harness.setMaterial(tree(TEXT, T0));
    harness.driver.reconcile();
    harness.fire("exit");
    expect(harness.settled).toHaveLength(1);
  });

  it("censors on a document switch, a rewrite, expiry, and an unseen page exit", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_epoch", FIRST]]));
    harness.setMaterial(tree(TEXT, T0), 1);
    harness.driver.reconcile();

    harness.setMaterial(tree(TEXT, T0), 0);
    harness.driver.admit(publication([["occ_rewrite", FIRST]]));
    harness.setMaterial(tree(TEXT, T1));
    harness.driver.reconcile();

    harness.setMaterial(tree(TEXT, T0));
    harness.driver.admit(publication([["occ_expired", FIRST]]));
    harness.driver.markDisclosed("occ_expired");
    harness.advance(1_500);
    harness.now += WIKI_OCCURRENCE_LIFETIME_MS;
    harness.tick();

    harness.driver.admit(publication([["occ_hidden", SECOND]]));
    harness.visible = false;
    harness.fire("visibility");
    expect(harness.ticking).toBe(false);
    harness.fire("exit");
    expect(harness.settled).toEqual([
      ["occ_epoch", "censored"],
      ["occ_rewrite", "censored"],
      ["occ_expired", "censored"],
      ["occ_hidden", "censored"],
    ]);
  });

  it("accepts a perceived occurrence when the page is left", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    harness.fire("exit");
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("does not perceive while hidden, covered, off-screen, or under an open takeover", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.perceivable = false;
    harness.advance(5_000);
    harness.perceivable = true;
    harness.driver.setSurfaceAvailable(false);
    harness.advance(5_000);
    harness.driver.setSurfaceAvailable(true);
    harness.fire("exit");
    expect(harness.settled).toEqual([["occ_a", "censored"]]);
  });

  it("turns the takeover into inspection, confirmation, or a single revert", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    expect(harness.driver.openTakeover("occ_a")).toBe(true);
    expect(harness.driver.getSnapshot().find((view) => view.id === "occ_a"))
      .toMatchObject({ takeover: true, disclosed: true, sourceText: "P to Q" });
    // An open takeover suspends silence.
    harness.driver.noteExported();
    harness.advance(70_000);
    expect(harness.settled).toEqual([]);

    expect(harness.driver.openTakeover("occ_b")).toBe(true);
    expect(harness.settled).toEqual([["occ_a", "inspected-kept"]]);
    harness.driver.closeTakeover("occ_b", "explicit-confirm");
    harness.driver.closeTakeover("occ_b", "inspected-kept");
    expect(harness.settled).toEqual([
      ["occ_a", "inspected-kept"],
      ["occ_b", "explicit-confirm"],
    ]);
  });

  it("leaves the takeover for the Wiki surface without settling", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.openTakeover("occ_a");
    harness.driver.leaveTakeover("occ_a");
    expect(harness.settled).toEqual([]);
    expect(harness.driver.getSnapshot()).toMatchObject([{ id: "occ_a", takeover: false }]);
    // Silence resumes: the opened takeover already counted as disclosure.
    harness.advance(1_500);
    harness.driver.noteExported();
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("reverts through an ordinary material command and keeps its sibling", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    harness.driver.openTakeover("occ_a");
    expect(harness.driver.revert("occ_a")).toBe("reverted");

    expect(harness.restorations).toEqual([{
      treeId: "tree_occurrence",
      documentEpoch: 0,
      nodeId: "thought",
      expectedUpdatedAt: T0,
      start: FIRST,
      end: FIRST + LENGTH,
      expectedText: "[p → q]",
      replacement: "P to Q",
    }]);
    expect(harness.settled).toEqual([["occ_a", "reverted"]]);
    const sibling = harness.driver.getSnapshot();
    expect(sibling).toHaveLength(1);
    const text = harness.material.tree.nodes.thought!.text;
    expect(text.slice(sibling[0]!.start, sibling[0]!.end)).toBe("[p → q]");

    // Undoing the revert is ordinary history: it censors the moved sibling
    // and never settles the reverted occurrence again.
    harness.setMaterial(tree(TEXT, T0));
    harness.driver.reconcile();
    expect(harness.settled).toEqual([["occ_a", "reverted"], ["occ_b", "censored"]]);
  });

  it("fails a revert closed when the passage changed", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.restoreResult = false;
    expect(harness.driver.revert("occ_a")).toBe("stale");
    expect(harness.settled).toEqual([]);
    expect(harness.driver.getSnapshot()).toHaveLength(1);

    harness.setMaterial(tree(TEXT, T1));
    expect(harness.driver.revert("occ_a")).toBe("stale");
    expect(harness.settled).toEqual([["occ_a", "censored"]]);
  });

  it("bounds live occurrences and releases every resource once", () => {
    const harness = createHarness();
    for (let index = 0; index <= MAX_LIVE_WIKI_OCCURRENCES; index += 1) {
      harness.driver.admit(publication([[`occ_${index}`, FIRST]]));
    }
    expect(harness.settled).toEqual([["occ_0", "censored"]]);
    expect(harness.driver.getSnapshot()).toHaveLength(MAX_LIVE_WIKI_OCCURRENCES);
    harness.driver.dispose();
    harness.driver.dispose();
    expect(harness.page.attached).toBe(false);
    expect(harness.ticking).toBe(false);
    expect(harness.disposed).toBe(1);
    harness.driver.admit(publication([["occ_late", FIRST]]));
    expect(harness.driver.getSnapshot()).toEqual([]);
  });
});

function createHarness() {
  const state = {
    now: 0,
    visible: true,
    perceivable: true,
    restoreResult: true,
    material: { tree: tree(TEXT, T0), documentEpoch: 0 } as MaterialView,
    settled: [] as [string, WikiOccurrenceSettleOutcome][],
    restorations: [] as WikiOccurrenceRestorationRequest[],
    selectionCovers: (() => false) as (address: { start: number }) => boolean,
    page: { attached: false, handlers: null as null | Record<"visibility" | "exit" | "copy", () => void> },
    ticker: null as null | (() => void),
    ticking: false,
    disposed: 0,
  };
  const environment: WikiOccurrenceEnvironment = {
    now: () => state.now,
    isPageVisible: () => state.visible,
    startTicker(tick) {
      state.ticker = tick;
      state.ticking = true;
      return () => {
        state.ticking = false;
        state.ticker = null;
      };
    },
    listenPage(handlers) {
      state.page.attached = true;
      state.page.handlers = handlers;
      return () => {
        state.page.attached = false;
        state.page.handlers = null;
      };
    },
    track: () => undefined,
    untrack: () => undefined,
    isPerceivable: () => state.perceivable,
    selectionCovers: (address) => state.selectionCovers(address),
    dispose: () => {
      state.disposed += 1;
    },
  };
  const driver = createWikiOccurrenceDriver({
    readMaterial: () => state.material,
    settle: (occurrenceId, outcome) => state.settled.push([occurrenceId, outcome]),
    restore: (request) => {
      state.restorations.push(request);
      if (!state.restoreResult) return false;
      const node = state.material.tree.nodes[request.nodeId]!;
      const text = node.text.slice(0, request.start) + request.replacement +
        node.text.slice(request.end);
      state.material = { ...state.material, tree: tree(text, T1) };
      // The store's subscription reconciles inside the commit.
      driver.reconcile();
      return true;
    },
    environment,
  });
  return Object.assign(state, {
    driver,
    setMaterial(next: ThoughtTree, documentEpoch = 0) {
      state.material = { tree: next, documentEpoch };
    },
    tick() {
      state.ticker?.();
    },
    advance(milliseconds: number) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += WIKI_OCCURRENCE_TICK_MS) {
        state.now += WIKI_OCCURRENCE_TICK_MS;
        state.ticker?.();
      }
    },
    fire(event: "visibility" | "exit" | "copy") {
      state.page.handlers?.[event]();
    },
  });
}

function publication(
  edits: readonly (readonly [string, number])[],
): MaterialLexicalOccurrencePublication {
  return {
    treeId: "tree_occurrence",
    documentEpoch: 0,
    nodeId: "thought",
    nodeUpdatedAt: T0,
    stage: "admission",
    channel: "spoken",
    locale: "zh-CN",
    edits: edits.map(([occurrence, start]) => ({
      start,
      end: start + LENGTH,
      occurrence,
      sourceText: "P to Q",
    })),
  };
}

function removedTree(): ThoughtTree {
  const base = tree(TEXT, T0);
  return {
    ...base,
    nodes: { document: { ...base.nodes.document!, children: [] } },
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
        createdAt: T0,
        updatedAt: T0,
      },
      thought: {
        id: "thought",
        text,
        parentId: "document",
        children: [],
        createdAt: T0,
        updatedAt,
      },
    },
  };
}
