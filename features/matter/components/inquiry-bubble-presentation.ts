export const INQUIRY_REVEAL_STEP_MS = 36;
export const INQUIRY_TERMINAL_SETTLE_MS = 900;
const MAX_INQUIRY_REVEAL_STEPS = 42;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Presentation-only text policy for the small inquiry bubble. The terminal
 * answer remains the authority; this merely withholds or lends its full stop
 * while the answer becomes readable.
 */
export function inquiryPresentationText(text: string): Readonly<{
  typed: string;
  terminal: string;
}> {
  const typed = text.replace(/[。.]$/u, "");
  return Object.freeze({ typed, terminal: terminalText(text) });
}

export function revealSteps(text: string): readonly string[] {
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(text), (part) => part.segment);
  if (graphemes.length === 0) return Object.freeze([]);
  const stepSize = Math.max(1, Math.ceil(graphemes.length / MAX_INQUIRY_REVEAL_STEPS));
  const steps: string[] = [];
  for (let end = stepSize; end < graphemes.length; end += stepSize) {
    steps.push(graphemes.slice(0, end).join(""));
  }
  steps.push(text);
  return Object.freeze(steps);
}

function terminalText(text: string): string {
  if (text.length === 0 || /[。.!！？…]$/u.test(text)) return text;
  return containsCjk(text) ? `${text}。` : `${text}.`;
}

function containsCjk(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}
