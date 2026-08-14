import type { InquiryClientReason } from "../interaction/inquiry-client";

export const INQUIRY_MAX_CODE_POINTS = 500;
export const INQUIRY_MAX_TURNS = 40;

export type InquiryPhase = "idle" | "listening" | "transcribing";
export type InquiryVoiceNotice = "voice-unsupported" | "voice-denied" | "voice-failed";
export type InquiryTurnOutcome =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{ status: "unavailable"; reason: InquiryUnavailableReason }>;
/**
 * The client owns this vocabulary, because it is the boundary that decides
 * which refusal a response means. Re-declaring it here would let the reducer
 * and the transport disagree about what a person can be told.
 */
export type InquiryUnavailableReason = InquiryClientReason;
export type InquiryTurn =
  | Readonly<{ id: number; role: "person"; text: string }>
  | Readonly<{ id: number; role: "matter"; outcome: InquiryTurnOutcome }>;
export type InquiryState = Readonly<{
  phase: InquiryPhase;
  draft: string;
  interim: string;
  notice: InquiryVoiceNotice | null;
  turns: readonly InquiryTurn[];
  nextTurnId: number;
}>;
export type InquiryEvent =
  | Readonly<{ type: "type"; value: string }>
  | Readonly<{ type: "listen" }>
  | Readonly<{ type: "hear"; value: string }>
  | Readonly<{ type: "transcribe" }>
  | Readonly<{ type: "listened" }>
  | Readonly<{ type: "listen-failed"; notice: InquiryVoiceNotice }>
  | Readonly<{ type: "ask" }>
  | Readonly<{ type: "answer"; id: number; outcome: InquiryTurnOutcome }>
  | Readonly<{ type: "scope-changed" }>
  | Readonly<{ type: "close" }>;

const PENDING: InquiryTurnOutcome = Object.freeze({ status: "pending" });

export function pendingAnswerId(state: InquiryState): number {
  return state.nextTurnId + 1;
}

export function createInquiryState(): InquiryState {
  return Object.freeze({
    phase: "idle",
    draft: "",
    interim: "",
    notice: null,
    turns: Object.freeze([]),
    nextTurnId: 1,
  });
}

export function inquiryText(state: InquiryState): string {
  return joinDictatedText(state.draft, state.interim);
}

/** The visible submit button and Enter share this one transient eligibility rule. */
export function canSubmitInquiry(state: InquiryState): boolean {
  return state.phase === "idle" &&
    inquiryText(state).trim().length > 0 &&
    !state.turns.some((turn) => turn.role === "matter" && turn.outcome.status === "pending");
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
      if (question.length === 0) return state;
      const asked: InquiryTurn = Object.freeze({
        id: state.nextTurnId,
        role: "person",
        text: question,
      });
      const answered: InquiryTurn = Object.freeze({
        id: state.nextTurnId + 1,
        role: "matter",
        outcome: PENDING,
      });
      return freeze({
        phase: "idle",
        draft: "",
        interim: "",
        notice: null,
        turns: boundTurns([...state.turns, asked, answered]),
        nextTurnId: state.nextTurnId + 2,
      });
    }
    case "answer":
      return freeze({
        ...state,
        turns: Object.freeze(state.turns.map((turn) =>
          turn.id === event.id && turn.role === "matter"
            ? Object.freeze({ ...turn, outcome: event.outcome })
            : turn,
        )),
      });
    case "scope-changed":
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

function boundTurns(turns: readonly InquiryTurn[]): readonly InquiryTurn[] {
  return Object.freeze(
    turns.length <= INQUIRY_MAX_TURNS ? [...turns] : turns.slice(turns.length - INQUIRY_MAX_TURNS),
  );
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
