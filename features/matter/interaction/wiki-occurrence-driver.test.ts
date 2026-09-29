import { describe, expect, it } from "vitest";
import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import {
  createWikiOccurrenceDriver,
  WIKI_OCCURRENCE_TICK_MS,
  type WikiOccurrenceEnvironment,
  type WikiOccurrenceRestorationRequest,
  type WikiOccurrenceSettleOutcome,
  type WikiOccurrenceSettleStatus,
  type WikiOccurrenceTarget,
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

  it("does not replay a settle when a rewrite re-applies the same change", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_admitted", FIRST]]));
    harness.driver.markDisclosed("occ_admitted");
    // A late repair rewrites the passage and re-applies the same correction.
    harness.setMaterial(tree(TEXT, T1));
    harness.driver.reconcile();
    harness.driver.admit({ ...publication([["occ_repaired", FIRST]]), nodeUpdatedAt: T1, stage: "repair" });
    expect(harness.settled).toEqual([["occ_admitted", "censored"]]);
    expect(harness.driver.getSnapshot()).toMatchObject([{ id: "occ_repaired", disclosed: true }]);
    // Continuity is inherited once; a later identical change settles anew.
    harness.driver.admit({ ...publication([["occ_second", SECOND]]), nodeUpdatedAt: T1, stage: "repair" });
    expect(harness.driver.getSnapshot().find((view) => view.id === "occ_second"))
      .toMatchObject({ disclosed: false });

    // A remembered disclosure fades after its short window.
    harness.now += 20_000;
    harness.setMaterial(tree(TEXT, T0));
    harness.driver.reconcile();
    harness.now += 20_000;
    harness.driver.admit(publication([["occ_late", FIRST]]));
    expect(harness.driver.getSnapshot().find((view) => view.id === "occ_late"))
      .toMatchObject({ disclosed: false });
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

  it("counts dwell only while the paper itself is available", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    // A covering dialog holds the word out of view however long it stays.
    harness.driver.setSurfaceAvailable(false);
    harness.advance(120_000);
    expect(harness.settled).toEqual([]);
    harness.driver.setSurfaceAvailable(true);
    // Perception's own tick already counted 250 ms of the 60 s dwell.
    harness.advance(59_500);
    expect(harness.settled).toEqual([]);
    harness.advance(500);
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("keeps silence suspended while the Wiki surface consulted from the takeover is open", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    harness.driver.openTakeover("occ_a");
    harness.driver.leaveTakeover("occ_a", "consult");
    expect(harness.settled).toEqual([]);
    expect(harness.driver.getSnapshot()).toMatchObject([{ id: "occ_a", takeover: false }]);

    // The dialog covers the paper; nothing, not even an export, settles it.
    harness.driver.setSurfaceAvailable(false);
    harness.advance(120_000);
    harness.driver.noteHumanAdmission();
    harness.driver.noteExported();
    expect(harness.settled).toEqual([]);

    // Once the dialog is gone, the facts it could not settle close the wait.
    harness.driver.setSurfaceAvailable(true);
    harness.advance(250);
    harness.driver.noteHumanAdmission();
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("keeps the attribution alive when the takeover opens and when it hands off to Wiki", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    harness.driver.markDisclosed("occ_a");
    expect(harness.renewed).toEqual([]);
    expect(harness.driver.openTakeover("occ_a")).toBe(true);
    expect(harness.renewed).toEqual(["occ_a"]);
    harness.driver.leaveTakeover("occ_a", "consult");
    expect(harness.renewed).toEqual(["occ_a", "occ_a"]);
    // Leaving unread renews nothing: silence resumes on the ordinary clock.
    harness.driver.openTakeover("occ_b");
    harness.driver.leaveTakeover("occ_b", "unread");
    expect(harness.renewed).toEqual(["occ_a", "occ_a", "occ_b"]);
  });

  it("lets a consult that never covered the paper lapse after a short visible wait", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    harness.driver.openTakeover("occ_a");
    harness.driver.leaveTakeover("occ_a", "consult");
    harness.driver.noteExported();
    harness.advance(2_750);
    expect(harness.settled).toEqual([]);
    harness.advance(500);
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("returns a takeover dismissed unread to silence without settling", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    harness.driver.openTakeover("occ_a");
    harness.driver.leaveTakeover("occ_a", "unread");
    harness.driver.leaveTakeover("occ_a", "unread");
    expect(harness.settled).toEqual([]);
    expect(harness.driver.getSnapshot()).toMatchObject([{ id: "occ_a", takeover: false }]);
    // Informed silence resumes at once; nothing waits for a surface.
    harness.advance(1_500);
    harness.driver.noteExported();
    expect(harness.settled).toEqual([["occ_a", "accepted-implicit"]]);
  });

  it("hit-tests only disclosed words of the addressed passage", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    harness.hitTest = (targets) => targets.map((target) => target.id).join(",");
    expect(harness.driver.hitTest("thought", 1, 1)).toBeNull();
    harness.driver.markDisclosed("occ_b");
    expect(harness.driver.hitTest("thought", 1, 1)).toBe("occ_b");
    expect(harness.driver.hitTest("other", 1, 1)).toBeNull();
  });

  it("reports an explicit choice Wiki could not record, and nothing implicit", async () => {
    const harness = createHarness();
    let unsaved = 0;
    harness.driver.subscribeUnsaved(() => {
      unsaved += 1;
    });
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    harness.settleStatus = "failed";
    harness.driver.markDisclosed("occ_a");
    harness.advance(1_500);
    harness.driver.noteExported();
    await Promise.resolve();
    expect(unsaved).toBe(0);

    harness.driver.openTakeover("occ_b");
    harness.settleStatus = "unattributed";
    harness.driver.closeTakeover("occ_b", "explicit-confirm");
    await Promise.resolve();
    await Promise.resolve();
    expect(unsaved).toBe(1);
  });

  it("reports a revert whose settlement throws, and keeps the restored text", async () => {
    const harness = createHarness();
    let unsaved = 0;
    harness.driver.subscribeUnsaved(() => {
      unsaved += 1;
    });
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.settleStatus = "throw";
    expect(harness.driver.revert("occ_a")).toBe("reverted");
    expect(unsaved).toBe(1);
    expect(harness.material.tree.nodes.thought!.text.slice(FIRST, FIRST + 6)).toBe("P to Q");
  });

  it("forgets remembered heard forms when they expire or the document changes", () => {
    const harness = createHarness();
    harness.driver.admit(publication([["occ_a", FIRST]]));
    harness.driver.markDisclosed("occ_a");
    // A rewrite censors it and remembers its disclosure briefly.
    harness.setMaterial(tree(TEXT, T1));
    harness.driver.reconcile();
    // Switching documents forgets it even inside the window.
    harness.setMaterial(tree(TEXT, T1), 1);
    harness.driver.reconcile();
    harness.driver.admit({
      ...publication([["occ_b", FIRST]]),
      documentEpoch: 1,
      nodeUpdatedAt: T1,
    });
    expect(harness.driver.getSnapshot()).toMatchObject([{ id: "occ_b", disclosed: false }]);
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
    harness.driver.admit(publication([["occ_a", FIRST], ["occ_b", SECOND]]));
    harness.driver.openTakeover("occ_a");
    harness.restoreResult = false;
    expect(harness.driver.revert("occ_a")).toBe("stale");
    expect(harness.settled).toEqual([]);
    // A failed restore closes the takeover but keeps the order it found.
    expect(harness.driver.getSnapshot().map((view) => [view.id, view.takeover]))
      .toEqual([["occ_a", false], ["occ_b", false]]);
    harness.driver.closeTakeover("occ_b", "inspected-kept");

    harness.setMaterial(tree(TEXT, T1));
    expect(harness.driver.revert("occ_a")).toBe("stale");
    expect(harness.settled).toEqual([["occ_a", "censored"], ["occ_b", "censored"]]);
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
    renewed: [] as string[],
    restorations: [] as WikiOccurrenceRestorationRequest[],
    selectionCovers: (() => false) as (address: { start: number }) => boolean,
    hitTest: (() => null) as (targets: readonly WikiOccurrenceTarget[]) => string | null,
    settleStatus: null as WikiOccurrenceSettleStatus | "throw" | null,
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
    hitTest: (targets) => state.hitTest(targets),
    dispose: () => {
      state.disposed += 1;
    },
  };
  const driver = createWikiOccurrenceDriver({
    readMaterial: () => state.material,
    settle: (occurrenceId, outcome) => {
      state.settled.push([occurrenceId, outcome]);
      if (state.settleStatus === "throw") throw new Error("unavailable");
      return state.settleStatus === null ? undefined : Promise.resolve(state.settleStatus);
    },
    renew: (occurrenceId) => {
      state.renewed.push(occurrenceId);
    },
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
