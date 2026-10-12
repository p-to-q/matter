import type { AdmissionInteractionState } from "./admission-interaction";

/**
 * The fixed Voice tool means one of two things: admit human material, or, with
 * a passage selected, give Point and Talk its spoken direction. A recording
 * that already exists outranks that choice. Under starts an admission while a
 * passage stays selected, so selection alone can no longer say what the next
 * tap on Voice does: it must stop the recording, never open Point and Talk.
 */
export type VoiceToolState = Readonly<{
  admissionPhase: AdmissionInteractionState["phase"];
  /** A Point and Talk field exists for some passage. */
  pointTalkHosted: boolean;
  /** That field belongs to the target Voice would address. */
  pointTalkActive: boolean;
  pointTalkRecording: boolean;
  pointTalkStartable: boolean;
  /** The selected passage can host Point and Talk. */
  rewriteTargeted: boolean;
  /** An admission could start now at the current target. */
  admissionStartable: boolean;
}>;

export type VoiceToolAction =
  | "stop-admission"
  | "stop-point-talk"
  | "start-point-talk"
  | "open-point-talk"
  | "start-admission"
  | "none";

export function routeVoiceTool(state: VoiceToolState): VoiceToolAction {
  if (state.admissionPhase === "recording") return "stop-admission";
  // A submitted utterance is still becoming a child; Voice waits for it.
  if (admissionIsInFlight(state.admissionPhase)) return "none";
  if (state.pointTalkHosted && !state.pointTalkActive) return "none";
  if (state.pointTalkActive) {
    if (state.pointTalkRecording) return "stop-point-talk";
    return state.pointTalkStartable ? "start-point-talk" : "none";
  }
  if (state.rewriteTargeted) return "open-point-talk";
  return state.admissionStartable ? "start-admission" : "none";
}

function admissionIsInFlight(phase: AdmissionInteractionState["phase"]): boolean {
  return phase === "requesting" || phase === "stopping" ||
    phase === "transcribing" || phase === "committing";
}

export type VoiceToolAvailabilityInput = Readonly<{
  admissionPhase: AdmissionInteractionState["phase"];
  pointTalkHosted: boolean;
  pointTalkActive: boolean;
  /** Whether Voice could act on the target it would address (rewrite or admit). */
  targetVoiceAvailable: boolean;
  passageSelected: boolean;
  /** Admission could start, or is already recording, with no passage selected. */
  admissionToolAvailable: boolean;
}>;

/** A live admission recording is always stoppable, whatever else is selected. */
export function voiceToolIsAvailable(input: VoiceToolAvailabilityInput): boolean {
  if (input.admissionPhase === "recording") return true;
  if (admissionIsInFlight(input.admissionPhase)) return false;
  if (input.pointTalkHosted) return input.pointTalkActive && input.targetVoiceAvailable;
  if (input.passageSelected) return input.targetVoiceAvailable;
  return input.admissionToolAvailable;
}
