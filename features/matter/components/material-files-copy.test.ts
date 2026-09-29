import { describe, expect, it } from "vitest";
import { CANVAS_LANGUAGE_OPTIONS } from "./canvas-preferences";
import { materialFilesCopy } from "./material-files-copy";

describe("material files copy", () => {
  it.each(CANVAS_LANGUAGE_OPTIONS)("provides the fixed index labels in $label", ({ value: locale }) => {
    const copy = materialFilesCopy(locale);
    const labels = [
      copy.archive,
      copy.archivePanel,
      copy.archiveExportCopy,
      copy.archiveImportCopy,
      copy.archiveRepairLocalStorage,
      copy.archiveReloadStoredMaterial,
      copy.archiveRetrySaving,
      copy.archiveChooseMaterialArchive,
      copy.archiveExporting,
      copy.archiveChecking,
      copy.archiveReplacing,
      copy.archiveRepairing,
      copy.archiveNoteDefault,
      copy.archiveNoteCorrupt,
      copy.archiveNoteConflict,
      copy.archiveNoteStorageFull,
      copy.archiveNoteSaveFailed,
      copy.archiveConfirmReplace,
      copy.archiveKeepCurrent,
      copy.archiveReplace,
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
      copy.collapseBranch("A"),
      copy.expandBranch("A"),
      copy.includeInWorkingContext("A"),
      copy.restoreAndView("A"),
      copy.setAsideFromWorkingContext("A"),
    ];

    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
  });

  it("chooses a count's noun by the locale's plural rule", () => {
    const english = materialFilesCopy("en-US");
    expect(english.revisionCount(1)).toBe("1 committed revision");
    expect(english.revisionCount(2)).toBe("2 committed revisions");
    expect(english.copySelectedThoughts(1)).toBe("Copy 1 selected thought");
    expect(english.copySelectedThoughts(3)).toBe("Copy 3 selected thoughts");
    expect(english.materialTree(1)).toBe("Markdown material tree, 1 entry");
    expect(english.resultCount(0)).toBe("0 material results");
    expect(english.resultCount(1)).toBe("1 material result");

    const german = materialFilesCopy("de-DE");
    expect(german.revisionCount(1)).toBe("1 Änderung gespeichert");
    expect(german.revisionCount(4)).toBe("4 Änderungen gespeichert");
    expect(german.copySelectedThoughts(1)).toBe("1 ausgewählten Gedanken kopieren");
    expect(german.copySelectedThoughts(2)).toBe("2 ausgewählte Gedanken kopieren");
    expect(german.materialTree(1)).toBe("Markdown-Materialbaum, 1 Eintrag");
    expect(german.resultCount(1)).toBe("1 Materialtreffer");
    expect(german.resultCount(5)).toBe("5 Materialtreffer");
  });
});
