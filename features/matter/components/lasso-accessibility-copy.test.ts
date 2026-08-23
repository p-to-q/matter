import { describe, expect, it } from "vitest";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import { lassoAccessibilityCopy } from "./lasso-accessibility-copy";

describe("lasso accessibility copy", () => {
  it.each(CANVAS_LANGUAGE_OPTIONS)("provides every accessible lasso label in $label", ({ value: locale }) => {
    const copy = lassoAccessibilityCopy(locale);

    expect(Object.values(copy).every((label) => label.trim().length > 0)).toBe(true);
    expect(copy.upperGripLabel).not.toBe(copy.lowerGripLabel);
    expect(copy.keyboardSelectionHint).not.toBe(copy.groupInstructions);
  });
});
