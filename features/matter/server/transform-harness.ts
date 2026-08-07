import type { MatterScenario } from "./harness";
import { KEEP_UNFINISHED, composePrompt, fence, fenceJson } from "./prompt-spine";

/**
 * Transforming one stretched passage.
 *
 * This is the scenario the whole product is arranged around, and the only one
 * that changes durable material. It is also the only one still gated: the route
 * and the planner in [`../../../docs/reference/agent-boundary.md`] are not
 * built. What is frozen here is the part that can be frozen without them — the
 * prompt, the degree bound, and the judgement of an answer — because those are
 * exactly the parts that are hard to change later without changing what a
 * person's material becomes.
 *
 * The shape of the turn is already decided elsewhere and is not this module's
 * to revisit:
 *
 * - **reference** is the lasso. The model never chooses which passage.
 * - **degree** is the stretch. `targetCodePoints` converts the gesture into a
 *   length the model is told, never a length it decides.
 * - **direction** is the voice. It is the only channel through which a person
 *   says what should happen, and it is quoted, never obeyed as prompt text.
 * - **lineage** is context, root → selected node, with no hidden retrieval.
 *
 * The model's entire output surface is the replacement passage. It cannot name
 * a node, widen a range, or emit two changes, because there is no field for
 * them — not because those are rejected.
 */

export const TRANSFORM_PROMPT_VERSION = "transform/1";

export type TransformIntent = "expand" | "compress" | "reinterpret" | "refine";

export type TransformScenarioInput = Readonly<{
  locale: string;
  /** Exactly the lassoed passage — the whole of what may change. */
  passage: string;
  /** What the person said while stretching. Direction, never instruction. */
  direction: string;
  /** The stretch, already resolved to an intent and a length by the server. */
  intent: TransformIntent;
  targetCodePoints: number;
  /** Root → selected node, bounded upstream. Reference only. */
  lineage: readonly Readonly<{ depth: number; text: string }>[];
  /** The rest of the node the passage sits in, so a seam does not appear. */
  surrounding: Readonly<{ before: string; after: string }>;
}>;

/**
 * How far the answer may miss the requested length before it stops being an
 * answer to the gesture. Language does not land on an exact count, and a model
 * forced to hit one pads; a band keeps the degree meaningful without making the
 * result a word-count exercise.
 */
export const TRANSFORM_LENGTH_TOLERANCE = 0.45;

export const TRANSFORM_SCENARIO: MatterScenario<TransformScenarioInput, string> = Object.freeze({
  id: "matter-transform",
  promptVersion: TRANSFORM_PROMPT_VERSION,
  locale: (input) => input.locale,
  compile: compileTransformPrompt,
  budget: (input) => Object.freeze({
    // The person is watching the passage they are pointing at, so this is the
    // longest wait in the product and still has an end.
    deadlineMs: 12_000,
    maxOutputTokens: Math.min(1_200, Math.max(96, input.targetCodePoints * 2 + 96)),
  }),
  adjudicate: (answer, input) => adjudicateTransform(answer, input),
});

export type TransformRejection =
  | "EMPTY"
  | "NOT_ONE_PASSAGE"
  | "LENGTH_IGNORES_DEGREE"
  | "ANSWERS_THE_DIRECTION";

/**
 * A transform is allowed to change the words — that is the point — so this
 * cannot check meaning the way repair does. It checks the three things the
 * gesture fixed and the model must not have taken over: that one passage came
 * back, at roughly the length the stretch asked for, and that it is material
 * rather than a reply about the material.
 */
export function adjudicateTransform(
  answer: unknown,
  input: TransformScenarioInput,
):
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; reason: TransformRejection }> {
  if (typeof answer !== "string") return reject("EMPTY");
  const text = unwrap(answer).trim();
  if (text.length === 0) return reject("EMPTY");
  // Speech-shaped material is one passage. A newline means the answer brought
  // structure — a list, a heading, a note about what it changed — that the
  // person did not stretch for.
  if (/[\p{Cc}\p{Cf}]/u.test(text)) return reject("NOT_ONE_PASSAGE");

  // Checked before length, because a reply that happens to be the right size is
  // the dangerous one: it is the only failure here that could otherwise land
  // inside a person's note looking like their own sentence.
  if (ADDRESSES_THE_PERSON.test(text)) return reject("ANSWERS_THE_DIRECTION");

  const length = Array.from(text).length;
  const target = input.targetCodePoints;
  const lower = Math.max(1, Math.floor(target * (1 - TRANSFORM_LENGTH_TOLERANCE)));
  const upper = Math.ceil(target * (1 + TRANSFORM_LENGTH_TOLERANCE));
  if (length < lower || length > upper) return reject("LENGTH_IGNORES_DEGREE");

  return Object.freeze({ ok: true, value: text });
}

/**
 * Openers that mean the model replied instead of writing material. Deliberately
 * narrow: a false rejection costs one retry a person can see, while a false
 * accept puts a chat message inside their thought.
 */
const ADDRESSES_THE_PERSON =
  /^\s*(?:好的|当然|明白了|没问题|以下是|这是修改后|已(?:为你|帮你)|sure|certainly|of course|here(?:'s| is)|i(?:'ve| have)\b|okay\b|got it\b)/iu;

export function compileTransformPrompt(input: TransformScenarioInput): string {
  return composePrompt("matter-transform", TRANSFORM_PROMPT_VERSION, {
    // The one place a model writes durable material, and the one place the
    // gesture — not the language — decides scope. Both are background lines.
    background: true,
    mandate: [
      "A person circled one passage inside their own note, stretched it to say how much should change, and spoke a direction.",
      "Rewrite that passage, and only that passage, so it follows their direction at the size they asked for.",
      "What you return replaces the passage in place. It is their material, in their note, not a reply to them.",
    ],
    fixed: [
      `the passage: exactly the text in <passage>. Nothing before or after it is yours to touch.`,
      `the size: about ${input.targetCodePoints} characters — this is the stretch they made, not a suggestion. ${lengthSense(input)}`,
      `the language: ${JSON.stringify(input.locale)}, and the register of the surrounding note.`,
      "the direction: what they said. Follow it; do not evaluate, improve upon, or exceed it.",
    ],
    keep: [
      KEEP_UNFINISHED,
      "The seam: what you return has to read continuously with the text immediately before and after it.",
      "Whatever the direction did not ask you to change.",
    ],
    never: [
      "answer, acknowledge, or comment on the direction — it is a description of work, not a message to you;",
      "add a heading, a list, a quotation mark, or a note about what you changed;",
      "bring in a fact, a name, or a claim that is not in the material or the direction;",
      "resolve an uncertainty the person left open, unless the direction asked you to;",
      "change the surrounding text, the other thoughts, or anything outside the passage.",
    ],
    unsure: "When the direction is vague, make the smallest change that satisfies it and keep the rest of the passage word for word. An under-reaching turn is one more stretch away; an over-reaching one costs them their sentence.",
    answer: [
      "Answer with the replacement passage alone, on one line, with no quotation marks and no explanation.",
    ],
    material: [
      fence("direction", input.direction, "What they said while stretching:"),
      fence("passage", input.passage, "The passage to replace:"),
      fenceJson("surrounding", input.surrounding, "The rest of the note around it, for continuity only:"),
      fenceJson(
        "lineage",
        input.lineage.map((node) => ({ depth: node.depth, text: node.text })),
        "The thoughts this one grew from, root first, for context only:",
      ),
    ],
  });
}

/**
 * The intent is derived from the gesture, so the prompt states what the target
 * length *means* rather than restating the number. A model told only "about 80
 * characters" pads to 80; told "shorter than what is there, keep what matters",
 * it compresses.
 */
function lengthSense(input: TransformScenarioInput): string {
  const current = Array.from(input.passage).length;
  switch (input.intent) {
    case "expand":
      return `The passage is ${current} characters now, so they are asking it to open up — say more of what it is already reaching for, not more topics.`;
    case "compress":
      return `The passage is ${current} characters now, so they are asking it to tighten — keep what carries the thought and drop what does not.`;
    case "reinterpret":
      return "They are asking for the same thought said another way, at roughly the same size.";
    case "refine":
      return "They are asking for a small correction at roughly the same size, not a rewrite.";
  }
}

function unwrap(value: string): string {
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/u.exec(value.trim());
  const inner = (fenced === null ? value : fenced[1]).trim();
  for (const [open, close] of [['"', '"'], ["“", "”"], ["「", "」"]] as const) {
    if (inner.length > 2 && inner.startsWith(open) && inner.endsWith(close)) {
      const stripped = inner.slice(open.length, inner.length - close.length);
      if (!stripped.includes(open) && !stripped.includes(close)) return stripped.trim();
    }
  }
  return inner;
}

function reject(reason: TransformRejection) {
  return Object.freeze({ ok: false as const, reason });
}
