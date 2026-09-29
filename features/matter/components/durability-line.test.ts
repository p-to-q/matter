import { describe, expect, it } from "vitest";
import type { PersistenceStatus } from "../persistence/persistence-controller";
import {
  isReplaceableUnsaved,
  isTerminalDurability,
  projectArchiveNote,
  projectDurabilityLine,
} from "./durability-line";
import { materialFilesCopy } from "./material-files-copy";

const copy = materialFilesCopy("en-US");
const SAVED: PersistenceStatus = Object.freeze({
  phase: "saved",
  persistedRevision: 3,
  dirtyRevision: null,
  errorCode: null,
  historyNotice: null,
  unsaved: false,
  upgradeBlocked: false,
});

function failed(errorCode: NonNullable<PersistenceStatus["errorCode"]>): PersistenceStatus {
  return { ...SAVED, phase: "error", dirtyRevision: 4, errorCode, unsaved: true };
}

describe("durability line", () => {
  it("keeps the quiet identity while material is saved", () => {
    expect(projectDurabilityLine(SAVED, false, copy)).toEqual({ tone: "quiet", text: copy.localOnly });
    expect(projectDurabilityLine({ ...SAVED, phase: "saving", unsaved: true }, false, copy))
      .toEqual({ tone: "quiet", text: copy.localOnly });
    expect(projectDurabilityLine({ ...SAVED, phase: "saving", unsaved: true }, true, copy))
      .toEqual({ tone: "quiet", text: copy.saving });
  });

  it.each([
    ["PERSISTENCE_STORAGE_FULL", "Not saved on this device"],
    ["PERSISTENCE_WRITE_FAILED", "Not saved on this device"],
    ["PERSISTENCE_CORRUPT", "Not saved on this device"],
    ["PERSISTENCE_UNAVAILABLE", "Not saving in this browser"],
    ["PERSISTENCE_CONFLICT", "A newer copy is open in another tab"],
    ["PERSISTENCE_SUPERSEDED", "A newer Matter is open in another tab"],
    ["PERSISTENCE_CLEARED", "Local storage was cleared in another tab"],
  ] as const)("tells the truth about %s until it is resolved", (errorCode, text) => {
    expect(projectDurabilityLine(failed(errorCode), true, copy)).toEqual({ tone: "risk", text });
  });

  it("asks for older tabs to close while an upgrade waits, below a terminal state", () => {
    const blocked = { ...SAVED, phase: "loading" as const, upgradeBlocked: true };
    expect(projectDurabilityLine(blocked, false, copy)).toEqual({ tone: "risk", text: copy.durabilityUpgradeBlocked });
    expect(projectDurabilityLine({ ...failed("PERSISTENCE_SUPERSEDED"), upgradeBlocked: true }, false, copy).text)
      .toBe(copy.durabilityNewerMatter);
  });

  it("carries a history notice quietly after any failure is resolved", () => {
    expect(projectDurabilityLine({ ...SAVED, historyNotice: "unavailable" }, false, copy))
      .toEqual({ tone: "notice", text: copy.historyUnavailable });
    expect(projectDurabilityLine({ ...SAVED, historyNotice: "released" }, false, copy))
      .toEqual({ tone: "notice", text: copy.historyReleased });
    expect(projectDurabilityLine({ ...failed("PERSISTENCE_STORAGE_FULL"), historyNotice: "released" }, false, copy).tone)
      .toBe("risk");
  });

  it("explains each state in Archive and adds the eviction sentence only when storage is not persistent", () => {
    expect(projectArchiveNote(failed("PERSISTENCE_SUPERSEDED"), null, false, copy)).toBe(copy.archiveNoteSuperseded);
    expect(projectArchiveNote(failed("PERSISTENCE_UNAVAILABLE"), null, false, copy)).toBe(copy.archiveNoteUnavailable);
    expect(projectArchiveNote(SAVED, "unavailable", false, copy)).toBe(copy.archiveNoteHistoryUnavailable);
    expect(projectArchiveNote(SAVED, null, true, copy)).toBe(copy.archiveNoteDefault);
    expect(projectArchiveNote(SAVED, null, null, copy)).toBe(copy.archiveNoteDefault);
    expect(projectArchiveNote(SAVED, null, false, copy))
      .toBe(`${copy.archiveNoteDefault} ${copy.archiveNoteNotPersisted}`);
  });

  it("offers replacement of unsaved material only where storage refused it", () => {
    expect(isReplaceableUnsaved(failed("PERSISTENCE_STORAGE_FULL"))).toBe(true);
    expect(isReplaceableUnsaved(failed("PERSISTENCE_WRITE_FAILED"))).toBe(true);
    expect(isReplaceableUnsaved(failed("PERSISTENCE_CONFLICT"))).toBe(false);
    expect(isReplaceableUnsaved({ ...failed("PERSISTENCE_STORAGE_FULL"), unsaved: false })).toBe(false);
    expect(isTerminalDurability(failed("PERSISTENCE_CLEARED"))).toBe(true);
    expect(isTerminalDurability(failed("PERSISTENCE_CONFLICT"))).toBe(false);
  });
});
