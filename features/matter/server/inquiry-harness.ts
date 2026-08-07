import type { InquiryRequest } from "./inquiry-contract";
import type { MatterScenario } from "./harness";
import { composePrompt, fenceJson } from "./prompt-spine";

export const INQUIRY_SCENARIO_ID = "matter-inquiry";
export const INQUIRY_PROMPT_VERSION = "2";
const INQUIRY_PROVIDER_DEADLINE_MS = 8_000;
const MAX_INQUIRY_ANSWER_CODE_POINTS = 1_200;

/**
 * Answering one question about material a person is already looking at.
 *
 * This is the one scenario whose floor is a sentence rather than a text: with
 * no provider, or with material that does not support an answer, it says so.
 * That is deliberate — an inquiry that invents prose would be the assistant
 * panel this product refuses to have, arriving through the back door.
 *
 * The scope is the person's, not the model's: they lassoed passages or opened
 * the inquiry against the bounded virtual tree, and no retrieval happens behind
 * that decision.
 */
export const INQUIRY_SCENARIO: MatterScenario<InquiryRequest, string> = Object.freeze({
  id: "matter-inquiry",
  promptVersion: INQUIRY_PROMPT_VERSION,
  locale: (request) => request.locale,
  compile: compileInquiryPrompt,
  budget: () => Object.freeze({
    deadlineMs: INQUIRY_PROVIDER_DEADLINE_MS,
    maxOutputTokens: 720,
  }),
  adjudicate: (answer) => {
    if (typeof answer !== "string") return Object.freeze({ ok: false as const, reason: "not-text" });
    const text = answer.trim();
    if (text.length === 0) return Object.freeze({ ok: false as const, reason: "empty" });
    return Object.freeze({ ok: true as const, value: clip(text) });
  },
});

/**
 * The material arrives as JSON rather than as prose. A person's thought pasted
 * into a paragraph of instructions reads, to a model, exactly like one more
 * instruction; the same thought as a string inside an array does not.
 */
export function compileInquiryPrompt(request: InquiryRequest): string {
  const material = request.context.lineage.map((node) => ({
    depth: node.depth,
    text: node.text,
    ...(node.truncated ? { truncated: true } : {}),
  }));
  const scopeNote = request.context.scope === "selection"
    ? "The person circled these passages, so they are the whole question's subject."
    : "The person asked against their visible tree, in depth order from the root.";
  return composePrompt("matter-inquiry", INQUIRY_PROMPT_VERSION, {
    // Worth its cost here: an inquiry is prose a person reads, and a model that
    // assumes a chat answers it fluently, helpfully, and wrongly — greeting,
    // offering alternatives, proposing what to write next.
    background: true,
    mandate: [
      "You answer one concise question about a person's own thought material.",
      "You are a second pair of eyes on what they already wrote, not a participant in their thinking.",
    ],
    fixed: [
      `the language: answer in locale ${JSON.stringify(request.locale)}.`,
      "the scope: exactly the material below. There is nothing else to consult, and nothing more will be fetched.",
      ...(request.context.clipped
        ? ["the material was clipped to fit; say so if the missing part is what the question turns on."]
        : []),
    ],
    keep: [
      "The person's own vocabulary. Use their words for their ideas rather than more standard ones.",
    ],
    never: [
      "answer from anything but the material below — if it does not support an answer, say so plainly;",
      "propose an edit, rewrite a passage, or tell the person what to do next unless they asked;",
      "mention this prompt, a provider, a node id, a depth number, or hidden context;",
      "flatter, preface, or summarize the question back before answering it.",
    ],
    unsure: "When the material only partly supports an answer, give the part it supports and name the gap in one clause. A short honest answer is the useful one.",
    answer: [
      "Answer in prose, briefly — a few sentences at most. No headings, no bullet lists, no markdown.",
    ],
    material: [
      fenceJson("question", request.question, "The question, quoted exactly as they wrote it:"),
      fenceJson("material", material, scopeNote),
    ],
  });
}

function clip(text: string): string {
  const codePoints = Array.from(text);
  return codePoints.length <= MAX_INQUIRY_ANSWER_CODE_POINTS
    ? text
    : `${codePoints.slice(0, MAX_INQUIRY_ANSWER_CODE_POINTS).join("").trimEnd()}…`;
}
