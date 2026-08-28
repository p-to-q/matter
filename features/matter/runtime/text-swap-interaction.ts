import { isMatterLocale, type MatterLocale } from "../config/locales";
import type { SegmentSelection } from "../material/text-segments";
import type { TextSwapLineageNode } from "../protocol/text-swap-contract";
import { normalizeTextSwapDirection } from "../protocol/text-swap-policy";

/**
 * Owns one selection-local Text Swap lifecycle. Browser resources, request
 * promises, and returned plans remain in the effect driver; this state keeps
 * only serializable authority and bounded transient language.
 */

export type TextSwapBasis = Readonly<{
  treeId: string;
  baseRevision: number;
  documentEpoch: number;
  selection: SegmentSelection;
  sourceText: string;
  locale: MatterLocale;
  lineage: readonly TextSwapLineageNode[];
}>;

type SessionState = Readonly<{
  interactionId: string;
  attempt: number;
  basis: TextSwapBasis;
}>;

type DirectionState = SessionState & Readonly<{ direction: string }>;

export type TextSwapErrorCode =
  | "MICROPHONE_DENIED"
  | "MICROPHONE_UNAVAILABLE"
  | "RECORDING_UNSUPPORTED"
  | "RECORDING_FAILED"
  | "NO_AUDIO"
  | "TRANSCRIPTION_FAILED"
  | "TRANSCRIPTION_TIMEOUT"
  | "INVALID_DIRECTION"
  | "REQUEST_FAILED"
  | "INVALID_RESPONSE"
  | "COMMIT_REJECTED";

export type TextSwapStaleReason =
  | "scope-change"
  | "selection-change"
  | "commit-stale";

export type TextSwapInteractionState =
  | Readonly<{ phase: "idle" }>
  | (SessionState & Readonly<{ phase: "eligible" }>)
  | (SessionState & Readonly<{ phase: "permission" }>)
  | (SessionState & Readonly<{
      phase: "recording";
      startedAtMs: number;
      partialDirection?: string;
    }>)
  | (SessionState & Readonly<{
      phase: "transcribing";
      recorderSettled: boolean;
    }>)
  | (DirectionState & Readonly<{ phase: "ready" }>)
  | (DirectionState & Readonly<{ phase: "pending"; requestId: string }>)
  | (SessionState & Readonly<{ phase: "success"; requestId: string }>)
  | (SessionState & Readonly<{
      phase: "error";
      errorCode: TextSwapErrorCode;
      retryable: boolean;
      direction?: string;
      requestId?: string;
    }>)
  | (SessionState & Readonly<{
      phase: "stale";
      reason: TextSwapStaleReason;
    }>);

type VoiceIdentity = Readonly<{
  interactionId: string;
  attempt: number;
}>;

type RequestIdentity = Readonly<{
  interactionId: string;
  requestId: string;
}>;

export type TextSwapInteractionEvent =
  | Readonly<{ type: "enter"; interactionId: string; basis: TextSwapBasis }>
  | Readonly<{ type: "start-recording" }>
  | (VoiceIdentity & Readonly<{ type: "permission-granted"; startedAtMs: number }>)
  | (VoiceIdentity & Readonly<{
      type: "permission-failed";
      errorCode: TextSwapErrorCode;
      retryable: boolean;
    }>)
  | Readonly<{ type: "stop-recording" }>
  | (VoiceIdentity & Readonly<{ type: "duration-limit" }>)
  | (VoiceIdentity & Readonly<{ type: "partial-direction"; text: string }>)
  | (VoiceIdentity & Readonly<{ type: "recorder-stopped" }>)
  | (VoiceIdentity & Readonly<{
      type: "recording-failed";
      errorCode: TextSwapErrorCode;
      retryable: boolean;
    }>)
  | (VoiceIdentity & Readonly<{ type: "direction-resolved"; text: string }>)
  | (VoiceIdentity & Readonly<{
      type: "transcription-failed";
      errorCode: TextSwapErrorCode;
      retryable: boolean;
    }>)
  | Readonly<{ type: "accept-direction"; text: string }>
  | Readonly<{ type: "submit"; requestId: string }>
  | (RequestIdentity & Readonly<{
      type: "request-failed";
      errorCode: TextSwapErrorCode;
      retryable: boolean;
    }>)
  | (RequestIdentity & Readonly<{ type: "request-committed" }>)
  | (RequestIdentity & Readonly<{ type: "request-stale" }>)
  | Readonly<{ type: "retry-request"; requestId: string }>
  | Readonly<{ type: "dismiss" }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "scope-invalidated"; reason?: "scope-change" | "selection-change" }>
  | Readonly<{ type: "unmount" }>;

export type TextSwapInteractionEffect =
  | (SessionState & Readonly<{ type: "request-permission" }>)
  | (VoiceIdentity & Readonly<{ type: "stop-recording" }>)
  | (VoiceIdentity & Readonly<{ type: "transcribe-recording" }>)
  | (DirectionState & RequestIdentity & Readonly<{ type: "request-swap" }>)
  | (VoiceIdentity & Readonly<{
      type: "cleanup-voice";
      reason: "resolved" | "failed" | "cancelled";
    }>)
  | (RequestIdentity & Readonly<{
      type: "cleanup-request";
      reason: "committed" | "failed" | "stale" | "cancelled";
    }>)
  | Readonly<{
      type: "cancel-session";
      interactionId: string;
      reason: "person" | "scope-change" | "new-action" | "unmount";
    }>;

export type TextSwapInteractionResult = Readonly<{
  state: TextSwapInteractionState;
  effects: readonly TextSwapInteractionEffect[];
}>;

const IDLE: TextSwapInteractionState = Object.freeze({ phase: "idle" });
const NO_EFFECTS: readonly TextSwapInteractionEffect[] = Object.freeze([]);

export function createTextSwapInteractionState(): TextSwapInteractionState {
  return IDLE;
}

export function reduceTextSwapInteraction(
  state: TextSwapInteractionState,
  event: TextSwapInteractionEvent,
): TextSwapInteractionResult {
  if (event.type === "unmount") return exit(state, "unmount");
  if (event.type === "cancel") return exit(state, "person");

  if (event.type === "enter") {
    if (!isValidIdentity(event.interactionId) || !isValidBasis(event.basis)) {
      return unchanged(state);
    }
    const next = freezeState({
      phase: "eligible",
      interactionId: event.interactionId,
      attempt: 0,
      basis: ownBasis(event.basis),
    });
    return state.phase === "idle"
      ? changed(next)
      : changed(next, [{
          type: "cancel-session",
          interactionId: state.interactionId,
          reason: "new-action",
        }]);
  }

  if (state.phase === "idle") return unchanged(state);

  if (event.type === "scope-invalidated") {
    if (state.phase === "success" || state.phase === "stale") return unchanged(state);
    return changed(
      freezeState({
        ...session(state),
        phase: "stale",
        reason: event.reason ?? "scope-change",
      }),
      [{
        type: "cancel-session",
        interactionId: state.interactionId,
        reason: "scope-change",
      }],
    );
  }

  if (event.type === "dismiss") {
    if (state.phase === "error") {
      return changed(freezeState({ ...session(state), phase: "eligible" }));
    }
    if (state.phase === "success" || state.phase === "stale") return changed(IDLE);
    return unchanged(state);
  }

  if (event.type === "start-recording" && canStartRecording(state)) {
    if (state.attempt >= Number.MAX_SAFE_INTEGER) return unchanged(state);
    const next = freezeState({
      ...session(state),
      attempt: state.attempt + 1,
      phase: "permission",
    });
    return changed(next, [{ type: "request-permission", ...session(next) }]);
  }

  if (event.type === "accept-direction" && canAcceptDirection(state)) {
    const direction = normalizeTextSwapDirection(event.text);
    if (direction === null) {
      return failWithoutDirection(state, "INVALID_DIRECTION", true);
    }
    return changed(freezeState({ ...session(state), phase: "ready", direction }));
  }

  if (event.type === "retry-request" && state.phase === "error") {
    if (!state.retryable || state.direction === undefined || !isValidIdentity(event.requestId)) {
      return unchanged(state);
    }
    const next = freezeState({
      ...session(state),
      phase: "pending",
      direction: state.direction,
      requestId: event.requestId,
    });
    return changed(next, [requestEffect(next)]);
  }

  switch (state.phase) {
    case "eligible":
    case "ready":
    case "error":
    case "success":
    case "stale":
      if (state.phase === "ready" && event.type === "submit" && isValidIdentity(event.requestId)) {
        const next = freezeState({ ...state, phase: "pending", requestId: event.requestId });
        return changed(next, [requestEffect(next)]);
      }
      return unchanged(state);
    case "permission":
      if (!matchesVoice(state, event)) return unchanged(state);
      if (event.type === "permission-granted") {
        if (!Number.isFinite(event.startedAtMs) || event.startedAtMs < 0) return unchanged(state);
        return changed(freezeState({ ...session(state), phase: "recording", startedAtMs: event.startedAtMs }));
      }
      if (event.type === "permission-failed") {
        return failVoice(state, event.errorCode, event.retryable);
      }
      return unchanged(state);
    case "recording":
      if (event.type === "stop-recording" || (event.type === "duration-limit" && matchesVoice(state, event))) {
        return changed(
          freezeState({ ...session(state), phase: "transcribing", recorderSettled: false }),
          [{ type: "stop-recording", ...voiceIdentity(state) }],
        );
      }
      if (!matchesVoice(state, event)) return unchanged(state);
      if (event.type === "partial-direction") {
        const partialDirection = normalizeTextSwapDirection(event.text);
        return partialDirection === null
          ? unchanged(state)
          : changed(freezeState({ ...state, partialDirection }));
      }
      if (event.type === "recording-failed") {
        return failVoice(state, event.errorCode, event.retryable);
      }
      return unchanged(state);
    case "transcribing":
      if (!matchesVoice(state, event)) return unchanged(state);
      if (event.type === "recorder-stopped") {
        if (state.recorderSettled) return unchanged(state);
        return changed(
          freezeState({ ...state, recorderSettled: true }),
          [{ type: "transcribe-recording", ...voiceIdentity(state) }],
        );
      }
      if (event.type === "direction-resolved") {
        const direction = normalizeTextSwapDirection(event.text);
        if (direction === null) return failVoice(state, "INVALID_DIRECTION", true);
        return changed(
          freezeState({ ...session(state), phase: "ready", direction }),
          [{ type: "cleanup-voice", ...voiceIdentity(state), reason: "resolved" }],
        );
      }
      if (event.type === "recording-failed" || event.type === "transcription-failed") {
        return failVoice(state, event.errorCode, event.retryable);
      }
      return unchanged(state);
    case "pending":
      if (!matchesRequest(state, event)) return unchanged(state);
      if (event.type === "request-committed") {
        return changed(
          freezeState({ ...session(state), phase: "success", requestId: state.requestId }),
          [{
            type: "cleanup-request",
            ...requestIdentity(state),
            reason: "committed",
          }],
        );
      }
      if (event.type === "request-stale") {
        return changed(
          freezeState({ ...session(state), phase: "stale", reason: "commit-stale" }),
          [{ type: "cleanup-request", ...requestIdentity(state), reason: "stale" }],
        );
      }
      if (event.type === "request-failed") {
        return changed(
          freezeState({
            ...session(state),
            phase: "error",
            errorCode: event.errorCode,
            retryable: event.retryable,
            ...(event.retryable ? { direction: state.direction, requestId: state.requestId } : {}),
          }),
          [{ type: "cleanup-request", ...requestIdentity(state), reason: "failed" }],
        );
      }
      return unchanged(state);
    default:
      return assertNever(state);
  }
}

function canStartRecording(state: Exclude<TextSwapInteractionState, { phase: "idle" }>): boolean {
  return state.phase === "eligible" || state.phase === "ready" || state.phase === "error";
}

function canAcceptDirection(state: Exclude<TextSwapInteractionState, { phase: "idle" }>): boolean {
  return state.phase === "eligible" || state.phase === "ready" || state.phase === "error";
}

function failVoice(
  state: SessionState,
  errorCode: TextSwapErrorCode,
  retryable: boolean,
): TextSwapInteractionResult {
  return changed(
    freezeState({ ...session(state), phase: "error", errorCode, retryable }),
    [{ type: "cleanup-voice", ...voiceIdentity(state), reason: "failed" }],
  );
}

function failWithoutDirection(
  state: SessionState,
  errorCode: TextSwapErrorCode,
  retryable: boolean,
): TextSwapInteractionResult {
  return changed(freezeState({ ...session(state), phase: "error", errorCode, retryable }));
}

function exit(
  state: TextSwapInteractionState,
  reason: "person" | "unmount",
): TextSwapInteractionResult {
  if (state.phase === "idle") return unchanged(state);
  return changed(IDLE, [{ type: "cancel-session", interactionId: state.interactionId, reason }]);
}

function matchesVoice(state: SessionState, event: TextSwapInteractionEvent): boolean {
  return "interactionId" in event && "attempt" in event &&
    event.interactionId === state.interactionId && event.attempt === state.attempt;
}

function matchesRequest(
  state: RequestIdentity,
  event: TextSwapInteractionEvent,
): boolean {
  return "interactionId" in event && "requestId" in event &&
    event.interactionId === state.interactionId && event.requestId === state.requestId;
}

function session(state: SessionState): SessionState {
  return { interactionId: state.interactionId, attempt: state.attempt, basis: state.basis };
}

function voiceIdentity(state: VoiceIdentity): VoiceIdentity {
  return { interactionId: state.interactionId, attempt: state.attempt };
}

function requestIdentity(state: RequestIdentity): RequestIdentity {
  return { interactionId: state.interactionId, requestId: state.requestId };
}

function requestEffect(
  state: DirectionState & RequestIdentity,
): Extract<TextSwapInteractionEffect, { type: "request-swap" }> {
  return {
    type: "request-swap",
    interactionId: state.interactionId,
    attempt: state.attempt,
    basis: state.basis,
    direction: state.direction,
    requestId: state.requestId,
  };
}

function isValidBasis(basis: TextSwapBasis): boolean {
  const selection = basis.selection;
  const lineage = basis.lineage;
  const selectedNode = lineage.at(-1);
  return isValidIdentity(basis.treeId) &&
    Number.isSafeInteger(basis.baseRevision) && basis.baseRevision >= 0 &&
    Number.isSafeInteger(basis.documentEpoch) && basis.documentEpoch >= 0 &&
    selection.type === "segment-range" &&
    isValidIdentity(selection.nodeId) &&
    Number.isSafeInteger(selection.start) &&
    Number.isSafeInteger(selection.end) &&
    selection.start >= 0 &&
    selection.end > selection.start &&
    selection.selectedText.length > 0 &&
    selection.selectedText === basis.sourceText &&
    isMatterLocale(basis.locale) &&
    lineage.length > 0 &&
    selectedNode !== undefined &&
    selectedNode.id === selection.nodeId &&
    selectedNode.text.slice(selection.start, selection.end) === basis.sourceText &&
    new Set(lineage.map((node) => node.id)).size === lineage.length &&
    lineage.every((node, index) =>
      isValidIdentity(node.id) &&
      node.text.trim().length > 0 &&
      (index === 0 ? node.parentId === null : node.parentId === lineage[index - 1]?.id)
    );
}

function isValidIdentity(value: string): boolean {
  return value.trim().length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value);
}

function ownBasis(basis: TextSwapBasis): TextSwapBasis {
  return Object.freeze({
    treeId: basis.treeId,
    baseRevision: basis.baseRevision,
    documentEpoch: basis.documentEpoch,
    selection: Object.freeze({ ...basis.selection }),
    sourceText: basis.sourceText,
    locale: basis.locale,
    lineage: Object.freeze(basis.lineage.map((node) => Object.freeze({ ...node }))),
  });
}

function freezeState<T extends TextSwapInteractionState>(state: T): T {
  return Object.freeze(state);
}

function changed(
  state: TextSwapInteractionState,
  effects: readonly TextSwapInteractionEffect[] = NO_EFFECTS,
): TextSwapInteractionResult {
  return Object.freeze({ state, effects: Object.freeze(effects) });
}

function unchanged(state: TextSwapInteractionState): TextSwapInteractionResult {
  return Object.freeze({ state, effects: NO_EFFECTS });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled text swap phase: ${String(value)}`);
}
