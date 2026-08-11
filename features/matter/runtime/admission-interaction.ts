/**
 * Owns admission lifecycle authority without owning browser resources or
 * transcript content. Effects identify the one attempt an adapter may act on;
 * every asynchronous completion must return the same token and attempt.
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
  | (AttemptState & { readonly phase: "committing" })
  | (AttemptState & {
      readonly phase: "error";
      readonly errorCode: AdmissionErrorCode;
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
  | { readonly type: "cancel" }
  | { readonly type: "retry" }
  | { readonly type: "dismiss" }
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
      readonly reason: "person" | "scope-change" | "unmount";
    })
  | (AttemptIdentity & {
      readonly type: "cleanup-operation";
      readonly reason: "failed" | "committed";
    });

export type AdmissionInteractionResult = {
  readonly state: AdmissionInteractionState;
  readonly effects: readonly AdmissionInteractionEffect[];
};

const IDLE: AdmissionInteractionState = Object.freeze({ phase: "idle" });
const NO_EFFECTS: readonly AdmissionInteractionEffect[] = Object.freeze([]);

export function createAdmissionInteractionState(): AdmissionInteractionState {
  return IDLE;
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
  if (event.type === "dismiss" && state.phase === "error") return changed(IDLE);
  if (event.type === "retry" && state.phase === "error") {
    if (state.attempt >= Number.MAX_SAFE_INTEGER) return unchanged(state);
    const next: AdmissionInteractionState = {
      phase: "requesting",
      token: state.token,
      attempt: state.attempt + 1,
      anchor: state.anchor,
    };
    return changed(next, [{ type: "request-microphone", ...identityAndAnchor(next) }]);
  }

  switch (state.phase) {
    case "requesting":
      if (!matches(state, event)) return unchanged(state);
      if (event.type === "permission-granted") {
        if (!Number.isFinite(event.startedAtMs) || event.startedAtMs < 0) return unchanged(state);
        return changed({ ...identityAndAnchor(state), phase: "recording", startedAtMs: event.startedAtMs });
      }
      if (event.type === "permission-failed") return fail(state, event.errorCode);
      return unchanged(state);
    case "recording":
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
          { ...identityAndAnchor(state), phase: "committing" },
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
    case "error":
      return unchanged(state);
    default:
      return assertNever(state);
  }
}

function cancel(
  state: AdmissionInteractionState,
  reason: "person" | "scope-change" | "unmount",
): AdmissionInteractionResult {
  if (state.phase === "idle" || state.phase === "error") return changed(IDLE);
  return changed(IDLE, [{ type: "cancel-operation", ...identity(state), reason }]);
}

function fail(state: AttemptState, errorCode: AdmissionErrorCode): AdmissionInteractionResult {
  return changed(
    { ...identityAndAnchor(state), phase: "error", errorCode },
    [{ type: "cleanup-operation", ...identity(state), reason: "failed" }],
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
