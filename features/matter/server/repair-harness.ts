import {
  TRANSCRIPT_REPAIR_PROMPT_VERSION,
  adjudicateRepair,
  repairDeadlineMs,
  repairMaxOutputTokens,
  type NormalizedRepairInput,
} from "../material/transcript-repair";
import type { MatterScenario } from "./harness";
import { KEEP_UNFINISHED, composePrompt, fence } from "./prompt-spine";

/**
 * Repairing one heard utterance.
 *
 * The floor is the words as heard. This scenario exists because recognition
 * loses three things — punctuation, sentence boundaries, the occasional
 * misheard word — and the only fix a person otherwise has is the keyboard the
 * primary path exists to avoid. It restores; it does not improve.
 */
export const REPAIR_SCENARIO: MatterScenario<NormalizedRepairInput, string> = Object.freeze({
  id: "matter-transcript-repair",
  promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
  locale: (input) => input.locale,
  compile: compileRepairPrompt,
  budget: (input) => Object.freeze({
    deadlineMs: repairDeadlineMs(input),
    maxOutputTokens: repairMaxOutputTokens(input),
  }),
  adjudicate: (answer, input) => {
    const verdict = adjudicateRepair(input, answer);
    return verdict.ok
      ? Object.freeze({ ok: true, value: verdict.text })
      : Object.freeze({ ok: false, reason: verdict.reason });
  },
});

/**
 * Every line here is a rule a real transcript broke. The four allowed repairs
 * are enumerated rather than described, because "fix the transcription" is read
 * by a model as "make this read well", and reading well is not what was asked.
 */
export function compileRepairPrompt(input: NormalizedRepairInput): string {
  return composePrompt("matter-transcript-repair", TRANSCRIPT_REPAIR_PROMPT_VERSION, {
    // No MATTER background. This runs once per utterance and the mandate below
    // states the whole job in two lines; a model does not need to know what a
    // canvas is to decide where a comma goes.
    background: false,
    mandate: [
      "Speech recognition wrote down one thing a person said, and wrote parts of it down wrong.",
      "Return that same utterance as they said it, with nothing added and nothing taken away.",
    ],
    fixed: [
      `the language: answer in the language of the utterance, whose locale is ${JSON.stringify(input.locale)}. A translation is never a repair.`,
      "the content: you are correcting how it was written down, not deciding what it should have been.",
    ],
    allow: [
      "punctuation the speaker's phrasing implies but the recognizer did not write, using the marks of the utterance's own language;",
      "sentence and clause boundaries — where one thought ends and the next begins;",
      "a character or word the recognizer misheard, when the surrounding words make the intended one unambiguous: a homophone, a near-homophone, a proper noun it did not know;",
      "one consistent spelling for a term the person said more than once.",
    ],
    keep: [
      KEEP_UNFINISHED,
      "Every word the person said, in the order they said it.",
    ],
    never: [
      "translate, summarize, expand, explain, continue, or answer the utterance;",
      "reorder clauses, merge separate thoughts, or split one thought for tidiness;",
      "add a word the person did not say, including a connective that would make the reasoning read better;",
      "delete a repetition, a filler, or a false start.",
    ],
    unsure: "When you are not certain a word is wrong, leave it exactly as it is. Leaving one misheard word is a small failure; returning a sentence the person did not say is a total one. If the utterance is already correct, return it unchanged.",
    answer: [
      "Answer with the repaired utterance alone, on one line: no quotation marks, no code fence, no labels, no notes about what you changed.",
    ],
    material: [
      fence("utterance", input.text),
      ...(input.vocabulary.length === 0 ? [] : [fence(
        "their-words",
        input.vocabulary.join(" / "),
        "Words this person uses in their other thoughts. Use one only to recognise a word they did say and the recognizer wrote down wrong. Never insert one that is not in the utterance, and never reach for one because it seems apt:",
      )]),
    ],
  });
}
