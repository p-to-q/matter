import { MAX_NODE_TEXT_CODE_UNITS } from "../tree/invariants";

/**
 * Owns admission lifecycle authority without owning browser resources. Effects
 * identify the one attempt an adapter may act on; every asynchronous
 * completion must return the same token and attempt. Words a person already
 * submitted may be held here as transient, bounded interaction state so that
 * a lost target never discards them silently; they never enter material,
 * history, or persistence from this state.
 */

export type AdmissionAnchor =
  | {
      readonly kind: "root";
      readonly treeId: string;
      readonly baseRevision: number;
    }
  | {
      readonly kind: "child";
      readonly treeId: string;
      readonly baseRevision: number;
      readonly parentNodeId: string;
    };

type AttemptState = {
  readonly token: string;
  readonly attempt: number;
  readonly anchor: AdmissionAnchor;
};

export type AdmissionErrorCode =
  | "MICROPHONE_DENIED"
  | "MICROPHONE_UNAVAILABLE"
  | "RECORDING_UNSUPPORTED"
  | "RECORDING_FAILED"
  | "NO_AUDIO"
  | "TRANSCRIPTION_FAILED"
  | "TRANSCRIPTION_TIMEOUT"
  | "EMPTY_TRANSCRIPT"
  | "COMMIT_REJECTED"
  | "STALE_TARGET"
  | "INTERNAL_FAILURE";

export type AdmissionInteractionState =
  | { readonly phase: "idle" }
  | (AttemptState & { readonly phase: "requesting" })
  | (AttemptState & {
      readonly phase: "recording";
      readonly startedAtMs: number;
      readonly transcript?: string;
    })
  | (AttemptState & {
      readonly phase: "stopping";
      readonly reason: "person" | "duration-limit";
    })
  | (AttemptState & { readonly phase: "transcribing" })
  | (AttemptState & { readonly phase: "committing"; readonly transcript: string })
  | (AttemptState & {
      readonly phase: "error";
      readonly errorCode: AdmissionErrorCode;
      /** Stop is the submission boundary; submitted failures survive hidden UI. */
      readonly submitted: boolean;
      /**
       * Submitted words a commit could not place. They leave this state only
       * by an explicit placement or discard, never by retry or a timer.
       */
      readonly transcript?: string;
    });

export type AdmissionInteractionEvent =
  | {
      readonly type: "start";
      readonly token: string;
      readonly anchor: AdmissionAnchor;
    }
  | ({ readonly type: "permission-granted"; readonly startedAtMs: number } & AttemptIdentity)
  | ({ readonly type: "permission-failed"; readonly errorCode: AdmissionErrorCode } & AttemptIdentity)
  | { readonly type: "stop" }
  | ({ readonly type: "duration-limit" } & AttemptIdentity)
  | ({ readonly type: "transcript-updated"; readonly transcript: string } & AttemptIdentity)
  | ({ readonly type: "recorder-stopped" } & AttemptIdentity)
  | ({ readonly type: "recording-failed"; readonly errorCode: AdmissionErrorCode } & AttemptIdentity)
  | ({ readonly type: "transcription-succeeded"; readonly transcript: string } & AttemptIdentity)
  | ({ readonly type: "transcription-failed"; readonly errorCode: AdmissionErrorCode } & AttemptIdentity)
  | ({ readonly type: "commit-succeeded" } & AttemptIdentity)
  | ({ readonly type: "commit-failed"; readonly errorCode: AdmissionErrorCode } & AttemptIdentity)
  /** The person withdraws the current attempt. */
  | { readonly type: "cancel" }
  /**
   * Re-records the same target. `revision` is the current material revision
   * and `targetAvailable` whether the frozen parent still exists in it.
   */
  | { readonly type: "retry"; readonly revision: number; readonly targetAvailable: boolean }
  /** Places held words at an explicit current admission target. */
  | { readonly type: "place"; readonly anchor: AdmissionAnchor }
  | { readonly type: "dismiss" }
  /** The frozen parent vanished while the person was still capturing. */
  | { readonly type: "target-lost" }
  /** Modal chrome or device revocation ends unsubmitted capture only. */
  | { readonly type: "release-capture" }
  /** A hidden page also drops unsubmitted recovery surfaces. */
  | { readonly type: "suspend" }
  | { readonly type: "scope-invalidated" }
  | { readonly type: "unmount" };

type AttemptIdentity = {
  readonly token: string;
  readonly attempt: number;
};

export type AdmissionInteractionEffect =
  | (AttemptState & { readonly type: "request-microphone" })
  | (AttemptIdentity & { readonly type: "stop-recording" })
  | (AttemptIdentity & { readonly type: "transcribe-recording" })
  | (AttemptState & {
      readonly type: "commit-admission";
      readonly transcript: string;
    })
  | (AttemptIdentity & {
      readonly type: "cancel-operation";
      readonly reason: AdmissionCancelReason;
    })
  | (AttemptIdentity & {
      readonly type: "cleanup-operation";
      readonly reason: "failed" | "committed";
    });

export type AdmissionCancelReason = "person" | "suspended" | "scope-change" | "unmount";

export type AdmissionInteractionResult = {
  readonly state: AdmissionInteractionState;
  readonly effects: readonly AdmissionInteractionEffect[];
};

const IDLE: AdmissionInteractionState = Object.freeze({ phase: "idle" });
const NO_EFFECTS: readonly AdmissionInteractionEffect[] = Object.freeze([]);

export function createAdmissionInteractionState(): AdmissionInteractionState {
  return IDLE;
}

/** Only live microphone phases own the exclusive pointer/audio surface. */
export function admissionCaptureIsActive(state: AdmissionInteractionState): boolean {
  return state.phase === "requesting" ||
    state.phase === "recording" ||
    state.phase === "stopping";
}

export function reduceAdmissionInteraction(
  state: AdmissionInteractionState,
  event: AdmissionInteractionEvent,
): AdmissionInteractionResult {
  if (event.type === "unmount") {
    return cancel(state, "unmount");
  }

  if (event.type === "scope-invalidated") {
    return cancel(state, "scope-change");
  }

  if (state.phase === "idle") {
    if (event.type !== "start" || !isValidToken(event.token) || !isValidAnchor(event.anchor)) {
      return unchanged(state);
    }
    const next: AdmissionInteractionState = {
      phase: "requesting",
      token: event.token,
      attempt: 1,
      anchor: ownAnchor(event.anchor),
    };
    return changed(next, [{ type: "request-microphone", ...identityAndAnchor(next) }]);
  }

  if (event.type === "cancel") return cancel(state, "person");
  if (event.type === "release-capture" || event.type === "suspend") {
    if (state.phase === "requesting" || state.phase === "recording") {
      return cancel(state, "suspended");
    }
    // Stop is the submission boundary. A hidden page may drop only a recovery
    // surface for capture the person never submitted.
    return event.type === "suspend" && state.phase === "error" && !state.submitted
      ? changed(IDLE)
      : unchanged(state);
  }
  if (state.phase === "error") return reduceError(state, event);

  switch (state.phase) {
    case "requesting":
      if (event.type === "target-lost") return fail(state, "STALE_TARGET");
      if (!matches(state, event)) return unchanged(state);
      if (event.type === "permission-granted") {
        if (!Number.isFinite(event.startedAtMs) || event.startedAtMs < 0) return unchanged(state);
        return changed({ ...identityAndAnchor(state), phase: "recording", startedAtMs: event.startedAtMs });
      }
      if (event.type === "permission-failed") return fail(state, event.errorCode);
      return unchanged(state);
    case "recording":
      // Live partials are not a submission. A lost parent ends capture with a
      // visible recovery state instead of a silent return to idle.
      if (event.type === "target-lost") return fail(state, "STALE_TARGET");
      if (event.type === "stop" || (event.type === "duration-limit" && matches(state, event))) {
        const reason = event.type === "stop" ? "person" : "duration-limit";
        return changed(
          { ...identityAndAnchor(state), phase: "stopping", reason },
          [{ type: "stop-recording", ...identity(state) }],
        );
      }
      if (!matches(state, event)) return unchanged(state);
      if (event.type === "transcript-updated") {
        const transcript = event.transcript.trim();
        return transcript.length > 0 && transcript.length <= 8_000
          ? changed({ ...state, transcript })
          : unchanged(state);
      }
      if (event.type === "recording-failed") return fail(state, event.errorCode);
      return unchanged(state);
    case "stopping":
      if (!matches(state, event)) return unchanged(state);
      if (event.type === "recorder-stopped") {
        return changed(
          { ...identityAndAnchor(state), phase: "transcribing" },
          [{ type: "transcribe-recording", ...identity(state) }],
        );
      }
      if (event.type === "recording-failed") return fail(state, event.errorCode);
      return unchanged(state);
    case "transcribing":
      if (!matches(state, event)) return unchanged(state);
      if (event.type === "transcription-failed") return fail(state, event.errorCode);
      if (event.type === "transcription-succeeded") {
        const transcript = event.transcript.trim();
        if (transcript.length === 0) return fail(state, "EMPTY_TRANSCRIPT");
        return changed(
          { ...identityAndAnchor(state), phase: "committing", transcript },
          [{ type: "commit-admission", ...identityAndAnchor(state), transcript }],
        );
      }
      return unchanged(state);
    case "committing":
      if (!matches(state, event)) return unchanged(state);
      if (event.type === "commit-failed") return fail(state, event.errorCode);
      if (event.type === "commit-succeeded") {
        return changed(IDLE, [{ type: "cleanup-operation", ...identity(state), reason: "committed" }]);
      }
      return unchanged(state);
    default:
      return assertNever(state);
  }
}

function reduceError(
  state: Extract<AdmissionInteractionState, { phase: "error" }>,
  event: AdmissionInteractionEvent,
): AdmissionInteractionResult {
  if (event.type === "dismiss") return changed(IDLE);
  if (state.attempt >= Number.MAX_SAFE_INTEGER) return unchanged(state);
  if (event.type === "retry") {
    // Held words are resolved only by placing or discarding them; recording
    // again must never replace them behind the person's back.
    if (state.transcript !== undefined) return unchanged(state);
    if (!event.targetAvailable) {
      return state.errorCode === "STALE_TARGET"
        ? unchanged(state)
        : changed({ ...state, errorCode: "STALE_TARGET" });
    }
    if (!Number.isSafeInteger(event.revision) || event.revision < 0) return unchanged(state);
    // Revision is a receipt, not a cancellation token: the same parent is
    // re-anchored to the material the person is now looking at.
    const next: AdmissionInteractionState = {
      phase: "requesting",
      token: state.token,
      attempt: state.attempt + 1,
      anchor: ownAnchor({ ...state.anchor, baseRevision: event.revision }),
    };
    return changed(next, [{ type: "request-microphone", ...identityAndAnchor(next) }]);
  }
  if (event.type === "place") {
    if (
      state.transcript === undefined ||
      !isValidAnchor(event.anchor) ||
      event.anchor.treeId !== state.anchor.treeId
    ) return unchanged(state);
    const next: AdmissionInteractionState = {
      phase: "committing",
      token: state.token,
      attempt: state.attempt + 1,
      anchor: ownAnchor(event.anchor),
      transcript: state.transcript,
    };
    return changed(next, [{
      type: "commit-admission",
      ...identityAndAnchor(next),
      transcript: state.transcript,
    }]);
  }
  return unchanged(state);
}

function cancel(
  state: AdmissionInteractionState,
  reason: AdmissionCancelReason,
): AdmissionInteractionResult {
  if (state.phase === "idle" || state.phase === "error") return changed(IDLE);
  return changed(IDLE, [{ type: "cancel-operation", ...identity(state), reason }]);
}

function fail(
  state: Exclude<AdmissionInteractionState, { phase: "idle" } | { phase: "error" }>,
  errorCode: AdmissionErrorCode,
): AdmissionInteractionResult {
  // Every commit failure keeps the words it could not place: a target that
  // vanished, a rejection, or a local fault. Transcription already bounds
  // them to one node, so the bound here only refuses a malformed attempt.
  const transcript = state.phase === "committing" &&
    state.transcript.length <= MAX_NODE_TEXT_CODE_UNITS
    ? state.transcript
    : undefined;
  return changed(
    {
      ...identityAndAnchor(state),
      phase: "error",
      errorCode,
      submitted: state.phase !== "requesting" && state.phase !== "recording",
      ...(transcript === undefined ? {} : { transcript }),
    },
    [{ type: "cleanup-operation", ...identity(state), reason: "failed" }],
  );
}

/** Whether a later placement may still commit the held words. */
export function admissionHoldsTranscript(
  state: AdmissionInteractionState,
): state is Extract<AdmissionInteractionState, { phase: "error" }> & { readonly transcript: string } {
  return state.phase === "error" && state.transcript !== undefined;
}

/**
 * Whether the person has submitted spoken words that no material holds yet:
 * Stop (or the duration limit) was reached and the words are still being
 * finalized, transcribed, or committed, or a failed commit holds them.
 */
export function admissionHoldsSubmittedWords(state: AdmissionInteractionState): boolean {
  return state.phase === "stopping" ||
    state.phase === "transcribing" ||
    state.phase === "committing" ||
    admissionHoldsTranscript(state);
}

/** Retry and placement address the same material when these identities agree. */
export function sameAdmissionTarget(left: AdmissionAnchor, right: AdmissionAnchor): boolean {
  return left.treeId === right.treeId && (
    left.kind === "root"
      ? right.kind === "root"
      : right.kind === "child" && left.parentNodeId === right.parentNodeId
  );
}

function matches(state: AttemptState, event: AdmissionInteractionEvent): boolean {
  return "token" in event && "attempt" in event &&
    event.token === state.token && event.attempt === state.attempt;
}

function identity(state: AttemptState): AttemptIdentity {
  return { token: state.token, attempt: state.attempt };
}

function identityAndAnchor(state: AttemptState): AttemptState {
  return { ...identity(state), anchor: state.anchor };
}

function isValidToken(token: string): boolean {
  return token.trim().length > 0;
}

function isValidAnchor(anchor: AdmissionAnchor): boolean {
  return isValidToken(anchor.treeId) &&
    Number.isSafeInteger(anchor.baseRevision) &&
    anchor.baseRevision >= 0 &&
    (anchor.kind === "root" || isValidToken(anchor.parentNodeId));
}

function ownAnchor(anchor: AdmissionAnchor): AdmissionAnchor {
  return Object.freeze({ ...anchor });
}

function changed(
  state: AdmissionInteractionState,
  effects: readonly AdmissionInteractionEffect[] = NO_EFFECTS,
): AdmissionInteractionResult {
  return { state, effects };
}

function unchanged(state: AdmissionInteractionState): AdmissionInteractionResult {
  return { state, effects: NO_EFFECTS };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled admission phase: ${String(value)}`);
}
