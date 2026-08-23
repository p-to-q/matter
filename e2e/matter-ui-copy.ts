import { DEFAULT_CANVAS_PREFERENCES } from "../features/matter/components/canvas-preferences";
import { admissionFeedbackActions } from "../features/matter/components/admission-feedback-copy";
import { materialFilesCopy } from "../features/matter/components/material-files-copy";
import { toolRailCopy } from "../features/matter/components/tool-rail-copy";
import { voiceToolCopy } from "../features/matter/components/voice-tool-copy";

/** The fixture server starts each isolated browser with Matter's default locale. */
const FIXTURE_LOCALE = DEFAULT_CANVAS_PREFERENCES.language;

export const fixtureUiCopy = Object.freeze({
  materialFiles: materialFilesCopy(FIXTURE_LOCALE),
  admissionFeedback: admissionFeedbackActions(FIXTURE_LOCALE),
  toolRail: toolRailCopy(FIXTURE_LOCALE),
  voiceTool: voiceToolCopy(FIXTURE_LOCALE),
});

/** Accessible names are matched literally; copy may contain regex characters. */
function anyOf(...names: readonly string[]): RegExp {
  return new RegExp(names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
}

/**
 * The material-files toggle renames itself across open, closed, and
 * saving-failed states. A locator fixed to one of those names silently stops
 * matching the moment a test opens the drawer, so tests address it by the set
 * of names it can carry rather than by whichever one it shows first.
 */
export const fixtureMaterialFilesToggleName = anyOf(
  fixtureUiCopy.materialFiles.hideMaterialFiles,
  fixtureUiCopy.materialFiles.showMaterialFilesSavingNeedsAttention,
  fixtureUiCopy.materialFiles.showMaterialFiles,
);

/**
 * The voice tool names the exact anchor it would admit under, so a selection
 * one level from the root reads differently from a deeper one. A test that
 * only cares that voice is armed must accept either name.
 */
export const fixtureVoiceAdmissionName = anyOf(
  fixtureUiCopy.voiceTool.recordTopLevelThought,
  fixtureUiCopy.voiceTool.recordBelowSelectedMaterial,
);
