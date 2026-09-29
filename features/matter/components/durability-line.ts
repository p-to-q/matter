import type { PersistenceStatus } from "../persistence/persistence-controller";
import type { MaterialFilesCopy } from "./material-files-copy";

/**
 * `risk`: material in this tab is not, or can no longer be, saved here.
 * `notice`: material is saved, but undo history was released.
 * `quiet`: the ordinary local identity, or a brief saving phrase.
 */
export type DurabilityTone = "quiet" | "notice" | "risk";

export type DurabilityLine = Readonly<{
  tone: DurabilityTone;
  text: string;
}>;

/**
 * The one line under the local identity that tells the truth about this
 * tab's material until it is resolved. It is never a banner, toast, or modal:
 * the line is quiet text, and every recovery control lives in Archive.
 */
export function projectDurabilityLine(
  status: PersistenceStatus,
  savingVisible: boolean,
  copy: MaterialFilesCopy,
): DurabilityLine {
  switch (status.errorCode) {
    case "PERSISTENCE_SUPERSEDED":
      return risk(copy.durabilityNewerMatter);
    case "PERSISTENCE_CLEARED":
      return risk(copy.durabilityCleared);
    default:
      break;
  }
  if (status.upgradeBlocked) return risk(copy.durabilityUpgradeBlocked);
  switch (status.errorCode) {
    case "PERSISTENCE_CONFLICT":
      // A load-window conflict involves no other tab; it must not claim one.
      return risk(status.conflictOrigin === "load-window" ? copy.durabilityDiverged : copy.durabilityNewerCopy);
    case "PERSISTENCE_STORAGE_FULL":
    case "PERSISTENCE_WRITE_FAILED":
    case "PERSISTENCE_CORRUPT":
      return risk(copy.durabilityNotSaved);
    case "PERSISTENCE_UNAVAILABLE":
      return risk(copy.durabilityNotSaving);
    default:
      break;
  }
  if (status.phase === "saving" && savingVisible) return Object.freeze({ tone: "quiet", text: copy.saving });
  if (status.historyNotice === "unavailable") return notice(copy.historyUnavailable);
  if (status.historyNotice === "released") return notice(copy.historyReleased);
  return Object.freeze({ tone: "quiet", text: copy.localOnly });
}

/**
 * The Archive note for the same state. A history notice read when Archive
 * opened is passed separately, because opening Archive is what acknowledges it.
 */
export function projectArchiveNote(
  status: PersistenceStatus,
  readHistoryNotice: PersistenceStatus["historyNotice"],
  storagePersisted: boolean | null,
  copy: MaterialFilesCopy,
): string {
  switch (status.errorCode) {
    case "PERSISTENCE_SUPERSEDED":
      return copy.archiveNoteSuperseded;
    case "PERSISTENCE_CLEARED":
      return copy.archiveNoteCleared;
    case "PERSISTENCE_CORRUPT":
      return copy.archiveNoteCorrupt;
    case "PERSISTENCE_CONFLICT":
      return status.conflictOrigin === "load-window" ? copy.archiveNoteDiverged : copy.archiveNoteConflict;
    case "PERSISTENCE_STORAGE_FULL":
      return copy.archiveNoteStorageFull;
    case "PERSISTENCE_UNAVAILABLE":
      return copy.archiveNoteUnavailable;
    case "PERSISTENCE_WRITE_FAILED":
      return copy.archiveNoteSaveFailed;
    default:
      break;
  }
  if (status.upgradeBlocked) return copy.archiveNoteUpgradeBlocked;
  if (readHistoryNotice === "unavailable") return copy.archiveNoteHistoryUnavailable;
  if (readHistoryNotice === "released") return copy.archiveNoteHistoryReleased;
  return storagePersisted === false
    ? `${copy.archiveNoteDefault} ${copy.archiveNoteNotPersisted}`
    : copy.archiveNoteDefault;
}

/** Superseded or cleared storage can only be exported from memory and reloaded. */
export function isTerminalDurability(status: PersistenceStatus): boolean {
  return status.errorCode === "PERSISTENCE_SUPERSEDED" || status.errorCode === "PERSISTENCE_CLEARED";
}

/** Storage refused this material; the person may replace it with an archive. */
export function isReplaceableUnsaved(status: PersistenceStatus): boolean {
  return status.unsaved &&
    (status.errorCode === "PERSISTENCE_STORAGE_FULL" || status.errorCode === "PERSISTENCE_WRITE_FAILED");
}

function risk(text: string): DurabilityLine {
  return Object.freeze({ tone: "risk", text });
}

function notice(text: string): DurabilityLine {
  return Object.freeze({ tone: "notice", text });
}
