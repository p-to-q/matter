import type { InquiryClientReason } from "../interaction/inquiry-client";

export const INQUIRY_MAX_CODE_POINTS = 500;

export type InquiryPhase = "idle" | "listening" | "transcribing";
export type InquiryVoiceNotice = "voice-unsupported" | "voice-denied" | "voice-failed";
export type InquiryAnswerState =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{ status: "unavailable"; reason: InquiryUnavailableReason }>;
/**
 * The client owns this vocabulary, because it is the boundary that decides
 * which refusal a response means. Re-declaring it here would let the reducer
 * and the transport disagree about what a person can be told.
 */
export type InquiryUnavailableReason = InquiryClientReason;
/**
 * One question and its one answer. Ask Matter is a second pair of eyes on
 * visible material, not a conversation: the type is the enforcement, because a
 * list of turns is how a transcript grows back, one reasonable commit at a time.
 * Nothing here is persisted, cached, exported, or added to command history, and
 * a prior answer is never sent back as input to a later question.
 */
export type InquiryExchange = Readonly<{
  id: number;
  question: string;
  answer: InquiryAnswerState;
}>;
export type InquiryState = Readonly<{
  phase: InquiryPhase;
  draft: string;
  interim: string;
  notice: InquiryVoiceNotice | null;
  exchange: InquiryExchange | null;
  nextExchangeId: number;
}>;
export type InquiryEvent =
  | Readonly<{ type: "type"; value: string }>
  | Readonly<{ type: "listen" }>
  | Readonly<{ type: "hear"; value: string }>
  | Readonly<{ type: "transcribe" }>
  | Readonly<{ type: "listened" }>
  | Readonly<{ type: "listen-failed"; notice: InquiryVoiceNotice }>
  | Readonly<{ type: "ask" }>
  | Readonly<{ type: "answer"; id: number; answer: InquiryAnswerState }>
  | Readonly<{ type: "clear" }>
  | Readonly<{ type: "scope-changed" }>
  | Readonly<{ type: "close" }>;

const PENDING: InquiryAnswerState = Object.freeze({ status: "pending" });

/**
 * The id the next `ask` will carry. A caller reads it before dispatching so a
 * reply that arrives after the exchange was replaced, cleared, or discarded can
 * be recognised as stale and dropped rather than shown under a later question.
 */
export function pendingAnswerId(state: InquiryState): number {
  return state.nextExchangeId;
}

export function createInquiryState(): InquiryState {
  return Object.freeze({
    phase: "idle",
    draft: "",
    interim: "",
    notice: null,
    exchange: null,
    nextExchangeId: 1,
  });
}

export function inquiryText(state: InquiryState): string {
  return joinDictatedText(state.draft, state.interim);
}

export function isInquiryPending(state: InquiryState): boolean {
  return state.exchange?.answer.status === "pending";
}

/** The visible submit button and Enter share this one transient eligibility rule. */
export function canSubmitInquiry(state: InquiryState): boolean {
  return state.phase === "idle" &&
    inquiryText(state).trim().length > 0 &&
    !isInquiryPending(state);
}

export function reduceInquiry(state: InquiryState, event: InquiryEvent): InquiryState {
  switch (event.type) {
    case "type":
      return state.phase === "listening"
        ? state
        : freeze({ ...state, draft: clamp(event.value), notice: null });
    case "listen":
      return state.phase === "listening"
        ? state
        : freeze({ ...state, phase: "listening", interim: "", notice: null });
    case "hear":
      return state.phase !== "idle"
        ? freeze({ ...state, interim: event.value })
        : state;
    case "transcribe":
      return state.phase === "listening"
        ? freeze({ ...state, phase: "transcribing" })
        : state;
    case "listened":
      return settle(state, null);
    case "listen-failed":
      return settle(state, event.notice);
    case "ask": {
      const question = inquiryText(state).trim();
      if (question.length === 0 || isInquiryPending(state)) return state;
      // A new question replaces the prior exchange rather than joining it. The
      // previous answer leaves the screen with the question it answered.
      return freeze({
        phase: "idle",
        draft: "",
        interim: "",
        notice: null,
        exchange: Object.freeze({ id: state.nextExchangeId, question, answer: PENDING }),
        nextExchangeId: state.nextExchangeId + 1,
      });
    }
    case "answer":
      // A reply for an exchange this state no longer holds is stale by
      // definition: it was replaced, cleared, or discarded while in flight.
      return state.exchange === null || state.exchange.id !== event.id
        ? state
        : freeze({
          ...state,
          exchange: Object.freeze({ ...state.exchange, answer: event.answer }),
        });
    case "clear":
      // Drops the exchange and keeps what the person is currently writing.
      return state.exchange === null ? state : freeze({ ...state, exchange: null });
    case "scope-changed":
      // An exchange is about one material context. Do not carry a pending or
      // answered question into another document, revision, or selection scope.
      return createInquiryState();
    case "close":
      return createInquiryState();
  }
}

function settle(state: InquiryState, notice: InquiryVoiceNotice | null): InquiryState {
  return freeze({
    ...state,
    phase: "idle",
    draft: clamp(joinDictatedText(state.draft, state.interim)),
    interim: "",
    notice,
  });
}

const CJK_EDGE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

export function joinDictatedText(left: string, right: string): string {
  const addition = right.trim();
  if (addition.length === 0) return left;
  if (left.trim().length === 0) return addition;
  if (/\s$/u.test(left)) return `${left}${addition}`;
  const seamIsCjk = CJK_EDGE.test(left.slice(-1)) || CJK_EDGE.test(addition.slice(0, 1));
  return seamIsCjk ? `${left}${addition}` : `${left} ${addition}`;
}

function clamp(value: string): string {
  const points = Array.from(value);
  return points.length <= INQUIRY_MAX_CODE_POINTS
    ? value
    : points.slice(0, INQUIRY_MAX_CODE_POINTS).join("");
}

function freeze(state: InquiryState): InquiryState {
  return Object.freeze(state);
}
