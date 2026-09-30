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
import type { ThoughtTree, TreeCommand, TreeMutation } from "../tree/model";
import {
  canonicalizeMaterialText,
  type MaterialLexicalChannel,
  type MaterialLexicalOccurrenceEdit,
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

/** Where one attributed lexical edit landed in the committed node text. */
export type MaterialIngressLexicalEdit = Readonly<{
  start: number;
  end: number;
  occurrence: string;
}>;

/**
 * Content-free evidence that one immutable lexical session was used.
 * `canonicalizationWithheld` records that proposed edits made an otherwise
 * valid result invalid, so the raw validated result was kept instead; it then
 * carries no lexical edits. `lexicalEdits` lists only attributed edits, in the
 * coordinates of the node text the command commits.
 */
export type MaterialIngressReceipt = Readonly<{
  stage: MaterialIngressStage;
  lexicalGeneration: number;
  lexicalSourceRevision: number;
  canonicalized: boolean;
  editCount: number;
  canonicalizationWithheld: boolean;
  lexicalEdits: readonly MaterialIngressLexicalEdit[];
}>;

/**
 * The content half of an attributed canonicalization, for the one transient
 * publication after commit. `nodeText` is the exact node text the coordinates
 * address; a caller publishes only when the committed node still equals it.
 */
export type MaterialLexicalOccurrences = Readonly<{
  channel: MaterialLexicalChannel;
  locale: MatterLocale;
  nodeText: string;
  edits: readonly MaterialLexicalOccurrenceEdit[];
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
  /** Transient content for the committed-occurrence publication; never stored. */
  lexicalOccurrences: MaterialLexicalOccurrences | null;
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
  /** Transient content for the committed-occurrence publication; never stored. */
  lexicalOccurrences: MaterialLexicalOccurrences | null;
}>;

export type PrepareRepairResult =
  | PreparedRepair
  | Readonly<{ ok: false; error: AdmissionRepairError }>;

/**
 * The only material a delivered turn may commit: one exact text replacement
 * of the passage its envelope addressed.
 */
export type TextReplacementCommand = TreeCommand & Readonly<{
  mutation: Extract<TreeMutation, { type: "replace-text" }>;
}>;

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
  command: TextReplacementCommand;
  plan: TextSwapPlan;
  receipt: MaterialIngressReceipt;
  /** Transient content for the committed-occurrence publication; never stored. */
  lexicalOccurrences: MaterialLexicalOccurrences | null;
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
  command: TextReplacementCommand;
  plan: TransformPlan;
  receipt: MaterialIngressReceipt;
  /** Transient content for the committed-occurrence publication; never stored. */
  lexicalOccurrences: MaterialLexicalOccurrences | null;
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
      receipt: createReceipt("admission", input.lexicalSession, canonical, null),
      lexicalOccurrences: null,
    });
  }
  const translated = admissionToTreeCommand(
    input.tree,
    input.navigation,
    input.anchor,
    { ...input.values, transcript: canonical.text },
  );
  const admittedText = translated.ok ? readAdmissionText(translated) : null;
  if (!translated.ok || admittedText === null) {
    // A spelling rule never costs the person their spoken words.
    return Object.freeze({
      ok: true,
      command: raw.command,
      admittedText: rawAdmittedText,
      receipt: withheldReceipt("admission", input.lexicalSession),
      lexicalOccurrences: null,
    });
  }

  // Admission normalizes its transcript again. Edits address the admitted
  // node only when that second pass left the canonical text untouched.
  const occurrences = admittedText === canonical.text
    ? attributeOccurrences("spoken", input.locale, admittedText, canonical, 0)
    : null;
  return Object.freeze({
    ok: true,
    command: translated.command,
    admittedText,
    receipt: createReceipt("admission", input.lexicalSession, canonical, occurrences),
    lexicalOccurrences: occurrences,
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
      receipt: createReceipt("repair", input.lexicalSession, canonical, null),
      lexicalOccurrences: null,
    });
  }
  const values = Object.freeze({ ...input.values, text: canonical.text });
  const final = admissionRepairToTreeCommand(input.tree, values);
  // A canonical repair equal to the admitted text changes nothing the Wiki
  // allows; committing the raw form would reintroduce the forbidden spelling.
  if (!final.ok && canonical.text === input.values.expectedText) return final;
  if (!final.ok) {
    return Object.freeze({
      ok: true,
      command: raw.command,
      values: input.values,
      receipt: withheldReceipt("repair", input.lexicalSession),
      lexicalOccurrences: null,
    });
  }
  // A repair replaces the whole node, so its output coordinates are the node's.
  const occurrences = attributeOccurrences(
    "spoken",
    input.locale,
    replacedText(final.command),
    canonical,
    0,
  );
  return Object.freeze({
    ok: true,
    command: final.command,
    values,
    receipt: createReceipt("repair", input.lexicalSession, canonical, occurrences),
    lexicalOccurrences: occurrences,
  });
}

/**
 * Canonicalizes the complete final node text, but only inside the gaps proven
 * to be newly generated. Matching therefore sees the real neighbouring
 * language and protected literals while source-carried spans stay untouched.
 */
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
  const nodeId = parsedEnvelope.envelope.selection.nodeId;
  const rawCommand = raw.command;
  if (!isAddressedReplacement(rawCommand, nodeId)) return rejectedTransform();
  const parsedPlan = parseTransformPlan(input.rawPlan, parsedEnvelope.envelope);
  if (parsedPlan === null) return rejectedTransform();
  const generatedRanges = projectExpandGeneratedRanges(
    parsedEnvelope.envelope.selection.selectedText,
    parsedPlan.action.text,
  );
  const rawText = replacedText(raw.command);
  const actionStart = parsedPlan.action.start;
  const actionEnd = actionStart + parsedPlan.action.text.length;
  // A valid answer whose generated gaps cannot be proven keeps its raw form.
  if (
    generatedRanges === null ||
    rawText === null ||
    rawText.slice(actionStart, actionEnd) !== parsedPlan.action.text
  ) return withheldTransform(rawCommand, parsedPlan, input.lexicalSession);
  const canonical = canonicalizeMaterialText(input.lexicalSession, {
    locale: parsedEnvelope.envelope.locale,
    channel: "written",
    text: rawText,
    eligibleRanges: generatedRanges.map((range) => Object.freeze({
      start: actionStart + range.start,
      end: actionStart + range.end,
    })),
  });
  if (!canonical.changed) {
    return Object.freeze({
      ok: true,
      command: rawCommand,
      plan: parsedPlan,
      receipt: createReceipt("transform", input.lexicalSession, canonical, null),
      lexicalOccurrences: null,
    });
  }
  const suffixLength = rawText.length - actionEnd;
  const canonicalAction = canonical.text.slice(actionStart, canonical.text.length - suffixLength);
  if (
    canonical.text.slice(0, actionStart) !== rawText.slice(0, actionStart) ||
    canonical.text.slice(canonical.text.length - suffixLength) !== rawText.slice(actionEnd) ||
    canonicalAction.length === 0
  ) {
    // Eligible ranges sit inside the answer, so this cannot happen for a
    // coherent suggestion; an incoherent one is only withheld.
    return withheldTransform(rawCommand, parsedPlan, input.lexicalSession);
  }
  const finalPlan = replaceTransformPlanText(parsedPlan, canonicalAction);
  const final = planToTreeCommand(
    input.tree,
    parsedEnvelope.envelope,
    finalPlan,
    options,
  );
  if (!final.ok && canonicalAction === parsedEnvelope.envelope.selection.selectedText) {
    return final;
  }
  if (!final.ok) {
    // Local spelling authority may refine a valid answer, never cost it. Only
    // a real change that a canonical form pushes past a bound or policy keeps
    // its validated raw form.
    return withheldTransform(rawCommand, parsedPlan, input.lexicalSession);
  }
  const finalCommand = final.command;
  if (!isAddressedReplacement(finalCommand, nodeId)) return rejectedTransform();
  const occurrences = attributeOccurrences(
    "written",
    parsedEnvelope.envelope.locale,
    finalCommand.mutation.text,
    canonical,
    0,
  );
  return Object.freeze({
    ok: true,
    command: finalCommand,
    plan: finalPlan,
    receipt: createReceipt("transform", input.lexicalSession, canonical, occurrences),
    lexicalOccurrences: occurrences,
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
  const nodeId = parsedEnvelope.envelope.selection.nodeId;
  const rawCommand = raw.command;
  if (!isAddressedReplacement(rawCommand, nodeId)) return rejectedTextSwap();
  const parsedPlan = parseTextSwapPlan(input.rawPlan, parsedEnvelope.envelope);
  if (parsedPlan === null) return rejectedTextSwap();

  const canonical = canonicalizeMaterialText(input.lexicalSession, {
    locale: parsedEnvelope.envelope.locale,
    channel: "written",
    text: parsedPlan.action.text,
  });
  if (!canonical.changed) {
    return Object.freeze({
      ok: true,
      command: rawCommand,
      plan: parsedPlan,
      receipt: createReceipt("text-swap", input.lexicalSession, canonical, null),
      lexicalOccurrences: null,
    });
  }
  const finalPlan = replaceTextSwapPlanText(parsedPlan, canonical.text);
  const final = planToTextSwapCommand(
    input.tree,
    parsedEnvelope.envelope,
    finalPlan,
    options,
  );
  // An answer that differs only by spellings the person's Wiki forbids is no
  // change at all; withholding would commit exactly the forbidden form.
  if (!final.ok && canonical.text === parsedEnvelope.envelope.selection.selectedText) {
    return final;
  }
  if (!final.ok) {
    // Local spelling authority may refine a valid answer, never cost it.
    return Object.freeze({
      ok: true,
      command: rawCommand,
      plan: parsedPlan,
      receipt: withheldReceipt("text-swap", input.lexicalSession),
      lexicalOccurrences: null,
    });
  }
  const finalCommand = final.command;
  if (!isAddressedReplacement(finalCommand, nodeId)) return rejectedTextSwap();

  // The answer replaces one exact segment or the complete node at its start.
  const occurrences = attributeOccurrences(
    "written",
    parsedEnvelope.envelope.locale,
    replacedText(final.command),
    canonical,
    finalPlan.action.start,
  );
  return Object.freeze({
    ok: true,
    command: finalCommand,
    plan: finalPlan,
    receipt: createReceipt("text-swap", input.lexicalSession, canonical, occurrences),
    lexicalOccurrences: occurrences,
  });
}

/**
 * A turn's contract may only replace the text of the passage it addressed.
 * Anything else is refused here, before the store is asked to commit it.
 */
function isAddressedReplacement(command: TreeCommand, nodeId: string): command is TextReplacementCommand {
  return command.mutation.type === "replace-text" && command.mutation.nodeId === nodeId;
}

function readAdmissionText(result: Extract<AdmissionCommandResult, { ok: true }>): string | null {
  const mutation = result.command.mutation;
  if (mutation.type === "initialize-root") return mutation.root.text;
  if (mutation.type === "insert-node") return mutation.node.text;
  return null;
}

function replacedText(command: TreeCommand): string | null {
  return command.mutation.type === "replace-text" ? command.mutation.text : null;
}

/**
 * Maps attributed edits from canonical output coordinates into node text.
 * Every edit must land exactly on its canonical form in `nodeText`; any
 * disagreement drops all attribution rather than address the wrong word.
 */
function attributeOccurrences(
  channel: MaterialLexicalChannel,
  locale: MatterLocale,
  nodeText: string | null,
  canonical: MaterialLexicalResult,
  offset: number,
): MaterialLexicalOccurrences | null {
  if (nodeText === null || !Number.isSafeInteger(offset) || offset < 0) return null;
  const edits: MaterialLexicalOccurrenceEdit[] = [];
  for (const edit of canonical.edits) {
    if (edit.occurrence === undefined) continue;
    const start = offset + edit.start;
    const end = offset + edit.end;
    if (
      end <= start ||
      end > nodeText.length ||
      nodeText.slice(start, end) !== canonical.text.slice(edit.start, edit.end)
    ) return null;
    // Nothing visibly changed, so there is nothing to disclose or to settle.
    if (edit.sourceText === nodeText.slice(start, end)) continue;
    edits.push(Object.freeze({
      start,
      end,
      occurrence: edit.occurrence,
      sourceText: edit.sourceText,
    }));
  }
  return edits.length === 0
    ? null
    : Object.freeze({ channel, locale, nodeText, edits: Object.freeze(edits) });
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

function withheldTransform(
  command: TextReplacementCommand,
  plan: TransformPlan,
  session: MaterialLexicalSession,
): PreparedTransform {
  return Object.freeze({
    ok: true,
    command,
    plan,
    receipt: withheldReceipt("transform", session),
    lexicalOccurrences: null,
  });
}

const NO_LEXICAL_EDITS: readonly MaterialIngressLexicalEdit[] = Object.freeze([]);

function createReceipt(
  stage: MaterialIngressStage,
  session: MaterialLexicalSession,
  canonical: MaterialLexicalResult,
  occurrences: MaterialLexicalOccurrences | null,
): MaterialIngressReceipt {
  return Object.freeze({
    stage,
    lexicalGeneration: session.snapshot.generation,
    lexicalSourceRevision: session.snapshot.sourceRevision,
    canonicalized: canonical.changed,
    editCount: canonical.editCount,
    canonicalizationWithheld: false,
    lexicalEdits: occurrences === null
      ? NO_LEXICAL_EDITS
      : Object.freeze(occurrences.edits.map((edit) => Object.freeze({
          start: edit.start,
          end: edit.end,
          occurrence: edit.occurrence,
        }))),
  });
}

function withheldReceipt(
  stage: MaterialIngressStage,
  session: MaterialLexicalSession,
): MaterialIngressReceipt {
  return Object.freeze({
    stage,
    lexicalGeneration: session.snapshot.generation,
    lexicalSourceRevision: session.snapshot.sourceRevision,
    canonicalized: false,
    editCount: 0,
    canonicalizationWithheld: true,
    lexicalEdits: NO_LEXICAL_EDITS,
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
