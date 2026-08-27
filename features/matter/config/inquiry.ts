/** Neutral inquiry bounds shared by live projection and wire validation. */
export const MAX_INQUIRY_NODE_CODE_POINTS = 480;
export const MAX_INQUIRY_CONTEXT_CODE_POINTS = 4_000;
export const MAX_INQUIRY_CONTEXT_NODES = 64;

/** Server body bound; a visible ellipsis may add one wire code point. */
export const MAX_INQUIRY_ANSWER_BODY_CODE_POINTS = 1_200;
export const MAX_INQUIRY_ANSWER_CODE_POINTS = MAX_INQUIRY_ANSWER_BODY_CODE_POINTS + 1;

export const INQUIRY_CONTEXT_SCOPES = Object.freeze(["selection", "tree"] as const);
export type InquiryContextScope = (typeof INQUIRY_CONTEXT_SCOPES)[number];
const INQUIRY_CONTEXT_SCOPE_SET: ReadonlySet<unknown> = new Set(INQUIRY_CONTEXT_SCOPES);

export function isInquiryContextScope(value: unknown): value is InquiryContextScope {
  return INQUIRY_CONTEXT_SCOPE_SET.has(value);
}
