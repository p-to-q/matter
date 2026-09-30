import { describe, expect, it } from "vitest";
import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import type { MatterLocale } from "../config/locales";
import {
  admissionToTreeCommand,
  createAdmissionAnchor,
  type AdmissionValues,
} from "../runtime/admission";
import { createNavigationState } from "../runtime/navigation";
import {
  TEXT_SWAP_REQUEST_VERSION,
  buildTextSwapPlan,
  parseTextSwapEnvelope,
  planToTextSwapCommand,
  type TextSwapEnvelope,
  type TextSwapPlan,
} from "../protocol/text-swap-contract";
import {
  TRANSFORM_REQUEST_VERSION,
  buildTransformPlan,
  parseTransformEnvelope,
  type TransformEnvelope,
} from "../protocol/transform-contract";
import { createEmptyTree } from "../tree/invariants";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import { compileWikiBasis, type WikiBasis } from "../wiki/wiki-basis";
import { applyWikiEvent, createEmptyWikiState } from "../wiki/wiki-evidence";
import type { WikiChannel } from "../wiki/wiki-model";
import {
  IDENTITY_MATERIAL_LEXICAL_SESSION,
  type MaterialLexicalSession,
} from "./material-lexical-port";
import { createWikiMaterialLexicalPort } from "./wiki-material-lexical-adapter";
import {
  prepareAdmissionIngress,
  prepareRepairIngress,
  prepareTransformIngress,
  prepareTextSwapIngress,
} from "./material-ingress";

const TIME = "2026-09-24T00:00:00.000Z";
const NOW_MS = Date.parse("2026-09-24T00:00:01.000Z");
const PASSAGE = "Rain touched the window";
const TEXT = `${PASSAGE}. Next`;

describe("MaterialIngress admission preparation", () => {
  it("is an identity boundary with an empty Wiki basis", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);
    const values = admissionValues("  an unfinished thought  ");

    const direct = admissionToTreeCommand(tree, navigation, anchored.anchor, values);
    const prepared = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values,
      locale: "en-US",
      lexicalSession: IDENTITY_MATERIAL_LEXICAL_SESSION,
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok || !direct.ok) return;
    expect(prepared.command).toEqual(direct.command);
    expect(prepared.admittedText).toBe("an unfinished thought.");
    expect(prepared.receipt).toEqual({
      stage: "admission",
      lexicalGeneration: 0,
      lexicalSourceRevision: 0,
      canonicalized: false,
      editCount: 0,
      canonicalizationWithheld: false,
      lexicalEdits: [],
    });
  });

  it("canonicalizes the spoken form before the existing admission dry-run", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const prepared = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("code x helps"),
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "code x", "Codex", 7),
    });

    expect(prepared).toMatchObject({
      ok: true,
      admittedText: "Codex helps.",
      command: { mutation: { root: { text: "Codex helps." } } },
      receipt: {
        stage: "admission",
        lexicalGeneration: 7,
        lexicalSourceRevision: 1,
        canonicalized: true,
        editCount: 1,
      },
    });
  });

  it("never applies an identical spoken form from another locale", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const prepared = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("code x helps"),
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "code x", "Codex", 7, "word", "de-DE"),
    });

    expect(prepared).toMatchObject({
      ok: true,
      admittedText: "code x helps.",
      receipt: { canonicalized: false, editCount: 0 },
    });
  });

  it("preserves the admission translator's stable rejection", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    expect(prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("   "),
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "blank", "Blank", 1),
    })).toEqual({
      ok: false,
      error: {
        code: "INVALID_ADMISSION_TRANSCRIPT",
        message: "Admission requires a non-empty transcript.",
      },
    });
  });

  it("never lets a shrinking Wiki rule rescue an oversized raw admission", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);
    const form = "a".repeat(64);

    expect(prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues(form.repeat(32)),
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", form, "x", 10, "literal"),
    })).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });

  it("matches the normalized admission and keeps spoken words when expansion breaks a bound", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const prepared = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("  code x  "),
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "code x", "Codex", 11),
    });
    expect(prepared).toMatchObject({ ok: true, admittedText: "Codex." });

    const raw = admissionToTreeCommand(tree, navigation, anchored.anchor, admissionValues("a ".repeat(16)));
    if (!raw.ok) throw new Error(raw.error.code);
    expect(prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("a ".repeat(16)),
      locale: "en-US",
      lexicalSession: confirmedSession(
        "spoken",
        "a",
        "x".repeat(128),
        12,
      ),
    })).toEqual({
      ok: true,
      command: raw.command,
      admittedText: `${"a ".repeat(15)}a.`,
      receipt: {
        stage: "admission",
        lexicalGeneration: 12,
        lexicalSourceRevision: 1,
        canonicalized: false,
        editCount: 0,
        canonicalizationWithheld: true,
        lexicalEdits: [],
      },
      lexicalOccurrences: null,
    });
  });
});

describe("MaterialIngress repair preparation", () => {
  it("uses the admission basis and revalidates one canonical repair command", () => {
    const tree = textSwapTree();
    const prepared = prepareRepairIngress({
      tree,
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "code x", "Codex", 8),
      values: {
        interactionId: "voice_repair_ingress",
        commandId: "repair_ingress",
        treeId: tree.id,
        nodeId: "thought",
        expectedText: TEXT,
        expectedUpdatedAt: TIME,
        text: "code x helps",
        createdAt: "2026-09-24T00:00:02.000Z",
        admittedAtMs: 100,
        settledAtMs: 200,
      },
    });

    expect(prepared).toMatchObject({
      ok: true,
      values: { text: "Codex helps" },
      command: { mutation: { text: "Codex helps" } },
      receipt: {
        stage: "repair",
        lexicalGeneration: 8,
        canonicalized: true,
        editCount: 1,
      },
    });
  });
});

describe("MaterialIngress repair fallback", () => {
  it("rejects a repair that only restores a spelling the Wiki replaced", () => {
    const tree = textSwapTree();
    expect(prepareRepairIngress({
      tree,
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "windo", "window", 16),
      values: {
        interactionId: "voice_repair_no_op",
        commandId: "repair_no_op",
        treeId: tree.id,
        nodeId: "thought",
        expectedText: TEXT,
        expectedUpdatedAt: TIME,
        text: TEXT.replace("window", "windo"),
        createdAt: "2026-09-24T00:00:02.000Z",
        admittedAtMs: 100,
        settledAtMs: 200,
      },
    })).toMatchObject({ ok: false, error: { code: "INVALID_REPAIR" } });
  });

  it("keeps the proven repair when canonicalization would break its bound", () => {
    const tree = textSwapTree();
    const values = {
      interactionId: "voice_repair_withheld",
      commandId: "repair_withheld",
      treeId: tree.id,
      nodeId: "thought",
      expectedText: TEXT,
      expectedUpdatedAt: TIME,
      text: "a ".repeat(16).trim(),
      createdAt: "2026-09-24T00:00:02.000Z",
      admittedAtMs: 100,
      settledAtMs: 200,
    };
    const prepared = prepareRepairIngress({
      tree,
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "a", "x".repeat(128), 14),
      values,
    });

    expect(prepared).toMatchObject({
      ok: true,
      values: { text: values.text },
      command: { mutation: { text: values.text } },
      receipt: { stage: "repair", canonicalized: false, canonicalizationWithheld: true },
    });
  });
});

describe("MaterialIngress transform preparation", () => {
  it("canonicalizes only generated gaps in the transform locale", () => {
    const tree = textSwapTree();
    const envelope = transformEnvelope();
    const rawPlan = buildTransformPlan(envelope, `${PASSAGE} code x`);

    const prepared = prepareTransformIngress({
      tree,
      envelope,
      rawPlan,
      lexicalSession: confirmedSession("written", "code x", "Codex", 13),
      source: "fixture",
      nowMs: NOW_MS,
    });

    // A turn prepares exactly one replacement of the passage it addressed.
    expect(prepared).toMatchObject({
      ok: true,
      plan: { action: { text: `${PASSAGE} Codex` } },
      command: {
        mutation: { type: "replace-text", nodeId: envelope.selection.nodeId, text: `${PASSAGE} Codex. Next` },
      },
      receipt: {
        stage: "transform",
        lexicalGeneration: 13,
        canonicalized: true,
        editCount: 1,
      },
    });
  });
});

describe("MaterialIngress transform fallback", () => {
  it("keeps the raw valid expansion when a canonical gap breaks its length band", () => {
    const tree = textSwapTree();
    const envelope = transformEnvelope();
    const rawPlan = buildTransformPlan(envelope, `${PASSAGE} code x`);

    const prepared = prepareTransformIngress({
      tree,
      envelope,
      rawPlan,
      lexicalSession: confirmedSession("written", "code x", "X".repeat(128), 15),
      source: "fixture",
      nowMs: NOW_MS,
    });

    expect(prepared).toMatchObject({
      ok: true,
      plan: { action: { text: `${PASSAGE} code x` } },
      command: { mutation: { text: `${PASSAGE} code x. Next` } },
      receipt: {
        stage: "transform",
        lexicalGeneration: 15,
        canonicalized: false,
        editCount: 0,
        canonicalizationWithheld: true,
        lexicalEdits: [],
      },
      lexicalOccurrences: null,
    });
  });
});

describe("MaterialIngress text-swap preparation", () => {
  it("is an identity boundary with an empty Wiki basis", () => {
    const tree = textSwapTree();
    const envelope = textSwapEnvelope();
    const rawPlan = buildTextSwapPlan(envelope, "Drops tapped against glass");
    const direct = planToTextSwapCommand(tree, envelope, rawPlan, {
      source: "fixture",
      now: () => NOW_MS,
    });

    const prepared = prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan,
      lexicalSession: IDENTITY_MATERIAL_LEXICAL_SESSION,
      source: "fixture",
      nowMs: NOW_MS,
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok || !direct.ok) return;
    expect(prepared.command).toEqual(direct.command);
    expect(prepared.command.mutation).toMatchObject({ type: "replace-text", nodeId: envelope.selection.nodeId });
    expect(prepared.plan).toEqual(rawPlan);
    expect(prepared.receipt).toEqual({
      stage: "text-swap",
      lexicalGeneration: 0,
      lexicalSourceRevision: 0,
      canonicalized: false,
      editCount: 0,
      canonicalizationWithheld: false,
      lexicalEdits: [],
    });
  });

  it("canonicalizes only after raw validation and revalidates the final plan", () => {
    const tree = textSwapTree();
    const originalTree = structuredClone(tree);
    const envelope = textSwapEnvelope();
    const rawPlan = buildTextSwapPlan(envelope, "Drops tapped against glass");

    const prepared = prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan,
      lexicalSession: confirmedSession("written", "glass", "the pane", 9),
      source: "fixture",
      nowMs: NOW_MS,
    });

    expect(prepared).toMatchObject({
      ok: true,
      plan: { action: { text: "Drops tapped against the pane" } },
      command: {
        mutation: { text: "Drops tapped against the pane. Next" },
      },
      receipt: {
        stage: "text-swap",
        lexicalGeneration: 9,
        lexicalSourceRevision: 1,
        canonicalized: true,
        editCount: 1,
      },
    });
    expect(rawPlan.action.text).toBe("Drops tapped against glass");
    expect(tree).toEqual(originalTree);
  });

  it("does not let canonicalization rescue a raw plan rejected by the contract", () => {
    const tree = textSwapTree();
    const envelope = textSwapEnvelope();
    const valid = buildTextSwapPlan(envelope, "Drops tapped against glass");
    const noChange = replacePlanText(valid, PASSAGE);

    expect(prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan: noChange,
      lexicalSession: confirmedSession("written", "window", "glass", 2),
      nowMs: NOW_MS,
    })).toEqual({ ok: false, reason: "INVALID_PLAN" });
  });

  it("keeps the raw valid answer when a canonical form pushes it past its length band", () => {
    const tree = textSwapTree();
    const envelope = textSwapEnvelope();
    const rawPlan = buildTextSwapPlan(envelope, "Drops tapped against glass");
    const direct = planToTextSwapCommand(tree, envelope, rawPlan, { now: () => NOW_MS });
    if (!direct.ok) throw new Error(direct.reason);

    expect(prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan,
      lexicalSession: confirmedSession("written", "glass", "the very old leaded window glass", 3),
      nowMs: NOW_MS,
    })).toEqual({
      ok: true,
      command: direct.command,
      plan: rawPlan,
      receipt: {
        stage: "text-swap",
        lexicalGeneration: 3,
        lexicalSourceRevision: 1,
        canonicalized: false,
        editCount: 0,
        canonicalizationWithheld: true,
        lexicalEdits: [],
      },
      lexicalOccurrences: null,
    });
  });

  it("rejects an answer that differs only by a spelling the Wiki forbids", () => {
    // Canonicalized, "Rain tapped the window" is the passage itself. Keeping
    // the raw answer would write exactly the form the person's rule replaces.
    const envelope = textSwapEnvelope();
    expect(prepareTextSwapIngress({
      tree: textSwapTree(),
      envelope,
      rawPlan: buildTextSwapPlan(envelope, "Rain tapped the window"),
      lexicalSession: confirmedSession("written", "tapped", "touched", 3),
      nowMs: NOW_MS,
    })).toEqual({ ok: false, reason: "INVALID_PLAN" });
  });

  it("rejects an invalid captured clock value without throwing", () => {
    const envelope = textSwapEnvelope();
    const rawPlan = buildTextSwapPlan(envelope, "Drops tapped against glass");

    expect(prepareTextSwapIngress({
      tree: textSwapTree(),
      envelope,
      rawPlan,
      lexicalSession: IDENTITY_MATERIAL_LEXICAL_SESSION,
      nowMs: Number.NaN,
    })).toEqual({ ok: false, reason: "INVALID_PLAN" });
  });
});

describe("MaterialIngress lexical attribution", () => {
  it("addresses an admission edit in the admitted node text, content-free in the receipt", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const prepared = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("  we saw code x twice, code x  "),
      locale: "en-US",
      lexicalSession: attributedSession("spoken", "code x", "Codex"),
    });

    if (!prepared.ok) throw new Error(prepared.error.code);
    expect(prepared.admittedText).toBe("we saw Codex twice, Codex.");
    expect(prepared.receipt.lexicalEdits).toEqual([
      { start: 7, end: 12, occurrence: "occ_1" },
      { start: 20, end: 25, occurrence: "occ_2" },
    ]);
    expect(JSON.stringify(prepared.receipt)).not.toContain("code x");
    expect(prepared.lexicalOccurrences).toEqual({
      channel: "spoken",
      locale: "en-US",
      nodeText: "we saw Codex twice, Codex.",
      edits: [
        { start: 7, end: 12, occurrence: "occ_1", sourceText: "code x" },
        { start: 20, end: 25, occurrence: "occ_2", sourceText: "code x" },
      ],
    });
    expectCommittedEdits(readCommandText(prepared.command), prepared.receipt.lexicalEdits, "Codex");
  });

  it("carries no lexical edits when canonicalization is withheld or unattributed", () => {
    const tree = createEmptyTree("tree_ingress");
    const navigation = createNavigationState();
    const anchored = createAdmissionAnchor(tree, navigation);
    if (!anchored.ok) throw new Error(anchored.error.code);

    const withheld = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("a ".repeat(16)),
      locale: "en-US",
      lexicalSession: attributedSession("spoken", "a", "x".repeat(128)),
    });
    expect(withheld).toMatchObject({
      ok: true,
      receipt: { canonicalizationWithheld: true, lexicalEdits: [] },
      lexicalOccurrences: null,
    });

    const unattributed = prepareAdmissionIngress({
      tree,
      navigation,
      anchor: anchored.anchor,
      values: admissionValues("code x helps"),
      locale: "en-US",
      lexicalSession: confirmedSession("spoken", "code x", "Codex", 7),
    });
    expect(unattributed).toMatchObject({
      ok: true,
      admittedText: "Codex helps.",
      receipt: { canonicalized: true, editCount: 1, lexicalEdits: [] },
      lexicalOccurrences: null,
    });
  });

  it("addresses a repair edit in the whole repaired node", () => {
    const prepared = prepareRepairIngress({
      tree: textSwapTree(),
      locale: "en-US",
      lexicalSession: attributedSession("spoken", "code x", "Codex"),
      values: {
        interactionId: "voice_repair_attribution",
        commandId: "repair_attribution",
        treeId: "tree_ingress",
        nodeId: "thought",
        expectedText: TEXT,
        expectedUpdatedAt: TIME,
        text: "Now code x helps",
        createdAt: "2026-09-24T00:00:02.000Z",
        admittedAtMs: 100,
        settledAtMs: 200,
      },
    });

    if (!prepared.ok) throw new Error(prepared.error.code);
    expect(prepared.receipt.lexicalEdits).toEqual([{ start: 4, end: 9, occurrence: "occ_1" }]);
    expect(prepared.lexicalOccurrences?.nodeText).toBe("Now Codex helps");
    expectCommittedEdits(readCommandText(prepared.command), prepared.receipt.lexicalEdits, "Codex");
  });

  it("canonicalizes the final node text only inside generated gaps", () => {
    const tree = transformTree("Opening words. ");
    const envelope = transformEnvelope(tree, 0.3);
    const prepared = prepareTransformIngress({
      tree,
      envelope,
      rawPlan: buildTransformPlan(envelope, `${PASSAGE} and code x`),
      lexicalSession: attributedSession("written", ["touched", "code x"], ["brushed", "Codex"]),
      source: "fixture",
      nowMs: NOW_MS,
    });

    if (!prepared.ok) throw new Error(prepared.reason);
    // The carried source "touched" stays; only the generated gap changes.
    const nodeText = "Opening words. Rain touched the window and Codex";
    expect(readCommandText(prepared.command)).toBe(nodeText);
    expect(prepared.plan.action.text).toBe(`${PASSAGE} and Codex`);
    expect(prepared.receipt.lexicalEdits).toEqual([{ start: 43, end: 48, occurrence: "occ_1" }]);
    expect(prepared.lexicalOccurrences?.edits.map((edit) => edit.sourceText)).toEqual(["code x"]);
    expect(prepared.lexicalOccurrences?.nodeText).toBe(nodeText);
    expectCommittedEdits(nodeText, prepared.receipt.lexicalEdits, "Codex");
  });

  it("addresses a text-swap segment answer at its node offset", () => {
    const tree = transformTree("Opening words. ");
    const envelope = segmentTextSwapEnvelope(tree);
    const prepared = prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan: buildTextSwapPlan(envelope, "Drops tapped against glass"),
      lexicalSession: attributedSession("written", "glass", "the pane"),
      source: "fixture",
      nowMs: NOW_MS,
    });

    if (!prepared.ok) throw new Error(prepared.reason);
    expect(readCommandText(prepared.command)).toBe("Opening words. Drops tapped against the pane");
    expect(prepared.receipt.lexicalEdits).toEqual([{ start: 36, end: 44, occurrence: "occ_1" }]);
    expect(prepared.lexicalOccurrences).toMatchObject({
      channel: "written",
      locale: "en-US",
      edits: [{ start: 36, end: 44, sourceText: "glass" }],
    });
    expectCommittedEdits(readCommandText(prepared.command), prepared.receipt.lexicalEdits, "the pane");
  });

  it("addresses a whole-node text-swap answer from offset zero", () => {
    const tree = textSwapTree();
    const envelope = textSwapEnvelope();
    const prepared = prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan: buildTextSwapPlan(envelope, "Drops tapped against glass"),
      lexicalSession: attributedSession("written", "glass", "the pane"),
      source: "fixture",
      nowMs: NOW_MS,
    });

    if (!prepared.ok) throw new Error(prepared.reason);
    expect(prepared.receipt.lexicalEdits).toEqual([{ start: 21, end: 29, occurrence: "occ_1" }]);
    expectCommittedEdits(readCommandText(prepared.command), prepared.receipt.lexicalEdits, "the pane");
  });
});

function attributedSession(
  channel: WikiChannel,
  form: string | readonly string[],
  canonical: string | readonly string[],
): MaterialLexicalSession {
  const forms = typeof form === "string" ? [form] : form;
  const canonicals = typeof canonical === "string" ? [canonical] : canonical;
  let state = createEmptyWikiState();
  forms.forEach((entry, index) => {
    const next = applyWikiEvent(state, {
      type: "confirm-rule",
      locale: "en-US",
      channel,
      boundary: "word",
      form: entry,
      canonical: canonicals[index]!,
    });
    if (!next.ok) throw new Error(next.error.code);
    state = next.state;
  });
  const compiled = compileWikiBasis(state, 21);
  if (!compiled.ok) throw new Error(compiled.error.code);
  let minted = 0;
  return createWikiMaterialLexicalPort((): WikiBasis => compiled.basis, () => canonicalizeWikiText, {
    mintOccurrence: () => `occ_${++minted}`,
  }).capture();
}

function readCommandText(command: { mutation: { type: string } }): string {
  const mutation = command.mutation as {
    type: string;
    text?: string;
    root?: { text: string };
    node?: { text: string };
  };
  const text = mutation.text ?? mutation.root?.text ?? mutation.node?.text;
  if (text === undefined) throw new Error(`unexpected ${mutation.type}`);
  return text;
}

function expectCommittedEdits(
  nodeText: string,
  edits: readonly { start: number; end: number }[],
  canonical: string,
): void {
  for (const edit of edits) expect(nodeText.slice(edit.start, edit.end)).toBe(canonical);
}

function transformTree(prefix: string): ThoughtTree {
  const tree = textSwapTree();
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      thought: { ...tree.nodes.thought!, text: `${prefix}${PASSAGE}` },
    },
  };
}

function transformEnvelope(tree?: ThoughtTree, amount = 0.1): TransformEnvelope {
  const text = tree?.nodes.thought?.text ?? TEXT;
  const start = text.indexOf(PASSAGE);
  const parsed = parseTransformEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TRANSFORM_REQUEST_VERSION,
    id: "transform_ingress",
    treeId: "tree_ingress",
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: 4,
    selection: {
      type: "segment-range",
      nodeId: "thought",
      start,
      end: start + PASSAGE.length,
      selectedText: PASSAGE,
    },
    gesture: { type: "stretch", axis: "vertical", amount },
    locale: "en-US",
    context: {
      lineage: [{
        id: "thought",
        text,
        parentId: null,
        createdAt: TIME,
        updatedAt: TIME,
      }],
    },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}

function segmentTextSwapEnvelope(tree: ThoughtTree): TextSwapEnvelope {
  const text = tree.nodes.thought!.text;
  const start = text.indexOf(PASSAGE);
  const parsed = parseTextSwapEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: "swap_ingress_segment",
    treeId: "tree_ingress",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: 4,
    selection: {
      type: "segment-range",
      nodeId: "thought",
      start,
      end: start + PASSAGE.length,
      selectedText: PASSAGE,
    },
    direction: { text: "make it more tactile" },
    locale: "en-US",
    context: {
      lineage: [{
        id: "thought",
        text,
        parentId: null,
        createdAt: TIME,
        updatedAt: TIME,
      }],
    },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}

function admissionValues(transcript: string): AdmissionValues {
  return {
    interactionId: "voice_ingress",
    commandId: "admit_ingress",
    nodeId: "material_ingress",
    createdAt: TIME,
    transcript,
  };
}

function confirmedSession(
  channel: WikiChannel,
  form: string,
  canonical: string,
  generation: number,
  boundary: "literal" | "word" = "word",
  locale: MatterLocale = "en-US",
): MaterialLexicalSession {
  const state = applyWikiEvent(createEmptyWikiState(), {
    type: "confirm-rule",
    locale,
    channel,
    boundary,
    form,
    canonical,
  });
  if (!state.ok) throw new Error(state.error.code);
  const compiled = compileWikiBasis(state.state, generation);
  if (!compiled.ok) throw new Error(compiled.error.code);
  return createWikiMaterialLexicalPort((): WikiBasis => compiled.basis, () => canonicalizeWikiText).capture();
}

function textSwapEnvelope(): TextSwapEnvelope {
  const parsed = parseTextSwapEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    requestVersion: TEXT_SWAP_REQUEST_VERSION,
    id: "swap_ingress",
    treeId: "tree_ingress",
    mode: "transform",
    operation: "paraphrase-in-place",
    treeRevision: 4,
    selection: {
      type: "segment-range",
      nodeId: "thought",
      start: 0,
      end: PASSAGE.length,
      selectedText: PASSAGE,
    },
    direction: { text: "make it more tactile" },
    locale: "en-US",
    context: {
      lineage: [{
        id: "thought",
        text: TEXT,
        parentId: null,
        createdAt: TIME,
        updatedAt: TIME,
      }],
    },
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.envelope;
}


function textSwapTree(): ThoughtTree {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: "tree_ingress",
    rootId: "document",
    title: "Material ingress",
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
        text: TEXT,
        parentId: "document",
        children: [],
        createdAt: TIME,
        updatedAt: TIME,
      },
    },
  };
}

function replacePlanText(plan: TextSwapPlan, text: string): TextSwapPlan {
  return {
    ...plan,
    action: { ...plan.action, text },
  };
}
