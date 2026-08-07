import { describe, expect, it } from "vitest";
import {
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

function repairing(transcript: string): AdmissionInteractionState {
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

describe("admission interaction reducer", () => {
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

  it("holds the trimmed transcript for repair rather than committing it directly", () => {
    const result = reduceAdmissionInteraction(transcribing(), {
      type: "transcription-succeeded",
      token: "voice_1",
      attempt: 1,
      transcript: "  an unfinished thought  ",
    });

    expect(result.state).toEqual({
      phase: "repairing",
      token: "voice_1",
      attempt: 1,
      anchor: CHILD,
      transcript: "an unfinished thought",
    });
    expect(result.effects).toEqual([
      {
        type: "repair-transcript",
        token: "voice_1",
        attempt: 1,
        transcript: "an unfinished thought",
      },
    ]);
  });

  it("commits the settled transcript once repair answers", () => {
    const result = reduceAdmissionInteraction(repairing("an unfinished thought"), {
      type: "repair-settled",
      token: "voice_1",
      attempt: 1,
      transcript: "An unfinished thought.",
    });

    expect(result.state).toEqual({ phase: "committing", token: "voice_1", attempt: 1, anchor: CHILD });
    expect(result.effects).toEqual([
      {
        type: "commit-admission",
        token: "voice_1",
        attempt: 1,
        anchor: CHILD,
        transcript: "An unfinished thought.",
      },
    ]);
  });

  it("commits what was heard when repair settles with nothing usable", () => {
    for (const settled of ["", "   ", "x".repeat(8_001)]) {
      const result = reduceAdmissionInteraction(repairing("an unfinished thought"), {
        type: "repair-settled",
        token: "voice_1",
        attempt: 1,
        transcript: settled,
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
    }
  });

  it("ignores a repair answer from another attempt", () => {
    const state = repairing("an unfinished thought");
    const result = reduceAdmissionInteraction(state, {
      type: "repair-settled",
      token: "voice_1",
      attempt: 2,
      transcript: "a different thought.",
    });
    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  it("finishes only the matching commit and requests deterministic cleanup", () => {
    const committing = reduceAdmissionInteraction(repairing("thought"), {
      type: "repair-settled",
      token: "voice_1",
      attempt: 1,
      transcript: "thought",
    }).state;
    const result = reduceAdmissionInteraction(committing, {
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
    ["repairing", repairing("thought")],
    ["committing", reduceAdmissionInteraction(repairing("thought"), { type: "repair-settled", token: "voice_1", attempt: 1, transcript: "thought" }).state],
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
    ["commit", reduceAdmissionInteraction(repairing("thought"), { type: "repair-settled", token: "voice_1", attempt: 1, transcript: "thought" }).state, { type: "commit-failed", token: "voice_1", attempt: 1, errorCode: "STALE_TARGET" }],
  ] as const)("makes %s failure recoverable after cleanup", (_name, state, event) => {
    const result = reduceAdmissionInteraction(state, event);
    expect(result.state).toMatchObject({ phase: "error", token: "voice_1", attempt: 1, anchor: CHILD, errorCode: event.errorCode });
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
    const retried = reduceAdmissionInteraction(failed, { type: "retry" });

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
    const retried = reduceAdmissionInteraction(failed, { type: "retry" }).state;
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

  it("is serializable in every phase and never stores browser resources", () => {
    const states = [
      createAdmissionInteractionState(),
      start().state,
      recording(),
      reduceAdmissionInteraction(recording(), { type: "transcript-updated", token: "voice_1", attempt: 1, transcript: "a partial" }).state,
      reduceAdmissionInteraction(recording(), { type: "stop" }).state,
      transcribing(),
      repairing("thought"),
      reduceAdmissionInteraction(repairing("thought"), { type: "repair-settled", token: "voice_1", attempt: 1, transcript: "thought" }).state,
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
