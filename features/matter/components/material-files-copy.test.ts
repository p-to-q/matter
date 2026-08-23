import { describe, expect, it } from "vitest";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import { materialFilesCopy } from "./material-files-copy";

describe("material files copy", () => {
  it.each(CANVAS_LANGUAGE_OPTIONS)("provides the fixed index labels in $label", ({ value: locale }) => {
    const copy = materialFilesCopy(locale);
    const labels = [
      copy.archive,
      copy.canvasTitle,
      copy.close,
      copy.closeSearch,
      copy.copied,
      copy.copy,
      copy.copyUnavailable,
      copy.done,
      copy.emptyFirstThought,
      copy.emptyNoMatches,
      copy.emptyNothingBranches,
      copy.emptyNothingToSelect,
      copy.emptyTypeToFind,
      copy.filterMaterialFiles,
      copy.findThought,
      copy.hideMaterialFiles,
      copy.identityName,
      copy.localOnly,
      copy.materialFiles,
      copy.renameCanvasTitle,
      copy.saving,
      copy.search,
      copy.searchThoughts,
      copy.select,
      copy.showMaterialFiles,
      copy.showMaterialFilesSavingNeedsAttention,
      copy.untitledMatter,
      copy.untitledThought,
      copy.copySelectedThoughts(2),
      copy.includeWhenCopying("A"),
      copy.materialTree(2),
      copy.nameFor("A"),
      copy.renameCanvas("A"),
      copy.resultCount(2),
      copy.revisionCount(2),
      copy.selectedCount(2),
      copy.selectForCopying("A"),
    ];

    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
  });
});
