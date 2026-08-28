import {
  TRANSCRIPT_REPAIR_PROMPT_VERSION,
  adjudicateRepair,
  repairDeadlineMs,
  repairMaxOutputTokens,
  type NormalizedRepairInput,
} from "../material/transcript-repair";
import type { MatterScenario } from "./harness";
import { MODEL_DEADLINES } from "../config/model-deadlines";
import { composePrompt, fence } from "./prompt-spine";

/**
 * Repairing one heard utterance.
 *
 * The floor is the request utterance: raw dictation for an inquiry draft, or
 * the deterministic rule floor for admitted material. This scenario handles
 * the remaining contextual boundary, correction, and misrecognition cases. It
 * restores; it does not turn admission into a general writing surface.
 */
export const REPAIR_SCENARIO: MatterScenario<NormalizedRepairInput, string> = Object.freeze({
  id: "matter-transcript-repair",
  promptVersion: TRANSCRIPT_REPAIR_PROMPT_VERSION,
  locale: (input) => input.locale,
  compile: compileRepairPrompt,
  budget: (input) => Object.freeze({
    deadlineMs: Math.min(repairDeadlineMs(input), MODEL_DEADLINES.repair.providerMs),
    maxOutputTokens: repairMaxOutputTokens(input),
    disableThinking: true,
  }),
  adjudicate: (answer, input) => {
    const verdict = adjudicateRepair(input, answer);
    return verdict.ok
      ? Object.freeze({ ok: true, value: verdict.text })
      : Object.freeze({ ok: false, reason: verdict.reason });
  },
});

/**
 * Every line here is a rule a real transcript broke. The allowed repairs
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
      "Return a faithful written redraft of the utterance they intended: remove abandoned speech and recognition debris, settle broken spoken grammar into the shortest natural form, add no idea, and change no claim.",
    ],
    fixed: [
      `the language: answer in the language of the utterance, whose locale is ${JSON.stringify(input.locale)}. A translation is never a repair.`,
      "the content: you are correcting how it was written down, not deciding what it should have been.",
    ],
    allow: [
      "punctuation the speaker's phrasing implies but the recognizer did not write, using the marks of the utterance's own language;",
      "sentence and clause boundaries — where one thought ends and the next begins;",
      "ordinary spacing and letter case that speech recognition flattened;",
      "an exact adjacent word or short phrase duplicated by recognition, but only when it is clearly an echo rather than emphasis;",
      "an isolated low-information hesitation such as uh, um, erm, 呃, 额, or 額, but never a hesitation that carries agreement, uncertainty, or tone;",
      "a filler or discourse scaffold such as you know, like, 那个, 就是, or 然后 only when it carries no attitude, reference, uncertainty, or logical relation in this exact utterance;",
      "an abandoned false start when a complete replacement immediately follows; keep the completed wording and its original order;",
      "one explicit or contextually unmistakable self-correction where the person gives a mistaken fragment, then says sorry, I mean, rather, actually, wait, 不对, 我是说, 更正, or the locale-equivalent and supplies the replacement: keep the version they ultimately chose;",
      "a minimal missing article, agreement form, or function word only when the spoken grammar makes exactly one completion possible;",
      "light spoken-to-written smoothing that removes verbal scaffolding while preserving the person's vocabulary, tone, uncertainty, emphasis, claim order, and degree of completion;",
      "within one visibly spoken or grammatically fractured clause, paraphrase verbal scaffolding into the shortest natural written phrasing, but only when speaker, register, modality, causality, facts, and clause order remain identical;",
      "write an explicitly spoken number, percentage, date, time, version, currency, or unit in the ordinary written form of the utterance's locale, without changing its semantic value or precision;",
      "a character or word the recognizer misheard, when the surrounding words make the intended one unambiguous: a homophone, a near-homophone, a proper noun it did not know;",
      "one consistent spelling for a term the person said more than once.",
    ],
    keep: [
      "Keep the person's vocabulary, tone, uncertainty, meaningful hesitation, and emphasis; remove only speech that is clearly abandoned or non-semantic here.",
      "Every intended claim and chosen word in the order given; only abandoned or non-semantic speech covered above may disappear.",
    ],
    never: [
      "translate, summarize, expand, explain, continue, or answer the utterance;",
      "reorder claims, merge separate thoughts, or change cause, condition, sequence, speaker, question, command, or statement type;",
      "add a fact, example, reason, conclusion, transition, confidence, or specificity the person did not express;",
      "polish the voice into a higher register, make it more persuasive, or perform a style-only rewrite when there is no spoken or grammatical residue to repair;",
      "delete meaningful repetition, an ambiguous filler, a side note, or a false start whose replacement is not clear in the utterance.",
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
