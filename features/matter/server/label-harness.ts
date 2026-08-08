import {
  SEMANTIC_LABEL_PROMPT_VERSION,
  adjudicateModelLabel,
  deriveProvisionalLabel,
  validateSemanticLabel,
  type NormalizedLabelInput,
} from "../material/semantic-label";
import type { MatterScenario } from "./harness";
import { composePrompt, fence } from "./prompt-spine";

/**
 * Naming one thought so its author recognises it at a glance.
 *
 * The floor is the deterministic label the browser already derived and already
 * shows. This scenario is therefore the least urgent of the four: it is allowed
 * to be slow, to be shed, and to be wrong, because a person is looking at a
 * working name the whole time it runs.
 */
export const LABEL_SCENARIO: MatterScenario<NormalizedLabelInput, string> = Object.freeze({
  id: "matter-thought-label",
  promptVersion: SEMANTIC_LABEL_PROMPT_VERSION,
  locale: (input) => input.locale,
  compile: buildLabelPrompt,
  budget: (input) => Object.freeze({
    deadlineMs: LABEL_SCENARIO_DEADLINE_MS,
    // A label is a phrase. A ceiling near its own length stops a model from
    // spending the deadline explaining the name it chose.
    maxOutputTokens: Math.max(24, input.maxGraphemes * 2),
  }),
  adjudicate: (answer, input) => {
    if (typeof answer !== "string") return reject("not-text");
    const validation = validateSemanticLabel(answer, {
      locale: input.locale,
      maxGraphemes: input.maxGraphemes,
      siblingLabels: input.context.siblingLabels,
    });
    if (!validation.ok) return reject("invalid-label");
    // The model competes against the deterministic label rather than replacing
    // it: an answer that is not better than what a person is already reading is
    // churn, and a renamed node they did not ask to rename.
    const provisional = deriveProvisionalLabel(input).text;
    return adjudicateModelLabel(input, provisional, validation.label).ok
      ? Object.freeze({ ok: true, value: validation.label })
      : reject("not-better-than-provisional");
  },
});

/**
 * Nothing waits on a label. Measured relay latency on the corpus is p50 ≈ 0.65 s
 * and p95 ≈ 1.7 s from a workstation beside the relays, so a 1.5 s budget threw
 * away answers that were merely slow. The deployed region pays a slower path to
 * the same relays, and the pool spends at most half of this on one of them, so
 * the budget has to hold two attempts rather than one.
 */
export const LABEL_SCENARIO_DEADLINE_MS = 6_000;

/**
 * The length range matters more than the ceiling. Asked only for a maximum, a
 * model returns a two-character topic word, and a list of topic words is
 * indistinguishable from anyone else's list; the author has to recognise their
 * own thought, which takes a phrase.
 */
export function buildLabelPrompt(input: NormalizedLabelInput): string {
  const preferred = Math.max(3, Math.round(input.maxGraphemes * 0.6));
  const context = input.context;
  return composePrompt("matter-thought-label", SEMANTIC_LABEL_PROMPT_VERSION, {
    // No MATTER background either: once per visible node is the highest volume
    // in the product, and the mandate's own first line already carries the only
    // part that changes the answer — that the author must recognise their own
    // thought.
    background: false,
    mandate: [
      "Name one node in a thinking canvas so its author recognises their own thought at a glance.",
    ],
    fixed: [
      "the language: name it in the language of the material.",
      `the length: aim for ${preferred} to ${input.maxGraphemes} graphemes. Go shorter only when a shorter phrase genuinely says it better.`,
      ...(context.siblingLabels.length === 0 ? [] : [
        `the names already in this list, which yours must differ from: ${context.siblingLabels.join(" / ")}`,
      ]),
    ],
    keep: [
      "The material's own words, and the image, relation, or tension that makes it this thought and not a topic.",
    ],
    never: [
      "add anything the material does not say;",
      "use quotation marks, markup, or final punctuation;",
      "name a topic. A bare topic word is a failure: it could label anything. Name what the material actually claims or asks.",
    ],
    unsure: "When the material resists compression, keep its most specific phrase rather than inventing a general one.",
    answer: ["Answer with the name only."],
    material: [
      ...(context.parentLabel === null ? [] : [
        fence("parent-name", context.parentLabel, "The node this one hangs under is named:"),
      ]),
      ...(context.parentExcerpt === null ? [] : [fence("parent", context.parentExcerpt)]),
      fence("material", input.text, "The thought to name:"),
    ],
  });
}

function reject(reason: string) {
  return Object.freeze({ ok: false as const, reason });
}
