import { describe, expect, it } from "vitest";
import {
  routeVoiceTool,
  voiceToolIsAvailable,
  type VoiceToolAvailabilityInput,
  type VoiceToolState,
} from "./voice-tool-route";

const IDLE: VoiceToolState = {
  admissionPhase: "idle",
  pointTalkHosted: false,
  pointTalkActive: false,
  pointTalkRecording: false,
  pointTalkStartable: false,
  rewriteTargeted: false,
  admissionStartable: true,
};

describe("Voice tool routing", () => {
  it("admits when nothing is selected and opens Point and Talk when a passage is", () => {
    expect(routeVoiceTool(IDLE)).toBe("start-admission");
    expect(routeVoiceTool({ ...IDLE, rewriteTargeted: true })).toBe("open-point-talk");
  });

  it("stops a live admission recording even though a rewritable passage is selected", () => {
    // Under records while its passage stays selected; Voice must stop it.
    expect(routeVoiceTool({
      ...IDLE,
      admissionPhase: "recording",
      rewriteTargeted: true,
    })).toBe("stop-admission");
  });

  it("lets the admission recording outrank every Point and Talk state", () => {
    for (const pointTalk of [
      { pointTalkHosted: true },
      { pointTalkHosted: true, pointTalkActive: true },
      { pointTalkHosted: true, pointTalkActive: true, pointTalkStartable: true },
      { pointTalkHosted: true, pointTalkActive: true, pointTalkRecording: true },
    ]) {
      expect(routeVoiceTool({ ...IDLE, admissionPhase: "recording", ...pointTalk }))
        .toBe("stop-admission");
    }
  });

  it("waits while a submitted utterance is still becoming a child", () => {
    for (const admissionPhase of [
      "requesting",
      "stopping",
      "transcribing",
      "committing",
    ] as const) {
      expect(routeVoiceTool({ ...IDLE, admissionPhase, rewriteTargeted: true })).toBe("none");
    }
  });

  it("leaves the selection's meaning alone once an admission failed and holds its words", () => {
    expect(routeVoiceTool({ ...IDLE, admissionPhase: "error", rewriteTargeted: true }))
      .toBe("open-point-talk");
  });

  it("keeps the Point and Talk routes unchanged when no admission is recording", () => {
    expect(routeVoiceTool({ ...IDLE, pointTalkHosted: true })).toBe("none");
    expect(routeVoiceTool({ ...IDLE, pointTalkHosted: true, pointTalkActive: true })).toBe("none");
    expect(routeVoiceTool({
      ...IDLE,
      pointTalkHosted: true,
      pointTalkActive: true,
      pointTalkStartable: true,
    })).toBe("start-point-talk");
    expect(routeVoiceTool({
      ...IDLE,
      pointTalkHosted: true,
      pointTalkActive: true,
      pointTalkRecording: true,
    })).toBe("stop-point-talk");
  });

  it("does nothing when admission cannot start and nothing else owns Voice", () => {
    expect(routeVoiceTool({ ...IDLE, admissionStartable: false })).toBe("none");
  });
});

const AVAILABILITY: VoiceToolAvailabilityInput = {
  admissionPhase: "idle",
  pointTalkHosted: false,
  pointTalkActive: false,
  targetVoiceAvailable: false,
  passageSelected: true,
  admissionToolAvailable: false,
};

describe("Voice tool availability", () => {
  it("keeps a live admission recording stoppable when the selected passage cannot host a rewrite", () => {
    expect(voiceToolIsAvailable(AVAILABILITY)).toBe(false);
    expect(voiceToolIsAvailable({ ...AVAILABILITY, admissionPhase: "recording" })).toBe(true);
  });

  it("is unavailable while a submitted utterance is still becoming a child", () => {
    for (const admissionPhase of ["requesting", "stopping", "transcribing", "committing"] as const) {
      expect(voiceToolIsAvailable({
        ...AVAILABILITY,
        admissionPhase,
        targetVoiceAvailable: true,
      })).toBe(false);
    }
  });

  it("follows the target Voice would address in every other state", () => {
    expect(voiceToolIsAvailable({ ...AVAILABILITY, targetVoiceAvailable: true })).toBe(true);
    expect(voiceToolIsAvailable({
      ...AVAILABILITY,
      passageSelected: false,
      admissionToolAvailable: true,
    })).toBe(true);
    expect(voiceToolIsAvailable({
      ...AVAILABILITY,
      pointTalkHosted: true,
      targetVoiceAvailable: true,
    })).toBe(false);
    expect(voiceToolIsAvailable({
      ...AVAILABILITY,
      pointTalkHosted: true,
      pointTalkActive: true,
      targetVoiceAvailable: true,
    })).toBe(true);
  });
});
