import { describe, expect, it } from "vitest";
import {
  admissionCaptureIsActive,
  admissionHoldsSubmittedWords,
  admissionHoldsTranscript,
  createAdmissionInteractionState,
  reduceAdmissionInteraction,
  type AdmissionAnchor,
  type AdmissionInteractionEvent,
  type AdmissionInteractionState,
} from "./admission-interaction";

const ROOT: AdmissionAnchor = { kind: "root", treeId: "tree_1", baseRevision: 4 };
const CHILD: AdmissionAnchor = {
  kind: "child",
  treeId: "tree_1",
  baseRevision: 4,
  parentNodeId: "parent_1",
};

function start(anchor: AdmissionAnchor = CHILD) {
  return reduceAdmissionInteraction(createAdmissionInteractionState(), {
    type: "start",
    token: "voice_1",
    anchor,
  });
}

function recording(anchor: AdmissionAnchor = CHILD): AdmissionInteractionState {
  const requested = start(anchor).state;
  return reduceAdmissionInteraction(requested, {
    type: "permission-granted",
    token: "voice_1",
    attempt: 1,
    startedAtMs: 20,
  }).state;
}

function committing(transcript = "thought"): AdmissionInteractionState {
  return reduceAdmissionInteraction(transcribing(), {
    type: "transcription-succeeded",
    token: "voice_1",
    attempt: 1,
    transcript,
  }).state;
}

function transcribing(): AdmissionInteractionState {
  const stopped = reduceAdmissionInteraction(recording(), { type: "stop" }).state;
  return reduceAdmissionInteraction(stopped, {
    type: "recorder-stopped",
    token: "voice_1",
    attempt: 1,
  }).state;
}

describe("submitted spoken words", () => {
  it("counts words from Stop until material holds them, and held words after a failed commit", () => {
    const stopping = reduceAdmissionInteraction(recording(), { type: "stop" }).state;
    const held = reduceAdmissionInteraction(committing("the words I said"), {
      type: "commit-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "STALE_TARGET",
    }).state;
    const failedTranscription = reduceAdmissionInteraction(transcribing(), {
      type: "transcription-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "TRANSCRIPTION_FAILED",
    }).state;
    const committed = reduceAdmissionInteraction(committing(), {
      type: "commit-succeeded",
      token: "voice_1",
      attempt: 1,
    }).state;

    expect([stopping, transcribing(), committing(), held].map(admissionHoldsSubmittedWords))
      .toEqual([true, true, true, true]);
    // Live capture is not yet submitted; a failed transcription kept no words;
    // committed words are material.
    expect([
      createAdmissionInteractionState(),
      start().state,
      recording(),
      failedTranscription,
      committed,
    ].map(admissionHoldsSubmittedWords)).toEqual([false, false, false, false, false]);
  });
});

describe("admission interaction reducer", () => {
  it("locks the shared canvas only for live microphone capture", () => {
    const stopping = reduceAdmissionInteraction(recording(), { type: "stop" }).state;
    expect(admissionCaptureIsActive(createAdmissionInteractionState())).toBe(false);
    expect(admissionCaptureIsActive(start().state)).toBe(true);
    expect(admissionCaptureIsActive(recording())).toBe(true);
    expect(admissionCaptureIsActive(stopping)).toBe(true);
    expect(admissionCaptureIsActive(transcribing())).toBe(false);
    expect(admissionCaptureIsActive(committing())).toBe(false);
  });

  it.each([ROOT, CHILD])("starts one frozen %s attempt and requests a microphone", (anchor) => {
    const result = start(anchor);

    expect(result).toEqual({
      state: { phase: "requesting", token: "voice_1", attempt: 1, anchor },
      effects: [{ type: "request-microphone", token: "voice_1", attempt: 1, anchor }],
    });
  });

  it("rejects malformed starts without allocating an operation", () => {
    const idle = createAdmissionInteractionState();
    for (const event of [
      { type: "start", token: "", anchor: ROOT },
      { type: "start", token: "x", anchor: { ...ROOT, baseRevision: -1 } },
      { type: "start", token: "x", anchor: { ...CHILD, parentNodeId: "" } },
    ] as const) {
      const result = reduceAdmissionInteraction(idle, event);
      expect(result.state).toBe(idle);
      expect(result.effects).toEqual([]);
    }
  });

  it("ignores duplicate start and mismatched permission completions", () => {
    const state = start().state;
    for (const event of [
      { type: "start", token: "voice_2", anchor: ROOT },
      { type: "permission-granted", token: "voice_2", attempt: 1, startedAtMs: 1 },
      { type: "permission-granted", token: "voice_1", attempt: 2, startedAtMs: 1 },
    ] as const) {
      const result = reduceAdmissionInteraction(state, event);
      expect(result.state).toBe(state);
      expect(result.effects).toEqual([]);
    }
  });

  it("records only after the matching permission completion", () => {
    expect(recording()).toEqual({
      phase: "recording",
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      startedAtMs: 20,
    });
  });

  it.each([
    ["person", { type: "stop" }],
    ["duration-limit", { type: "duration-limit", token: "voice_1", attempt: 1 }],
  ] as const)("stops for %s and waits for the final recorder completion", (reason, event) => {
    const result = reduceAdmissionInteraction(recording(), event);

    expect(result).toEqual({
      state: { phase: "stopping", token: "voice_1", attempt: 1, anchor: CHILD, reason },
      effects: [{ type: "stop-recording", token: "voice_1", attempt: 1 }],
    });
    expect(reduceAdmissionInteraction(result.state, event).state).toBe(result.state);
  });

  it("transcribes only after final recorder chunks have completed", () => {
    const stopping = reduceAdmissionInteraction(recording(), { type: "stop" }).state;
    const result = reduceAdmissionInteraction(stopping, {
      type: "recorder-stopped",
      token: "voice_1",
      attempt: 1,
    });

    expect(result).toEqual({
      state: { phase: "transcribing", token: "voice_1", attempt: 1, anchor: CHILD },
      effects: [{ type: "transcribe-recording", token: "voice_1", attempt: 1 }],
    });
  });

  it("commits the final transcript immediately without waiting for repair", () => {
    const result = reduceAdmissionInteraction(transcribing(), {
      type: "transcription-succeeded",
      token: "voice_1",
      attempt: 1,
      transcript: "  an unfinished thought  ",
    });

    expect(result.state).toEqual({
      phase: "committing",
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      transcript: "an unfinished thought",
    });
    expect(result.effects).toEqual([
      {
        type: "commit-admission",
        token: "voice_1",
        attempt: 1,
        anchor: CHILD,
        transcript: "an unfinished thought",
      },
    ]);
  });

  it("finishes only the matching commit and requests deterministic cleanup", () => {
    const result = reduceAdmissionInteraction(committing(), {
      type: "commit-succeeded",
      token: "voice_1",
      attempt: 1,
    });

    expect(result).toEqual({
      state: { phase: "idle" },
      effects: [{ type: "cleanup-operation", token: "voice_1", attempt: 1, reason: "committed" }],
    });
  });

  it.each([
    ["requesting", start().state],
    ["recording", recording()],
    ["stopping", reduceAdmissionInteraction(recording(), { type: "stop" }).state],
    ["transcribing", transcribing()],
    ["committing", committing()],
  ])("cancels %s with one complete cleanup instruction", (_phase, state) => {
    const result = reduceAdmissionInteraction(state, { type: "cancel" });
    expect(result).toEqual({
      state: { phase: "idle" },
      effects: [{ type: "cancel-operation", token: "voice_1", attempt: 1, reason: "person" }],
    });
  });

  it("uses the same cleanup boundary on unmount and ignores every late completion", () => {
    const pending = transcribing();
    const unmounted = reduceAdmissionInteraction(pending, { type: "unmount" });
    expect(unmounted.effects).toEqual([
      { type: "cancel-operation", token: "voice_1", attempt: 1, reason: "unmount" },
    ]);

    const late: AdmissionInteractionEvent[] = [
      { type: "recorder-stopped", token: "voice_1", attempt: 1 },
      { type: "transcription-succeeded", token: "voice_1", attempt: 1, transcript: "late" },
      { type: "commit-succeeded", token: "voice_1", attempt: 1 },
    ];
    for (const event of late) {
      const result = reduceAdmissionInteraction(unmounted.state, event);
      expect(result.state).toBe(unmounted.state);
      expect(result.effects).toEqual([]);
    }
  });

  it("cancels browser work when the material scope is invalidated", () => {
    const result = reduceAdmissionInteraction(recording(), {
      type: "scope-invalidated",
    });
    expect(result).toEqual({
      state: { phase: "idle" },
      effects: [
        {
          type: "cancel-operation",
          token: "voice_1",
          attempt: 1,
          reason: "scope-change",
        },
      ],
    });
  });

  it.each([
    ["permission", start().state, { type: "permission-failed", token: "voice_1", attempt: 1, errorCode: "MICROPHONE_DENIED" }],
    ["recording", recording(), { type: "recording-failed", token: "voice_1", attempt: 1, errorCode: "NO_AUDIO" }],
    ["stopping", reduceAdmissionInteraction(recording(), { type: "stop" }).state, { type: "recording-failed", token: "voice_1", attempt: 1, errorCode: "RECORDING_FAILED" }],
    ["transcription", transcribing(), { type: "transcription-failed", token: "voice_1", attempt: 1, errorCode: "TRANSCRIPTION_TIMEOUT" }],
    ["commit", committing(), { type: "commit-failed", token: "voice_1", attempt: 1, errorCode: "STALE_TARGET" }],
  ] as const)("makes %s failure recoverable after cleanup", (name, state, event) => {
    const result = reduceAdmissionInteraction(state, event);
    expect(result.state).toMatchObject({
      phase: "error",
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      errorCode: event.errorCode,
      submitted: name === "stopping" || name === "transcription" || name === "commit",
    });
    expect(result.effects).toEqual([
      { type: "cleanup-operation", token: "voice_1", attempt: 1, reason: "failed" },
    ]);
  });

  it("classifies a blank transcript without passing content to commit", () => {
    const result = reduceAdmissionInteraction(transcribing(), {
      type: "transcription-succeeded",
      token: "voice_1",
      attempt: 1,
      transcript: " \n ",
    });
    expect(result.state).toMatchObject({ phase: "error", errorCode: "EMPTY_TRANSCRIPT" });
    expect(result.effects).toEqual([
      { type: "cleanup-operation", token: "voice_1", attempt: 1, reason: "failed" },
    ]);
  });

  it("retries the frozen anchor with a monotonic attempt and rejects late prior-attempt events", () => {
    const failed = reduceAdmissionInteraction(start().state, {
      type: "permission-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "MICROPHONE_UNAVAILABLE",
    }).state;
    const retried = reduceAdmissionInteraction(failed, {
      type: "retry",
      revision: 4,
      targetAvailable: true,
    });

    expect(retried).toEqual({
      state: { phase: "requesting", token: "voice_1", attempt: 2, anchor: CHILD },
      effects: [{ type: "request-microphone", token: "voice_1", attempt: 2, anchor: CHILD }],
    });
    const late = reduceAdmissionInteraction(retried.state, {
      type: "permission-granted",
      token: "voice_1",
      attempt: 1,
      startedAtMs: 30,
    });
    expect(late.state).toBe(retried.state);
    expect(late.effects).toEqual([]);
  });

  it("owns the activation anchor and ignores a stale prior-attempt duration limit", () => {
    const mutableAnchor = {
      kind: "child" as const,
      treeId: "tree_1",
      baseRevision: 4,
      parentNodeId: "parent_1",
    };
    const requested = reduceAdmissionInteraction(createAdmissionInteractionState(), {
      type: "start",
      token: "voice_1",
      anchor: mutableAnchor,
    });
    mutableAnchor.parentNodeId = "relocated";
    expect(requested.state).toMatchObject({
      anchor: { parentNodeId: "parent_1" },
    });
    if (requested.state.phase === "idle") throw new Error("request missing");
    expect(Object.isFrozen(requested.state.anchor)).toBe(true);

    const failed = reduceAdmissionInteraction(requested.state, {
      type: "permission-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "MICROPHONE_UNAVAILABLE",
    }).state;
    const retried = reduceAdmissionInteraction(failed, {
      type: "retry",
      revision: 4,
      targetAvailable: true,
    }).state;
    const retriedRecording = reduceAdmissionInteraction(retried, {
      type: "permission-granted",
      token: "voice_1",
      attempt: 2,
      startedAtMs: 50,
    }).state;
    const stale = reduceAdmissionInteraction(retriedRecording, {
      type: "duration-limit",
      token: "voice_1",
      attempt: 1,
    });
    expect(stale.state).toBe(retriedRecording);
    expect(stale.effects).toEqual([]);
  });

  it("dismisses errors, and cancel or unmount also clears an already-clean error", () => {
    const error = reduceAdmissionInteraction(start().state, {
      type: "permission-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "MICROPHONE_DENIED",
    }).state;
    for (const event of [{ type: "dismiss" }, { type: "cancel" }, { type: "unmount" }] as const) {
      expect(reduceAdmissionInteraction(error, event)).toEqual({ state: { phase: "idle" }, effects: [] });
    }
  });

  it("re-anchors a retry to the current revision instead of dropping the turn", () => {
    const failed = reduceAdmissionInteraction(transcribing(), {
      type: "transcription-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "TRANSCRIPTION_FAILED",
    }).state;
    const retried = reduceAdmissionInteraction(failed, {
      type: "retry",
      revision: 9,
      targetAvailable: true,
    });
    const anchor = { ...CHILD, baseRevision: 9 };
    expect(retried).toEqual({
      state: { phase: "requesting", token: "voice_1", attempt: 2, anchor },
      effects: [{ type: "request-microphone", token: "voice_1", attempt: 2, anchor }],
    });
    if (retried.state.phase === "idle") throw new Error("retry missing");
    expect(Object.isFrozen(retried.state.anchor)).toBe(true);
  });

  it("turns a retry against a vanished parent into a visible stale target, never idle", () => {
    const failed = reduceAdmissionInteraction(start().state, {
      type: "permission-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "MICROPHONE_UNAVAILABLE",
    }).state;
    const stale = reduceAdmissionInteraction(failed, {
      type: "retry",
      revision: 5,
      targetAvailable: false,
    });
    expect(stale.state).toEqual({
      phase: "error",
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      errorCode: "STALE_TARGET",
      submitted: false,
    });
    expect(stale.effects).toEqual([]);
    const again = reduceAdmissionInteraction(stale.state, {
      type: "retry",
      revision: 5,
      targetAvailable: false,
    });
    expect(again.state).toBe(stale.state);
    expect(reduceAdmissionInteraction(stale.state, {
      type: "retry",
      revision: 6,
      targetAvailable: true,
    }).state).toMatchObject({ phase: "requesting", attempt: 2, anchor: { baseRevision: 6 } });
  });

  it("keeps submitted words through any failed commit, bounded to one node", () => {
    const stale = reduceAdmissionInteraction(committing("the words I said"), {
      type: "commit-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "STALE_TARGET",
    });
    expect(stale.state).toEqual({
      phase: "error",
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      errorCode: "STALE_TARGET",
      submitted: true,
      transcript: "the words I said",
    });
    expect(stale.effects).toEqual([
      { type: "cleanup-operation", token: "voice_1", attempt: 1, reason: "failed" },
    ]);
    expect(admissionHoldsTranscript(stale.state)).toBe(true);

    const rejected = reduceAdmissionInteraction(committing("the words I said"), {
      type: "commit-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "COMMIT_REJECTED",
    }).state;
    expect(rejected).toMatchObject({
      errorCode: "COMMIT_REJECTED",
      submitted: true,
      transcript: "the words I said",
    });
    expect(reduceAdmissionInteraction(committing("the words I said"), {
      type: "commit-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "INTERNAL_FAILURE",
    }).state).toMatchObject({ transcript: "the words I said" });
    // Words before a commit are not yet held; failures there hold nothing.
    expect(reduceAdmissionInteraction(transcribing(), {
      type: "transcription-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "TRANSCRIPTION_FAILED",
    }).state).not.toHaveProperty("transcript");
    const oversized = reduceAdmissionInteraction(committing("念".repeat(2_001)), {
      type: "commit-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "STALE_TARGET",
    }).state;
    expect(oversized).not.toHaveProperty("transcript");
  });

  it("places held words only at an explicit target and only once", () => {
    const held = reduceAdmissionInteraction(committing("held words"), {
      type: "commit-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "STALE_TARGET",
    }).state;
    // Recording again would replace the held words behind the person's back.
    expect(reduceAdmissionInteraction(held, {
      type: "retry",
      revision: 5,
      targetAvailable: true,
    }).state).toBe(held);
    expect(reduceAdmissionInteraction(held, {
      type: "place",
      anchor: { ...ROOT, treeId: "another_tree" },
    }).state).toBe(held);

    const target = { kind: "child" as const, treeId: "tree_1", baseRevision: 7, parentNodeId: "document" };
    const placed = reduceAdmissionInteraction(held, { type: "place", anchor: target });
    expect(placed).toEqual({
      state: {
        phase: "committing",
        token: "voice_1",
        attempt: 2,
        anchor: target,
        transcript: "held words",
      },
      effects: [{
        type: "commit-admission",
        token: "voice_1",
        attempt: 2,
        anchor: target,
        transcript: "held words",
      }],
    });
    // The failed attempt can no longer settle the placement.
    expect(reduceAdmissionInteraction(placed.state, {
      type: "commit-succeeded",
      token: "voice_1",
      attempt: 1,
    }).state).toBe(placed.state);
    expect(reduceAdmissionInteraction(placed.state, { type: "place", anchor: target }).state)
      .toBe(placed.state);

    const withoutWords = reduceAdmissionInteraction(start().state, {
      type: "permission-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "MICROPHONE_DENIED",
    }).state;
    expect(reduceAdmissionInteraction(withoutWords, { type: "place", anchor: target }).state)
      .toBe(withoutWords);
    expect(reduceAdmissionInteraction(held, { type: "dismiss" }))
      .toEqual({ state: { phase: "idle" }, effects: [] });
  });

  it("makes a lost parent during capture visible and leaves submitted work to commit revalidation", () => {
    for (const state of [start().state, recording()]) {
      const lost = reduceAdmissionInteraction(state, { type: "target-lost" });
      expect(lost.state).toMatchObject({
        phase: "error",
        errorCode: "STALE_TARGET",
        submitted: false,
      });
      expect(lost.effects).toEqual([
        { type: "cleanup-operation", token: "voice_1", attempt: 1, reason: "failed" },
      ]);
    }
    for (const state of [
      reduceAdmissionInteraction(recording(), { type: "stop" }).state,
      transcribing(),
      committing(),
    ]) {
      const result = reduceAdmissionInteraction(state, { type: "target-lost" });
      expect(result.state).toBe(state);
      expect(result.effects).toEqual([]);
    }
  });

  it("releases only unsubmitted capture for modal chrome and hidden pages", () => {
    for (const state of [start().state, recording()]) {
      for (const type of ["release-capture", "suspend"] as const) {
        expect(reduceAdmissionInteraction(state, { type })).toEqual({
          state: { phase: "idle" },
          effects: [{ type: "cancel-operation", token: "voice_1", attempt: 1, reason: "suspended" }],
        });
      }
    }
    const stopping = reduceAdmissionInteraction(recording(), { type: "stop" }).state;
    for (const state of [stopping, transcribing(), committing()]) {
      expect(reduceAdmissionInteraction(state, { type: "suspend" }).state).toBe(state);
      expect(reduceAdmissionInteraction(state, { type: "release-capture" }).state).toBe(state);
    }
    const unsubmitted = reduceAdmissionInteraction(start().state, {
      type: "permission-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "MICROPHONE_DENIED",
    }).state;
    const submitted = reduceAdmissionInteraction(transcribing(), {
      type: "transcription-failed",
      token: "voice_1",
      attempt: 1,
      errorCode: "TRANSCRIPTION_FAILED",
    }).state;
    expect(reduceAdmissionInteraction(unsubmitted, { type: "release-capture" }).state).toBe(unsubmitted);
    expect(reduceAdmissionInteraction(unsubmitted, { type: "suspend" }).state).toEqual({ phase: "idle" });
    expect(reduceAdmissionInteraction(submitted, { type: "suspend" }).state).toBe(submitted);
  });

  it("is serializable in every phase and never stores browser resources", () => {
    const states = [
      createAdmissionInteractionState(),
      start().state,
      recording(),
      reduceAdmissionInteraction(recording(), { type: "transcript-updated", token: "voice_1", attempt: 1, transcript: "a partial" }).state,
      reduceAdmissionInteraction(recording(), { type: "stop" }).state,
      transcribing(),
      committing(),
      reduceAdmissionInteraction(committing(), {
        type: "commit-failed",
        token: "voice_1",
        attempt: 1,
        errorCode: "STALE_TARGET",
      }).state,
    ];
    for (const state of states) {
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
      // Words a person said are transient interaction feedback and may live
      // here. A browser resource may not: it cannot survive a cancel, and it
      // cannot be reconstructed from what this state serializes to.
      expect(JSON.stringify(state)).not.toMatch(/blob|stream|recorder/i);
    }
  });
});
