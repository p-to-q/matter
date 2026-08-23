import { describe, expect, it } from "vitest";
import { admissionFeedbackActions } from "./admission-feedback-copy";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import { voiceToolCopy } from "./voice-tool-copy";

describe("voice tool copy", () => {
  it.each(CANVAS_LANGUAGE_OPTIONS)("provides every tool state in $label", ({ value: locale }) => {
    const copy = voiceToolCopy(locale);

    expect(Object.values(copy).every((label) => label.length > 0)).toBe(true);
    expect(copy.stopRecording).not.toBe(copy.preparingVoiceInput);
    // The rail and nearby feedback intentionally duplicate the safe completion
    // action: one stays in the fixed tool vocabulary, the other sits beside
    // the live recording state.
    expect(admissionFeedbackActions(locale).stop).toBe(copy.stopRecording);
    expect(copy.unavailableInFocusView).not.toBe(copy.unavailableOutsideFullView);
  });
});
