import { describe, expect, it } from "vitest";
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

  it("matches the normalized admission and revalidates canonical expansion", () => {
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
    })).toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
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

    expect(prepared).toMatchObject({
      ok: true,
      plan: { action: { text: `${PASSAGE} Codex` } },
      command: { mutation: { text: `${PASSAGE} Codex. Next` } },
      receipt: {
        stage: "transform",
        lexicalGeneration: 13,
        canonicalized: true,
        editCount: 1,
      },
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
    expect(prepared.plan).toEqual(rawPlan);
    expect(prepared.receipt).toEqual({
      stage: "text-swap",
      lexicalGeneration: 0,
      lexicalSourceRevision: 0,
      canonicalized: false,
      editCount: 0,
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

  it("rejects a canonicalized plan that no longer satisfies the contract", () => {
    const tree = textSwapTree();
    const envelope = textSwapEnvelope();
    const rawPlan = buildTextSwapPlan(envelope, "Rain tapped the window");

    expect(prepareTextSwapIngress({
      tree,
      envelope,
      rawPlan,
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
  return createWikiMaterialLexicalPort((): WikiBasis => compiled.basis).capture();
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

function transformEnvelope(): TransformEnvelope {
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
      start: 0,
      end: PASSAGE.length,
      selectedText: PASSAGE,
    },
    gesture: { type: "stretch", axis: "vertical", amount: 0.1 },
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
