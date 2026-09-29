import { describe, expect, it } from "vitest";
import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import { createMatterStore } from "./matter-store";
import { createWikiMaterialLexicalPort } from "../application/wiki-material-lexical-adapter";
import type { MaterialLexicalPort } from "../application/material-lexical-port";
import type {
  MaterialLexicalOccurrencePort,
  MaterialLexicalOccurrencePublication,
} from "../application/material-lexical-occurrence-port";
import type { MaterialLexicalObservationPort } from "../application/material-lexical-observation-port";
import { compileWikiBasis } from "../wiki/wiki-basis";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";
import type { WikiChannel } from "../wiki/wiki-model";
import {
  buildTextSwapPlan,
  parseTextSwapEnvelope,
  TEXT_SWAP_REQUEST_VERSION,
} from "../protocol/text-swap-contract";
import {
  buildTransformPlan,
  parseTransformEnvelope,
  TRANSFORM_REQUEST_VERSION,
} from "../protocol/transform-contract";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import type { MatterLocale } from "../config/locales";
import { repairAdmittedTranscriptWords } from "../runtime/transcript-punctuation";
import { decorateSpokenExpression } from "../runtime/expressive-transcript";
import { adjudicateAdmissionRepair } from "../runtime/admission-repair-adjudication";

// The repair runtime supplies this adjudicator; the product loads it lazily.
const judgeRepair = () => adjudicateAdmissionRepair;

const TIME = "2026-09-29T00:00:00.000Z";
const PASSAGE = "Rain touched the window";

describe("Matter store committed lexical occurrences", () => {
  it("publishes an admission's attributed edits after the commit and its observation", () => {
    const calls: string[] = [];
    const published: MaterialLexicalOccurrencePublication[] = [];
    const store = createMatterStore("root", {
      materialLexical: attributedPort("spoken", "code x", "Codex"),
      humanAdmissionObservation: Object.freeze({
        observeCommitted: () => calls.push("observe"),
      }) satisfies MaterialLexicalObservationPort,
      lexicalOccurrences: recordingPort(published, (publication) => {
        calls.push("publish");
        // A consumer reads the committed tree, never an unfinished update.
        expect(store.getState().tree.nodes[publication.nodeId]?.updatedAt)
          .toBe(publication.nodeUpdatedAt);
      }),
    });
    const rootId = store.getState().tree.rootId!;

    expect(store.getState().admitHumanTranscript(childAnchor(store, rootId), {
      interactionId: "voice_occurrence",
      commandId: "human_admission_occurrence",
      nodeId: "voice_node_occurrence",
      createdAt: TIME,
      transcript: "we saw code x",
      expectedDocumentEpoch: 0,
      repairLocale: "en-US",
    })).toMatchObject({ status: "committed" });

    expect(calls).toEqual(["observe", "publish"]);
    expect(published).toEqual([{
      treeId: store.getState().tree.id,
      documentEpoch: 0,
      nodeId: "voice_node_occurrence",
      nodeUpdatedAt: TIME,
      stage: "admission",
      channel: "spoken",
      locale: "en-US",
      edits: [{ start: 7, end: 12, occurrence: "occ_1", sourceText: "code x" }],
    }]);
    const text = store.getState().tree.nodes.voice_node_occurrence!.text;
    expect(text.slice(7, 12)).toBe("Codex");
    // The heard form never enters observable state, history, or receipts.
    expect(JSON.stringify(store.getState())).not.toContain("code x");
  });

  it("publishes nothing for a rejected admission or an unattributed edit", () => {
    const published: MaterialLexicalOccurrencePublication[] = [];
    const store = createMatterStore("root", {
      materialLexical: attributedPort("spoken", "code x", "Codex", false),
      lexicalOccurrences: recordingPort(published),
    });
    const rootId = store.getState().tree.rootId!;

    expect(store.getState().admitHumanTranscript(childAnchor(store, rootId), {
      interactionId: "voice_unattributed",
      commandId: "human_admission_unattributed",
      nodeId: "voice_node_unattributed",
      createdAt: TIME,
      transcript: "code x helps",
      expectedDocumentEpoch: 0,
      repairLocale: "en-US",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().admitHumanTranscript(childAnchor(store, rootId), {
      interactionId: "voice_rejected",
      commandId: "human_admission_rejected",
      nodeId: "voice_node_rejected",
      createdAt: TIME,
      transcript: "code x again",
      expectedDocumentEpoch: 9,
      repairLocale: "en-US",
    })).toMatchObject({ status: "rejected" });
    expect(published).toEqual([]);
  });

  it("keeps a commit when the occurrence consumer throws", () => {
    const store = createMatterStore("root", {
      materialLexical: attributedPort("spoken", "code x", "Codex"),
      lexicalOccurrences: Object.freeze({
        publishCommitted: () => {
          throw new Error("presentation unavailable");
        },
      }),
    });
    const rootId = store.getState().tree.rootId!;
    expect(store.getState().admitHumanTranscript(childAnchor(store, rootId), {
      interactionId: "voice_throwing",
      commandId: "human_admission_throwing",
      nodeId: "voice_node_throwing",
      createdAt: TIME,
      transcript: "code x helps",
      expectedDocumentEpoch: 0,
      repairLocale: "en-US",
    })).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_throwing?.text).toBe("Codex helps.");
  });

  it("publishes a late repair's edits against the whole repaired node", () => {
    let nowMs = 100;
    const published: MaterialLexicalOccurrencePublication[] = [];
    const store = createMatterStore("root", {
      admissionRepair: judgeRepair,
      materialLexical: attributedPort("spoken", "code x", "Codex", true, "zh-CN"),
      lexicalOccurrences: recordingPort(published),
      monotonicNow: () => nowMs,
    });
    const rootId = store.getState().tree.rootId!;
    // The filler splits the form at admission; the repair floor joins it.
    const admission = store.getState().admitHumanTranscript(childAnchor(store, rootId), {
      interactionId: "voice_repair_occurrence",
      commandId: "human_admission_repair_occurrence",
      nodeId: "voice_node_repair",
      createdAt: TIME,
      transcript: "呃，我觉得 code 呃 x 可以",
      expectedDocumentEpoch: 0,
      admittedAtMs: 100,
      repairLocale: "zh-CN",
    });
    if (!("repairLeaseId" in admission)) throw new Error("repair lease missing");
    expect(published).toEqual([]);
    nowMs = 200;
    const floor = decorateSpokenExpression({
      text: repairAdmittedTranscriptWords(admission.admittedText, "zh-CN"),
      locale: "zh-CN",
      maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
      sampleSeed: "voice_repair_occurrence",
    });
    expect(store.getState().settleHumanTranscriptRepair({
      repairLeaseId: admission.repairLeaseId,
      outcome: "candidate",
      text: floor,
      source: "rules",
      createdAt: "2026-09-29T00:00:00.100Z",
    })).toMatchObject({ status: "committed" });

    const node = store.getState().tree.nodes.voice_node_repair!;
    expect(published).toEqual([{
      treeId: store.getState().tree.id,
      documentEpoch: 0,
      nodeId: "voice_node_repair",
      nodeUpdatedAt: node.updatedAt,
      stage: "repair",
      channel: "spoken",
      locale: "zh-CN",
      edits: [{
        start: node.text.indexOf("Codex"),
        end: node.text.indexOf("Codex") + 5,
        occurrence: "occ_1",
        sourceText: "code x",
      }],
    }]);
  });

  it("publishes a text-swap answer's edits in node coordinates", () => {
    const published: MaterialLexicalOccurrencePublication[] = [];
    const store = createMatterStore("root", {
      materialLexical: attributedPort("written", "glass", "the pane"),
      lexicalOccurrences: recordingPort(published),
    });
    const tree = englishTree("Opening words. ");
    store.getState().switchDocument(tree);
    const envelope = textSwapEnvelope(tree);

    expect(store.getState().commitTextSwap(
      envelope,
      buildTextSwapPlan(envelope, "Drops tapped against glass"),
      store.getState().documentEpoch,
      Date.parse("2026-09-29T00:00:01.000Z"),
    )).toMatchObject({ status: "committed" });
    const node = store.getState().tree.nodes.thought!;
    expect(node.text).toBe("Opening words. Drops tapped against the pane");
    expect(published).toEqual([{
      treeId: tree.id,
      documentEpoch: store.getState().documentEpoch,
      nodeId: "thought",
      nodeUpdatedAt: node.updatedAt,
      stage: "text-swap",
      channel: "written",
      locale: "en-US",
      edits: [{ start: 36, end: 44, occurrence: "occ_1", sourceText: "glass" }],
    }]);
  });

  it("restores a heard form as an undoable human change that Wiki cannot rewrite", () => {
    const published: MaterialLexicalOccurrencePublication[] = [];
    const store = createMatterStore("root", {
      materialLexical: attributedPort("spoken", "code x", "Codex"),
      lexicalOccurrences: recordingPort(published),
    });
    const rootId = store.getState().tree.rootId!;
    store.getState().admitHumanTranscript(childAnchor(store, rootId), {
      interactionId: "voice_restore",
      commandId: "human_admission_restore",
      nodeId: "voice_node_restore",
      createdAt: TIME,
      transcript: "we saw code x",
      expectedDocumentEpoch: 0,
      repairLocale: "en-US",
    });
    const [edit] = published[0]!.edits;
    const request = {
      commandId: "human_restore_store",
      treeId: store.getState().tree.id,
      nodeId: "voice_node_restore",
      expectedUpdatedAt: TIME,
      start: edit!.start,
      end: edit!.end,
      expectedText: "Codex",
      replacement: edit!.sourceText,
      createdAt: "2026-09-29T00:00:03.000Z",
    };

    expect(store.getState().restoreHumanTextRange({ ...request, expectedDocumentEpoch: 1 }))
      .toMatchObject({ status: "rejected", errorCode: "REVISION_CONFLICT" });
    expect(store.getState().restoreHumanTextRange({ ...request, expectedDocumentEpoch: 0 }))
      .toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_restore!.text).toBe("we saw code x.");
    expect(published).toHaveLength(1);
    expect(store.getState().undo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_restore!.text).toBe("we saw Codex.");
    expect(store.getState().redo()).toMatchObject({ status: "committed" });
    expect(store.getState().tree.nodes.voice_node_restore!.text).toBe("we saw code x.");
    // The same memento cannot be applied twice.
    expect(store.getState().restoreHumanTextRange({ ...request, expectedDocumentEpoch: 0 }))
      .toMatchObject({ status: "rejected" });
  });

  it("publishes an Elastic answer's generated-gap edits in node coordinates", () => {
    const published: MaterialLexicalOccurrencePublication[] = [];
    const store = createMatterStore("root", {
      materialLexical: attributedPort("written", "code x", "Codex"),
      lexicalOccurrences: recordingPort(published),
    });
    const tree = englishTree("Opening words. ");
    store.getState().switchDocument(tree);
    const envelope = transformEnvelope(tree);

    expect(store.getState().commitTransform(
      envelope,
      buildTransformPlan(envelope, `${PASSAGE} and code x`),
      store.getState().documentEpoch,
      Date.parse("2026-09-29T00:00:01.000Z"),
    )).toMatchObject({ status: "committed" });
    expect(published).toMatchObject([{
      stage: "transform",
      nodeId: "thought",
      edits: [{ start: 43, end: 48, sourceText: "code x" }],
    }]);
    expect(store.getState().tree.nodes.thought!.text.slice(43, 48)).toBe("Codex");
  });
});

function attributedPort(
  channel: WikiChannel,
  form: string,
  canonical: string,
  attributed = true,
  locale: MatterLocale = "en-US",
): MaterialLexicalPort {
  const state = applyWikiEvent(createEmptyWikiState(), {
    type: "confirm-rule",
    locale,
    channel,
    boundary: "word",
    form,
    canonical,
  });
  if (!state.ok) throw new Error(state.error.code);
  const compiled = compileWikiBasis(state.state, 5);
  if (!compiled.ok) throw new Error(compiled.error.code);
  let minted = 0;
  return createWikiMaterialLexicalPort(() => compiled.basis, () => canonicalizeWikiText, attributed
    ? { mintOccurrence: () => `occ_${++minted}` }
    : {});
}

function recordingPort(
  published: MaterialLexicalOccurrencePublication[],
  inspect?: (publication: MaterialLexicalOccurrencePublication) => void,
): MaterialLexicalOccurrencePort {
  return Object.freeze({
    publishCommitted: (publication: MaterialLexicalOccurrencePublication) => {
      inspect?.(publication);
      published.push(publication);
    },
  });
}

function childAnchor(store: ReturnType<typeof createMatterStore>, parentNodeId: string) {
  return {
    target: "child" as const,
    treeId: store.getState().tree.id,
    baseRevision: store.getState().tree.revision,
    parentNodeId,
  };
}

function englishTree(prefix: string): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_occurrences",
    rootId: "document",
    title: "Occurrences",
    revision: 4,
    nodes: {
      document: {
        id: "document",
        role: "document-root",
        text: "",
        parentId: null,
        children: ["thought"],
        createdAt: TIME,
        updatedAt: TIME,
      },
      thought: {
        id: "thought",
        text: `${prefix}${PASSAGE}`,
        parentId: "document",
        children: [],
        createdAt: TIME,
        updatedAt: TIME,
      },
    },
  };
}

function lineage(tree: ThoughtTree) {
  return [{
    id: "thought",
    text: tree.nodes.thought!.text,
    parentId: null,
    createdAt: TIME,
    updatedAt: TIME,
  }];
}

function selection(tree: ThoughtTree) {
  const start = tree.nodes.thought!.text.indexOf(PASSAGE);
  return {
    type: "segment-range" as const,
    nodeId: "thought",
    start,
    end: start + PASSAGE.length,
    selectedText: PASSAGE,
  };
}

function textSwapEnvelope(tree: ThoughtTree) {
  const parsed = parseTextSwapEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: "swap_occurrences",
    treeId: tree.id,
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: tree.revision,
    selection: selection(tree),
    direction: { text: "make it more tactile" },
    locale: "en-US",
    context: { lineage: lineage(tree) },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}

function transformEnvelope(tree: ThoughtTree) {
  const parsed = parseTransformEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TRANSFORM_REQUEST_VERSION,
    id: "transform_occurrences",
    treeId: tree.id,
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: tree.revision,
    selection: selection(tree),
    gesture: { type: "stretch", axis: "vertical", amount: 0.3 },
    locale: "en-US",
    context: { lineage: lineage(tree) },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}
