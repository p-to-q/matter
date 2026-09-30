import type { MatterLocale } from "../config/locales";
import { adjudicateRepair, normalizeRepairInput } from "../material/transcript-repair";
import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";
import {
  canonicalSpokenExpressionBase,
  decorateSpokenExpression,
} from "./expressive-transcript";
import { repairAdmittedTranscriptWords } from "./transcript-punctuation";

export type AdmissionRepairCandidate = Readonly<{
  /** The admitted words the lease was issued for. */
  expectedText: string;
  locale: MatterLocale;
  /** The admission's interaction id; it seeds the same expression the port drew. */
  sampleSeed: string;
  source: "rules" | "model";
  text: string;
}>;

export type AdmissionRepairVerdict =
  | Readonly<{ ok: true; text: string; changed: boolean }>
  | Readonly<{ ok: false }>;

export type AdmissionRepairAdjudicator = (candidate: AdmissionRepairCandidate) => AdmissionRepairVerdict;

/**
 * The store's authority over a late repair candidate. It trusts nothing the
 * repair port computed: it recomputes the deterministic floor from the
 * admitted words, accepts a rules candidate only when it is exactly that
 * floor, and grants a model candidate authority solely over its bounded delta
 * from the floor, with expression stripped and re-proven here.
 */
export function adjudicateAdmissionRepair(candidate: AdmissionRepairCandidate): AdmissionRepairVerdict {
  const ruleWords = repairAdmittedTranscriptWords(candidate.expectedText, candidate.locale);
  if (candidate.source === "rules") {
    const ruleFloor = decorateSpokenExpression({
      text: ruleWords,
      locale: candidate.locale,
      maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
      sampleSeed: candidate.sampleSeed,
    });
    return candidate.text === ruleFloor
      ? Object.freeze({ ok: true as const, text: candidate.text, changed: candidate.text !== candidate.expectedText })
      : Object.freeze({ ok: false as const });
  }
  const modelWords = canonicalSpokenExpressionBase({
    text: candidate.text,
    locale: candidate.locale,
    maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
    sampleSeed: candidate.sampleSeed,
  });
  // Rules and model are one candidate, not two model edits. The recomputed
  // floor is trusted only because the rules branch above is pure and exact;
  // the model receives authority solely over its bounded delta from that
  // floor. Expression is stripped and re-proven locally before the model
  // delta is judged.
  const verdict = adjudicateRepair(
    normalizeRepairInput({ text: ruleWords, locale: candidate.locale }),
    modelWords,
  );
  if (!verdict.ok || !verdict.changed) return Object.freeze({ ok: false as const });
  const text = decorateSpokenExpression({
    text: verdict.text,
    locale: candidate.locale,
    maxOutputCodeUnits: MAX_NODE_TEXT_CODE_UNITS,
    sampleSeed: candidate.sampleSeed,
  });
  return Object.freeze({ ok: true as const, text, changed: text !== candidate.expectedText });
}
