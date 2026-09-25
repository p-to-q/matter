import {
  admissionToTreeCommand,
  type AdmissionAnchor,
  type AdmissionCommandResult,
  type AdmissionError,
  type AdmissionValues,
} from "../runtime/admission";
import type { NavigationState } from "../runtime/navigation";
import {
  admissionRepairToTreeCommand,
  type AdmissionRepairError,
  type AdmissionRepairValues,
} from "../runtime/admission-repair";
import {
  parseTextSwapEnvelope,
  parseTextSwapPlan,
  planToTextSwapCommand,
  type TextSwapCommandResult,
  type TextSwapEnvelope,
  type TextSwapPlan,
} from "../protocol/text-swap-contract";
import type { ThoughtTree, TreeCommand } from "../tree/model";
import {
  canonicalizeMaterialText,
  type MaterialLexicalResult,
  type MaterialLexicalSession,
} from "./material-lexical-port";
import {
  parseTransformEnvelope,
  parseTransformPlan,
  planToTreeCommand,
  type TransformCommandResult,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import { projectExpandGeneratedRanges } from "../protocol/expand-in-place-policy";
import type { MatterLocale } from "../config/locales";

export type MaterialIngressStage = "admission" | "repair" | "transform" | "text-swap";

/** Content-free evidence that one immutable lexical session was used. */
export type MaterialIngressReceipt = Readonly<{
  stage: MaterialIngressStage;
  lexicalGeneration: number;
  lexicalSourceRevision: number;
  canonicalized: boolean;
  editCount: number;
}>;

export type PrepareAdmissionInput = Readonly<{
  tree: ThoughtTree;
  navigation: NavigationState;
  anchor: AdmissionAnchor;
  values: AdmissionValues;
  locale: MatterLocale;
  lexicalSession: MaterialLexicalSession;
}>;

export type PreparedAdmission = Readonly<{
  ok: true;
  command: TreeCommand;
  admittedText: string;
  receipt: MaterialIngressReceipt;
}>;

export type PrepareAdmissionResult =
  | PreparedAdmission
  | Readonly<{ ok: false; error: AdmissionError }>;

export type PrepareRepairInput = Readonly<{
  tree: ThoughtTree;
  values: AdmissionRepairValues;
  locale: MatterLocale;
  lexicalSession: MaterialLexicalSession;
}>;

export type PreparedRepair = Readonly<{
  ok: true;
  command: TreeCommand;
  values: AdmissionRepairValues;
  receipt: MaterialIngressReceipt;
}>;

export type PrepareRepairResult =
  | PreparedRepair
  | Readonly<{ ok: false; error: AdmissionRepairError }>;

export type PrepareTextSwapInput = Readonly<{
  tree: ThoughtTree;
  envelope: TextSwapEnvelope;
  rawPlan: unknown;
  lexicalSession: MaterialLexicalSession;
  source?: "agent" | "fixture";
  /** Captured once by the lifecycle owner; this pure layer never reads a clock. */
  nowMs: number;
}>;

export type PreparedTextSwap = Readonly<{
  ok: true;
  command: TreeCommand;
  plan: TextSwapPlan;
  receipt: MaterialIngressReceipt;
}>;

export type PrepareTextSwapResult =
  | PreparedTextSwap
  | Extract<TextSwapCommandResult, { ok: false }>;

export type PrepareTransformInput = Readonly<{
  tree: ThoughtTree;
  envelope: TransformEnvelope;
  rawPlan: unknown;
  lexicalSession: MaterialLexicalSession;
  source?: "agent" | "fixture";
  nowMs: number;
}>;

export type PreparedTransform = Readonly<{
  ok: true;
  command: TreeCommand;
  plan: TransformPlan;
  receipt: MaterialIngressReceipt;
}>;

export type PrepareTransformResult =
  | PreparedTransform
  | Extract<TransformCommandResult, { ok: false }>;

/**
 * Prepares human material without committing it. The caller remains the owner
 * of interaction validity, history, publication, and persistence.
 */
export function prepareAdmissionIngress(
  input: PrepareAdmissionInput,
): PrepareAdmissionResult {
  // Lexical authority cannot rescue or make cheap an invalid source. The first
  // translation also fixes the normalized material text that matching sees.
  const raw = admissionToTreeCommand(
    input.tree,
    input.navigation,
    input.anchor,
    input.values,
  );
  if (!raw.ok) return raw;
  const rawAdmittedText = readAdmissionText(raw);
  if (rawAdmittedText === null) return unsupportedAdmission();

  const canonical = canonicalizeMaterialText(input.lexicalSession, {
    locale: input.locale,
    channel: "spoken",
    text: rawAdmittedText,
  });
  if (!canonical.changed) {
    return Object.freeze({
      ok: true,
      command: raw.command,
      admittedText: rawAdmittedText,
      receipt: createReceipt("admission", input.lexicalSession, canonical),
    });
  }
  const translated = admissionToTreeCommand(
    input.tree,
    input.navigation,
    input.anchor,
    { ...input.values, transcript: canonical.text },
  );
  if (!translated.ok) return translated;

  const admittedText = readAdmissionText(translated);
  if (admittedText === null) {
    return unsupportedAdmission();
  }

  return Object.freeze({
    ok: true,
    command: translated.command,
    admittedText,
    receipt: createReceipt("admission", input.lexicalSession, canonical),
  });
}

/** Applies the admission-time lexical session to a proven repair, then validates again. */
export function prepareRepairIngress(input: PrepareRepairInput): PrepareRepairResult {
  const raw = admissionRepairToTreeCommand(input.tree, input.values);
  if (!raw.ok) return raw;
  const canonical = canonicalizeMaterialText(input.lexicalSession, {
    locale: input.locale,
    channel: "spoken",
    text: input.values.text,
  });
  if (!canonical.changed) {
    return Object.freeze({
      ok: true,
      command: raw.command,
      values: input.values,
      receipt: createReceipt("repair", input.lexicalSession, canonical),
    });
  }
  const values = Object.freeze({ ...input.values, text: canonical.text });
  const final = admissionRepairToTreeCommand(input.tree, values);
  if (!final.ok) return final;
  return Object.freeze({
    ok: true,
    command: final.command,
    values,
    receipt: createReceipt("repair", input.lexicalSession, canonical),
  });
}

/** Protects all source lexical spans and canonicalizes generated gaps only. */
export function prepareTransformIngress(
  input: PrepareTransformInput,
): PrepareTransformResult {
  if (!isValidEpochMilliseconds(input.nowMs)) return rejectedTransform();
  const options = Object.freeze({
    source: input.source,
    now: () => input.nowMs,
  });
  const raw = planToTreeCommand(input.tree, input.envelope, input.rawPlan, options);
  if (!raw.ok) return raw;
  const parsedEnvelope = parseTransformEnvelope(input.envelope);
  if (!parsedEnvelope.ok) return rejectedTransform();
  const parsedPlan = parseTransformPlan(input.rawPlan, parsedEnvelope.envelope);
  if (parsedPlan === null) return rejectedTransform();
  const eligibleRanges = projectExpandGeneratedRanges(
    parsedEnvelope.envelope.selection.selectedText,
    parsedPlan.action.text,
  );
  if (eligibleRanges === null) return rejectedTransform();
  const canonical = canonicalizeMaterialText(input.lexicalSession, {
    locale: parsedEnvelope.envelope.locale,
    channel: "written",
    text: parsedPlan.action.text,
    eligibleRanges,
  });
  const finalPlan = canonical.changed
    ? replaceTransformPlanText(parsedPlan, canonical.text)
    : parsedPlan;
  const final = planToTreeCommand(
    input.tree,
    parsedEnvelope.envelope,
    finalPlan,
    options,
  );
  if (!final.ok) return final;
  return Object.freeze({
    ok: true,
    command: final.command,
    plan: finalPlan,
    receipt: createReceipt("transform", input.lexicalSession, canonical),
  });
}

function unsupportedAdmission(): Readonly<{ ok: false; error: AdmissionError }> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: "INVALID_INTERACTION",
      message: "Admission produced an unsupported material mutation.",
    }),
  });
}

/**
 * Validates provider output before and after local canonicalization, then
 * returns one command for the tree engine. This function cannot commit it.
 */
export function prepareTextSwapIngress(
  input: PrepareTextSwapInput,
): PrepareTextSwapResult {
  if (!isValidEpochMilliseconds(input.nowMs)) return rejectedTextSwap();
  const options = Object.freeze({
    source: input.source,
    now: () => input.nowMs,
  });

  // A lexical rule cannot rescue provider output the frozen contract rejects.
  const raw = planToTextSwapCommand(
    input.tree,
    input.envelope,
    input.rawPlan,
    options,
  );
  if (!raw.ok) return raw;

  const parsedEnvelope = parseTextSwapEnvelope(input.envelope);
  if (!parsedEnvelope.ok) return rejectedTextSwap();
  const parsedPlan = parseTextSwapPlan(input.rawPlan, parsedEnvelope.envelope);
  if (parsedPlan === null) return rejectedTextSwap();

  const canonical = canonicalizeMaterialText(input.lexicalSession, {
    locale: parsedEnvelope.envelope.locale,
    channel: "written",
    text: parsedPlan.action.text,
  });
  const finalPlan = canonical.changed
    ? replaceTextSwapPlanText(parsedPlan, canonical.text)
    : parsedPlan;

  const final = planToTextSwapCommand(
    input.tree,
    parsedEnvelope.envelope,
    finalPlan,
    options,
  );
  if (!final.ok) return final;

  return Object.freeze({
    ok: true,
    command: final.command,
    plan: finalPlan,
    receipt: createReceipt("text-swap", input.lexicalSession, canonical),
  });
}

function readAdmissionText(result: Extract<AdmissionCommandResult, { ok: true }>): string | null {
  const mutation = result.command.mutation;
  if (mutation.type === "initialize-root") return mutation.root.text;
  if (mutation.type === "insert-node") return mutation.node.text;
  return null;
}

function replaceTextSwapPlanText(plan: TextSwapPlan, text: string): TextSwapPlan {
  return Object.freeze({
    ...plan,
    action: Object.freeze({ ...plan.action, text }),
  });
}

function replaceTransformPlanText(plan: TransformPlan, text: string): TransformPlan {
  return Object.freeze({
    ...plan,
    action: Object.freeze({ ...plan.action, text }),
  });
}

function createReceipt(
  stage: MaterialIngressStage,
  session: MaterialLexicalSession,
  canonical: MaterialLexicalResult,
): MaterialIngressReceipt {
  return Object.freeze({
    stage,
    lexicalGeneration: session.snapshot.generation,
    lexicalSourceRevision: session.snapshot.sourceRevision,
    canonicalized: canonical.changed,
    editCount: canonical.editCount,
  });
}

function isValidEpochMilliseconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

function rejectedTextSwap(): Extract<TextSwapCommandResult, { ok: false }> {
  return Object.freeze({ ok: false, reason: "INVALID_PLAN" });
}

function rejectedTransform(): Extract<TransformCommandResult, { ok: false }> {
  return Object.freeze({ ok: false, reason: "INVALID_PLAN" });
}
