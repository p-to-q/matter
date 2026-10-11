import { MODEL_DEADLINES } from "../config/model-deadlines";
import type { ImageBrief } from "../protocol/image-contract";
import { rejectionVocabulary, type MatterScenario, type MatterScenarioId } from "./harness";
import {
  IMAGE_REFUSAL_REASONS,
  inspectImageDataUrl,
  type ImageInspection,
  type ImageRefusalReason,
} from "./image-bytes";

export const IMAGE_SCENARIO_ID = "matter-image" satisfies MatterScenarioId;
export const IMAGE_PROMPT_VERSION = "image/1";

/**
 * Matter's drawing voice. A frozen server constant: the scenario receives it,
 * and no caller, direction, or passage can weaken or restyle it.
 *
 * It is one short paragraph of plain sentences on purpose. An attempt to specify
 * the picture's openness as sections with worked examples flattened the texture,
 * thinned the line, and made the model reuse the examples as subjects; one
 * sentence does what that paragraph ruined. A style tolerates very little
 * explanation, so resist extending this.
 *
 * It does not guarantee the style. Wording raises the odds of a usable first
 * image and keeps no promise, because an image model has no instruction
 * hierarchy: the promise is kept upstream by what reaches this prompt at all.
 */
export const IMAGE_STYLE = [
  "Square 1:1 hand-drawn ink illustration on a pure white background.",
  "Black brush-marker line work: thick, confident, gestural strokes with visibly uneven weight and dry-brush roughness at the ends, as if drawn fast with a chisel-tip felt pen. Lines overshoot and do not always close.",
  "Exactly one accent colour family — cyan blue, from a pale wash (#B8F2FE) through mid sea cyan (#6BDFF2) to deep teal (#017D97) — laid in as flat, opaque marker blocks with hard edges that deliberately overshoot or fall short of the ink lines, leaving bare white paper showing through.",
  "No other colours. No gradient, no soft airbrush, no photographic shading, no texture overlay, no frame, no background scenery, no text, no logo.",
  "Let one thing in the drawing run past the edge of whatever was meant to hold it, and leave the picture unresolved rather than explained.",
  "If a person appears, they are drawn simply, with hair indicated by a few strokes and no facial features at all. Generous empty white space.",
  "Subject:",
].join("\n");

export type ImageScenarioInput = Readonly<{
  locale: string;
  /** The only person-derived text the renderer ever sees, after adjudication. */
  brief: ImageBrief;
}>;

/** The adjudicated result: the relay's own bytes, inspected and untouched. */
export type ImageResult = Extract<ImageInspection, { ok: true }>;

export type ImageRejection = ImageRefusalReason;

/**
 * The renderer's whole prompt: the frozen style, then the validated brief.
 *
 * Deliberately not `composePrompt`. That scaffold names sections and carries a
 * scenario header, and an image model treats every word as something to draw —
 * a line such as "what this scenario never does" can come back as lettering.
 * The structure that protects a text model is noise here, and the person's
 * passage is absent by construction: this function cannot receive it.
 */
export function compileImagePrompt(input: ImageScenarioInput): string {
  return `${IMAGE_STYLE}\n${input.brief.text}`;
}

/**
 * One generation, never two.
 *
 * `rejectedCandidate` is "settle-floor" on purpose. The harness's other setting
 * would try a second relay when policy rejects the first answer, which for a
 * text scenario costs a fraction of a cent and for this one buys a second image
 * the person or the platform pays for. A refused picture settles on the floor
 * and the paid-for relay is not asked to try again.
 */
export const IMAGE_SCENARIO: MatterScenario<ImageScenarioInput, ImageResult, ImageRejection> =
  Object.freeze({
    id: IMAGE_SCENARIO_ID,
    promptVersion: IMAGE_PROMPT_VERSION,
    rejectedCandidate: "settle-floor",
    locale: (input) => input.locale,
    compile: compileImagePrompt,
    budget: () => Object.freeze({
      deadlineMs: MODEL_DEADLINES.image.providerMs,
      // The image transports ignore this: it is a text-token ceiling and an
      // image is not text. The harness still requires a positive integer.
      maxOutputTokens: 1,
    }),
    adjudicate: (answer) => adjudicateImage(answer),
    rejectionCodes: rejectionVocabulary<ImageRejection>(
      Object.fromEntries(IMAGE_REFUSAL_REASONS.map((reason) => [reason, true])) as Record<
        ImageRejection,
        true
      >,
    ),
  });

/**
 * The pool carries the image as the string a transport already normalised, so
 * this is the first place it is judged as bytes. The check is on format and
 * size, never on content: whether the picture is the right picture was decided
 * before any image was requested.
 */
function adjudicateImage(answer: unknown) {
  const text = typeof answer === "string" ? answer : null;
  if (text === null) return Object.freeze({ ok: false as const, reason: "malformed-data-url" as const });
  const inspected = inspectImageDataUrl(text);
  return inspected.ok
    ? Object.freeze({ ok: true as const, value: inspected })
    : Object.freeze({ ok: false as const, reason: inspected.reason });
}
