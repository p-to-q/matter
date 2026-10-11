import { readFileSync } from "node:fs";
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
      copy.archiveConfirmOlder,
      copy.archiveConfirmReplaceUnsaved,
      copy.archiveErrorAction,
      copy.archiveErrorBusy,
      copy.archiveErrorCleared,
      copy.archiveErrorConflict,
      copy.archiveErrorCorrupt,
      copy.archiveErrorDirty,
      copy.archiveErrorSaving,
      copy.archiveErrorForeign,
      copy.archiveErrorInvalid,
      copy.archiveErrorInvalidTree,
      copy.archiveErrorSaveFailed,
      copy.archiveErrorStale,
      copy.archiveErrorStorageFull,
      copy.archiveErrorSuperseded,
      copy.archiveErrorTooLarge,
      copy.archiveErrorUnavailable,
      copy.archiveErrorUnsupported,
      copy.archiveNoteCleared,
      copy.archiveNoteDiverged,
      copy.archiveNoteHistoryReleased,
      copy.archiveNoteHistoryUnavailable,
      copy.archiveNoteNotPersisted,
      copy.archiveNoteSuperseded,
      copy.archiveNoteUnavailable,
      copy.archiveNoteUpgradeBlocked,
      copy.archiveReloadPage,
      copy.durabilityCleared,
      copy.durabilityDiverged,
      copy.durabilityNewerCopy,
      copy.durabilityNewerMatter,
      copy.durabilityNotSaved,
      copy.durabilityNotSaving,
      copy.durabilityUpgradeBlocked,
      copy.historyReleased,
      copy.historyUnavailable,
      copy.archiveKeepCurrent,
      copy.archiveReplace,
      copy.canvasTitle,
      copy.close,
      copy.closeSearch,
      copy.copied,
      copy.copiedWithContext,
      copy.copy,
      copy.copyWithContext,
      copy.archiveReceiptDownload,
      copy.archiveReceiptDescription,
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

  it("localizes every durability line and archive error away from English", () => {
    const english = materialFilesCopy("en-US");
    for (const { value: locale } of CANVAS_LANGUAGE_OPTIONS) {
      if (locale === "en-US") continue;
      const copy = materialFilesCopy(locale);
      for (const key of [
        "durabilityNotSaved",
        "durabilityNewerCopy",
        "durabilityNewerMatter",
        "durabilityDiverged",
        "durabilityCleared",
        "archiveErrorSaving",
        "archiveErrorBusy",
        "archiveErrorStorageFull",
        "archiveErrorInvalid",
        "historyUnavailable",
      ] as const) {
        expect(copy[key]).not.toBe(english[key]);
      }
    }
  });

  it("states Copy with context and the readable receipt in every locale, as a complete table", () => {
    const expected = {
      "en-US": [
        "Copy with context",
        "Copied with context",
        "Receipt (.md)",
        "A readable Markdown outline with each passage's parent and order — not a backup",
      ],
      "zh-CN": ["复制并附上下文", "已复制，附上下文", "回执 (.md)", "可读的 Markdown 大纲，含每段的上级与顺序，不是备份"],
      "zh-TW": ["複製並附上下文", "已複製，附上下文", "回執 (.md)", "可讀的 Markdown 大綱，含每段的上層與順序，不是備份"],
      "ja-JP": [
        "文脈つきでコピー",
        "文脈つきでコピーしました",
        "レシート (.md)",
        "各段落の親と順序を含む読みやすい Markdown。バックアップではありません",
      ],
      "de-DE": [
        "Mit Kontext kopieren",
        "Mit Kontext kopiert",
        "Beleg (.md)",
        "Lesbare Markdown-Gliederung mit Elternteil und Reihenfolge jeder Passage — keine Sicherung",
      ],
    } as const;
    for (const { value: locale } of CANVAS_LANGUAGE_OPTIONS) {
      const copy = materialFilesCopy(locale);
      expect([
        copy.copyWithContext,
        copy.copiedWithContext,
        copy.archiveReceiptDownload,
        copy.archiveReceiptDescription,
      ]).toEqual(expected[locale]);
    }
    expect(Object.keys(expected).sort()).toEqual(CANVAS_LANGUAGE_OPTIONS.map(({ value }) => value).sort());
    const source = readFileSync(new URL("./material-files-copy.ts", import.meta.url), "utf8");
    expect(source).toContain("Record<MatterLocale, MaterialFilesCopy>");
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

  describe("picture archive notices", () => {
    it.each(CANVAS_LANGUAGE_OPTIONS)("states both notices and the count in $label", ({ value: locale }) => {
      const copy = materialFilesCopy(locale);
      for (const count of [1, 2, 7]) {
        for (const text of [copy.archivePicturesNotExported(count), copy.archivePicturesNotSaved(count)]) {
          expect(text.length).toBeGreaterThan(8);
          expect(text).toContain(String(count));
        }
      }
      expect(copy.archivePicturesNotExported(2)).not.toBe(copy.archivePicturesNotSaved(2));
    });

    it("is not English outside English", () => {
      const english = materialFilesCopy("en-US");
      for (const { value: locale } of CANVAS_LANGUAGE_OPTIONS) {
        if (locale === "en-US") continue;
        const copy = materialFilesCopy(locale);
        expect(copy.archivePicturesNotExported(2)).not.toBe(english.archivePicturesNotExported(2));
        expect(copy.archivePicturesNotSaved(2)).not.toBe(english.archivePicturesNotSaved(2));
      }
    });

    it("chooses singular and plural wording by the locale's rule", () => {
      const english = materialFilesCopy("en-US");
      expect(english.archivePicturesNotExported(1))
        .toBe("Exported. 1 picture file was not on this device and is not in the archive.");
      expect(english.archivePicturesNotExported(2))
        .toBe("Exported. 2 picture files were not on this device and are not in the archive.");
      expect(english.archivePicturesNotSaved(1)).toContain("1 picture could not be saved");
      expect(english.archivePicturesNotSaved(1)).toContain("keep it.");
      expect(english.archivePicturesNotSaved(2)).toContain("2 pictures could not be saved");
      expect(english.archivePicturesNotSaved(2)).toContain("keep them.");

      const german = materialFilesCopy("de-DE");
      expect(german.archivePicturesNotExported(1))
        .toBe("Exportiert. 1 Bilddatei war nicht auf diesem Gerät und ist nicht im Archiv.");
      expect(german.archivePicturesNotExported(3))
        .toBe("Exportiert. 3 Bilddateien waren nicht auf diesem Gerät und sind nicht im Archiv.");
      expect(german.archivePicturesNotSaved(1)).toContain("1 Bild konnte");
      expect(german.archivePicturesNotSaved(1)).toContain("um es zu behalten");
      expect(german.archivePicturesNotSaved(2)).toContain("2 Bilder konnten");
      expect(german.archivePicturesNotSaved(2)).toContain("um sie zu behalten");

      // No plural form: one sentence shape for every count.
      for (const locale of ["zh-CN", "zh-TW", "ja-JP"] as const) {
        const copy = materialFilesCopy(locale);
        expect(copy.archivePicturesNotExported(1).replace("1", "2")).toBe(copy.archivePicturesNotExported(2));
        expect(copy.archivePicturesNotSaved(1).replace("1", "2")).toBe(copy.archivePicturesNotSaved(2));
      }
    });
  });
});
