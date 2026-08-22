export type ProtectedTranscriptLiteralSpan = readonly [start: number, end: number];

// Formatting and expression policy must agree on spans that carry literal
// syntax or identifiers. Callers receive fresh patterns so lastIndex cannot
// leak between otherwise pure runtime operations.
const PROTECTED_TRANSCRIPT_LITERAL = /```[^]*?```|`[^`\n]+`|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|"[^"\n]+"|(?:https?:\/\/|[Ww]{3}\.)[^\s，。！？；：]+|[\p{L}\p{N}.!#$%&'*+\-/=?^_`{|}~]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|(?:\.{0,2}\/|\/)[\p{L}\p{N}._~!$&'()*+;=:@%\-/]+|[A-Za-z]:\\[^\s，。！？；：]+|--[A-Za-z][A-Za-z0-9-]*|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[Vv]?\d+(?:\.\d+){1,3}\b|(?<![\p{L}\p{N}_$])[\p{L}\p{N}$]+(?:_[\p{L}\p{N}$]+)+(?![\p{L}\p{N}_$])|(?<![\p{L}\p{N}_$])[\p{L}\p{N}_$]+(?:\.[\p{L}\p{N}_$]+)+(?![\p{L}\p{N}_$])|\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/gu;

export const MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL = /[`“‘「『"@/\\_.]|--|[A-Za-z]/u;

export function protectedTranscriptLiteralPattern(): RegExp {
  return new RegExp(
    PROTECTED_TRANSCRIPT_LITERAL.source,
    PROTECTED_TRANSCRIPT_LITERAL.flags,
  );
}

export function findProtectedTranscriptLiteralSpans(
  text: string,
): readonly ProtectedTranscriptLiteralSpan[] {
  if (!MAY_CONTAIN_PROTECTED_TRANSCRIPT_LITERAL.test(text)) return Object.freeze([]);
  return Object.freeze(Array.from(text.matchAll(protectedTranscriptLiteralPattern()), (match) =>
    Object.freeze([match.index, match.index + match[0].length] as const)));
}
