/**
 * The state behind the inquiry bubble. It is deliberately a pure reducer: the
 * one thing this surface must never do is lose a sentence somebody spoke or
 * typed, and that guarantee is easier to hold — and to test — outside React.
 *
 * Asking turns the question into a turn in the exchange. No model is connected,
 * so the answering turn carries a notice rather than prose — it is the true
 * answer right now, not a placeholder for one. When a model does arrive it
 * takes that turn's place; the shape does not have to change.
 *
 * The exchange lives in memory for as long as the panel is mounted. It is never
 * written to material and never persisted, so a reload leaves nothing behind.
 */

/** Long enough for a real question, short enough that a stuck recogniser cannot run away with the field. */
export const INQUIRY_MAX_CODE_POINTS = 500;

/** The exchange is a working surface, not an archive; the oldest turns fall off. */
export const INQUIRY_MAX_TURNS = 40;

export type InquiryPhase = "idle" | "listening";

/** Why a dictation stopped. These belong to the composer, not to the exchange. */
export type InquiryVoiceNotice = "voice-unsupported" | "voice-denied" | "voice-failed";

/**
 * What became of one question. `pending` is the only transient state, and it
 * always resolves: the client turns every failure into a stated reason, so no
 * turn can be left spinning.
 */
export type InquiryTurnOutcome =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "answered"; text: string }>
  | Readonly<{ status: "unavailable"; reason: InquiryUnavailableReason }>;

export type InquiryUnavailableReason = "NO_PROVIDER" | "NO_MATERIAL" | "UNREACHABLE";

export type InquiryTurn =
  | Readonly<{ id: number; role: "person"; text: string }>
  | Readonly<{ id: number; role: "matter"; outcome: InquiryTurnOutcome }>;

export type InquiryState = Readonly<{
  phase: InquiryPhase;
  /** Text the person owns: typed, or already folded in from a finished dictation. */
  draft: string;
  /** The live transcript of the current dictation. Never authoritative until it settles. */
  interim: string;
  /** A composer-local problem, shown beside the field rather than in the exchange. */
  notice: InquiryVoiceNotice | null;
  turns: readonly InquiryTurn[];
  nextTurnId: number;
}>;

export type InquiryEvent =
  | Readonly<{ type: "type"; value: string }>
  | Readonly<{ type: "listen" }>
  | Readonly<{ type: "hear"; value: string }>
  | Readonly<{ type: "listened" }>
  | Readonly<{ type: "listen-failed"; notice: InquiryVoiceNotice }>
  | Readonly<{ type: "ask" }>
  | Readonly<{ type: "answer"; id: number; outcome: InquiryTurnOutcome }>
  | Readonly<{ type: "close" }>;

const PENDING: InquiryTurnOutcome = Object.freeze({ status: "pending" });

/** The id the answering turn will take, so a caller can resolve it later. */
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

/** What the field shows, and what asking would carry. */
export function inquiryText(state: InquiryState): string {
  return joinDictatedText(state.draft, state.interim);
}

export function reduceInquiry(state: InquiryState, event: InquiryEvent): InquiryState {
  switch (event.type) {
    case "type":
      // Typing is only offered while idle; a live transcript owns the field
      // until it settles, so there is no case where the two race for it.
      return state.phase === "listening"
        ? state
        : freeze({ ...state, draft: clamp(event.value), notice: null });

    case "listen":
      return state.phase === "listening"
        ? state
        : freeze({ ...state, phase: "listening", interim: "", notice: null });

    case "hear":
      // The port reports the whole session transcript, not a delta.
      return state.phase === "listening"
        ? freeze({ ...state, interim: event.value })
        : state;

    case "listened":
      return settle(state, null);

    // A failed recogniser still heard something. Keep it: the alternative is
    // discarding a sentence the person already said out loud.
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
      // The answering turn is created with the question so the exchange never
      // shows a question with nothing under it. It starts pending and is always
      // resolved, because the client converts every failure into a reason.
      const answered: InquiryTurn = Object.freeze({
        id: state.nextTurnId + 1,
        role: "matter",
        outcome: PENDING,
      });
      return freeze({
        phase: "idle",
        // The question is not lost — it moved into the exchange, where it stays
        // visible above the field it just left.
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
        turns: Object.freeze(state.turns.map((turn) => turn.id === event.id && turn.role === "matter"
          ? Object.freeze({ ...turn, outcome: event.outcome })
          : turn)),
      });

    // Closing settles a dictation and clears composer noise, but keeps the
    // exchange and the draft so reopening resumes exactly where it stopped.
    case "close":
      return freeze({ ...settle(state, null), notice: null });
  }
}

/** Folds a finished transcript into the draft and returns to rest. */
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

/**
 * Joins dictated text onto existing text. A space is a Latin convention:
 * inserting one between two Han characters would corrupt the sentence, so the
 * separator follows the scripts actually meeting at the seam.
 */
export function joinDictatedText(left: string, right: string): string {
  const addition = right.trim();
  if (addition.length === 0) return left;
  if (left.trim().length === 0) return addition;
  if (/\s$/u.test(left)) return `${left}${addition}`;
  const seamIsCjk = CJK_EDGE.test(left.slice(-1)) || CJK_EDGE.test(addition.slice(0, 1));
  return seamIsCjk ? `${left}${addition}` : `${left} ${addition}`;
}

/** Clamps by code point so a bound can never split a surrogate pair. */
function clamp(value: string): string {
  const points = Array.from(value);
  return points.length <= INQUIRY_MAX_CODE_POINTS
    ? value
    : points.slice(0, INQUIRY_MAX_CODE_POINTS).join("");
}

function freeze(state: InquiryState): InquiryState {
  return Object.freeze(state);
}
