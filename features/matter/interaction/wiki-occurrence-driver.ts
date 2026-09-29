import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import type { MatterLocale } from "../config/locales";
import {
  admitWikiOccurrences,
  advanceWikiOccurrenceDwell,
  advanceWikiOccurrencePerception,
  decideWikiOccurrenceSettlement,
  markWikiOccurrenceDisclosed,
  MAX_LIVE_WIKI_OCCURRENCES,
  noteWikiOccurrenceAdmission,
  noteWikiOccurrenceCopy,
  remapWikiOccurrenceAddress,
  wikiOccurrenceAddressHolds,
  type LiveWikiOccurrence,
  type MaterialView,
  type WikiOccurrenceAddress,
  type WikiOccurrenceRestoration,
} from "./wiki-occurrence-lifecycle";

/** How often perceivable time and dwell are sampled while an occurrence waits. */
export const WIKI_OCCURRENCE_TICK_MS = 250;
/** A throttled or suspended timer never grants more than this per sample. */
const MAX_TICK_ELAPSED_MS = 1_000;

export type WikiOccurrenceSettleOutcome =
  | "accepted-implicit"
  | "inspected-kept"
  | "explicit-confirm"
  | "reverted"
  | "censored";

export type WikiOccurrenceRestorationRequest = Readonly<{
  treeId: string;
  documentEpoch: number;
  nodeId: string;
  expectedUpdatedAt: string;
  start: number;
  end: number;
  expectedText: string;
  replacement: string;
}>;

/** What the render edge may paint and the takeover may offer. */
export type WikiOccurrenceView = Readonly<{
  id: string;
  nodeId: string;
  nodeUpdatedAt: string;
  start: number;
  end: number;
  canonicalText: string;
  /** The heard form, for the takeover's literal restore choice only. */
  sourceText: string;
  locale: MatterLocale;
  disclosed: boolean;
  takeover: boolean;
  admittedAtMs: number;
}>;

/** DOM, clock, and page capabilities; the browser adapter owns their resources. */
export type WikiOccurrenceEnvironment = Readonly<{
  now(): number;
  isPageVisible(): boolean;
  startTicker(tick: () => void, intervalMs: number): () => void;
  listenPage(handlers: Readonly<{
    visibility: () => void;
    exit: () => void;
    copy: () => void;
  }>): () => void;
  track(nodeId: string): void;
  untrack(nodeId: string): void;
  isPerceivable(address: WikiOccurrenceAddress): boolean;
  selectionCovers(address: WikiOccurrenceAddress): boolean;
  dispose(): void;
}>;

export type WikiOccurrenceDriver = Readonly<{
  /** Opens the committed occurrences of one material commit. */
  admit(publication: MaterialLexicalOccurrencePublication): void;
  /** Rechecks every address after any material change. */
  reconcile(): void;
  noteHumanAdmission(): void;
  noteMaterialCopied(nodeIds: Iterable<string>): void;
  noteExported(): void;
  /** False while a modal or another owner covers the paper. */
  setSurfaceAvailable(available: boolean): void;
  markDisclosed(occurrenceId: string): void;
  openTakeover(occurrenceId: string): boolean;
  /** Dismissal is an inspection; Keep is an explicit confirmation. */
  closeTakeover(occurrenceId: string, outcome: "inspected-kept" | "explicit-confirm"): void;
  /** Leaves the takeover for the Wiki surface; the occurrence stays unsettled. */
  leaveTakeover(occurrenceId: string): void;
  /** Restores the heard form as an ordinary human material command. */
  revert(occurrenceId: string): "reverted" | "stale";
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly WikiOccurrenceView[];
  dispose(): void;
}>;

type Record = {
  occurrence: LiveWikiOccurrence;
  locale: MatterLocale;
};

const EMPTY_VIEWS: readonly WikiOccurrenceView[] = Object.freeze([]);

/**
 * The one browser owner of committed Wiki occurrences. It holds every timer,
 * observer, and page listener the lifecycle needs, attaches them only while an
 * occurrence is live, and releases them idempotently. It reads material only
 * through `readMaterial` and settles only through `settle`; it never observes
 * Material Undo, only whether each committed address still holds.
 */
export function createWikiOccurrenceDriver(input: Readonly<{
  readMaterial: () => MaterialView;
  settle: (occurrenceId: string, outcome: WikiOccurrenceSettleOutcome) => void;
  restore: (request: WikiOccurrenceRestorationRequest) => boolean;
  environment: WikiOccurrenceEnvironment;
}>): WikiOccurrenceDriver {
  const { environment } = input;
  const live = new Map<string, Record>();
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_VIEWS;
  let takeoverId: string | null = null;
  let surfaceAvailable = true;
  let lastTickMs: number | null = null;
  let stopTicker: (() => void) | null = null;
  let stopPage: (() => void) | null = null;
  let restoring: WikiOccurrenceRestoration | null = null;
  let disposed = false;

  const publish = () => {
    snapshot = live.size === 0
      ? EMPTY_VIEWS
      : Object.freeze([...live.values()].map(({ occurrence, locale }) => Object.freeze({
          id: occurrence.id,
          nodeId: occurrence.address.nodeId,
          nodeUpdatedAt: occurrence.address.nodeUpdatedAt,
          start: occurrence.address.start,
          end: occurrence.address.end,
          canonicalText: occurrence.address.canonicalText,
          sourceText: occurrence.sourceText,
          locale,
          disclosed: occurrence.progress.disclosed,
          takeover: occurrence.id === takeoverId,
          admittedAtMs: occurrence.admittedAtMs,
        })));
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One presentation observer cannot change occurrence authority.
      }
    }
  };

  const syncResources = () => {
    if (disposed || live.size === 0) {
      stopTicker?.();
      stopTicker = null;
      stopPage?.();
      stopPage = null;
      lastTickMs = null;
      return;
    }
    stopPage ??= environment.listenPage({
      visibility: () => {
        lastTickMs = null;
        syncResources();
      },
      exit: settleAtPageExit,
      copy: noteNativeCopy,
    });
    const shouldTick = environment.isPageVisible();
    if (shouldTick && stopTicker === null) {
      lastTickMs = environment.now();
      stopTicker = environment.startTicker(tick, WIKI_OCCURRENCE_TICK_MS);
    } else if (!shouldTick && stopTicker !== null) {
      stopTicker();
      stopTicker = null;
      lastTickMs = null;
    }
  };

  const remove = (occurrenceId: string) => {
    const record = live.get(occurrenceId);
    if (record === undefined) return null;
    live.delete(occurrenceId);
    if (takeoverId === occurrenceId) takeoverId = null;
    const nodeId = record.occurrence.address.nodeId;
    if (![...live.values()].some((entry) => entry.occurrence.address.nodeId === nodeId)) {
      environment.untrack(nodeId);
    }
    return record;
  };

  const settle = (occurrenceId: string, outcome: WikiOccurrenceSettleOutcome) => {
    if (remove(occurrenceId) === null) return;
    try {
      input.settle(occurrenceId, outcome);
    } catch {
      // Recording is best effort; the occurrence is still settled once here.
    }
  };

  const update = (occurrenceId: string, next: LiveWikiOccurrence) => {
    const record = live.get(occurrenceId);
    if (record !== undefined) live.set(occurrenceId, { ...record, occurrence: next });
  };

  /** Applies every settlement that is now due; returns whether any happened. */
  const settleDue = (material: MaterialView, pageExit: boolean): boolean => {
    const nowMs = environment.now();
    let changed = false;
    for (const [occurrenceId, record] of [...live]) {
      const addressIntact = wikiOccurrenceAddressHolds(record.occurrence.address, material);
      if (occurrenceId === takeoverId) {
        // An open takeover suspends silence; leaving or losing the word ends it.
        if (!addressIntact) {
          settle(occurrenceId, "censored");
          changed = true;
        } else if (pageExit) {
          settle(occurrenceId, "inspected-kept");
          changed = true;
        }
        continue;
      }
      const decision = decideWikiOccurrenceSettlement(record.occurrence, {
        addressIntact,
        pageExit,
        nowMs,
      });
      if (decision === "pending") continue;
      settle(occurrenceId, decision);
      changed = true;
    }
    return changed;
  };

  const readMaterial = (): MaterialView | null => {
    try {
      return input.readMaterial();
    } catch {
      return null;
    }
  };

  function tick() {
    if (disposed) return;
    const nowMs = environment.now();
    const elapsed = lastTickMs === null
      ? 0
      : Math.min(Math.max(0, nowMs - lastTickMs), MAX_TICK_ELAPSED_MS);
    lastTickMs = nowMs;
    const visible = environment.isPageVisible();
    for (const [occurrenceId, record] of live) {
      const progress = record.occurrence.progress;
      const perceivable = visible && surfaceAvailable && progress.disclosed &&
        !progress.perceived && occurrenceId !== takeoverId &&
        environment.isPerceivable(record.occurrence.address);
      const next = advanceWikiOccurrenceDwell(
        advanceWikiOccurrencePerception(progress, elapsed, perceivable),
        elapsed,
        visible,
      );
      if (next !== progress) update(occurrenceId, { ...record.occurrence, progress: next });
    }
    const material = readMaterial();
    if (material !== null && settleDue(material, false)) {
      publish();
      syncResources();
    }
  }

  function settleAtPageExit() {
    const material = readMaterial();
    if (material === null) return;
    if (settleDue(material, true)) publish();
    syncResources();
  }

  function noteNativeCopy() {
    let changed = false;
    for (const [occurrenceId, record] of live) {
      if (!record.occurrence.progress.perceived ||
          !environment.selectionCovers(record.occurrence.address)) continue;
      const next = noteWikiOccurrenceCopy(record.occurrence.progress);
      if (next !== record.occurrence.progress) {
        update(occurrenceId, { ...record.occurrence, progress: next });
        changed = true;
      }
    }
    if (changed) settleNow();
  }

  const settleNow = () => {
    const material = readMaterial();
    if (material !== null && settleDue(material, false)) {
      publish();
      syncResources();
    }
  };

  function reconcile() {
    if (disposed || live.size === 0) return;
    const material = readMaterial();
    if (material === null) return;
    if (restoring !== null) {
      const node = material.tree.nodes[restoring.nodeId];
      if (node !== undefined && node.updatedAt !== restoring.nodeUpdatedAt) {
        for (const [occurrenceId, record] of live) {
          const address = remapWikiOccurrenceAddress(
            record.occurrence.address,
            restoring,
            node.updatedAt,
          );
          if (address !== null && address !== record.occurrence.address) {
            update(occurrenceId, { ...record.occurrence, address });
          }
        }
      }
    }
    if (settleDue(material, false)) {
      publish();
      syncResources();
    }
  }

  const noteCopy = (matches: (record: Record) => boolean) => {
    const material = readMaterial();
    if (material === null) return;
    for (const [occurrenceId, record] of live) {
      if (!matches(record) ||
          !wikiOccurrenceAddressHolds(record.occurrence.address, material)) continue;
      update(occurrenceId, {
        ...record.occurrence,
        progress: noteWikiOccurrenceCopy(record.occurrence.progress),
      });
    }
    settleNow();
  };

  return Object.freeze({
    admit(publication) {
      if (disposed) return;
      const material = readMaterial();
      if (material === null) return;
      const admitted = admitWikiOccurrences(publication, material, environment.now());
      if (admitted.length === 0) return;
      for (const occurrence of admitted) {
        if (live.has(occurrence.id)) continue;
        live.set(occurrence.id, { occurrence, locale: publication.locale });
        environment.track(occurrence.address.nodeId);
      }
      // The bound censors the oldest; a burst never grows unowned memory.
      while (live.size > MAX_LIVE_WIKI_OCCURRENCES) {
        const oldest = live.keys().next().value!;
        settle(oldest, "censored");
      }
      publish();
      syncResources();
    },
    reconcile,
    noteHumanAdmission() {
      if (disposed || live.size === 0) return;
      for (const [occurrenceId, record] of live) {
        const next = noteWikiOccurrenceAdmission(record.occurrence.progress);
        if (next !== record.occurrence.progress) {
          update(occurrenceId, { ...record.occurrence, progress: next });
        }
      }
      settleNow();
    },
    noteMaterialCopied(nodeIds) {
      if (disposed || live.size === 0) return;
      const copied = new Set(nodeIds);
      noteCopy((record) => copied.has(record.occurrence.address.nodeId));
    },
    noteExported() {
      if (disposed || live.size === 0) return;
      noteCopy(() => true);
    },
    setSurfaceAvailable(available) {
      surfaceAvailable = available;
    },
    markDisclosed(occurrenceId) {
      const record = live.get(occurrenceId);
      if (record === undefined || record.occurrence.progress.disclosed) return;
      update(occurrenceId, {
        ...record.occurrence,
        progress: markWikiOccurrenceDisclosed(record.occurrence.progress),
      });
      publish();
    },
    openTakeover(occurrenceId) {
      const record = live.get(occurrenceId);
      const material = readMaterial();
      if (
        record === undefined || material === null ||
        !wikiOccurrenceAddressHolds(record.occurrence.address, material)
      ) return false;
      if (takeoverId !== null && takeoverId !== occurrenceId) {
        settle(takeoverId, "inspected-kept");
      }
      takeoverId = occurrenceId;
      // Opening the takeover is itself disclosure.
      update(occurrenceId, {
        ...record.occurrence,
        progress: markWikiOccurrenceDisclosed(record.occurrence.progress),
      });
      publish();
      syncResources();
      return true;
    },
    closeTakeover(occurrenceId, outcome) {
      if (takeoverId !== occurrenceId) return;
      settle(occurrenceId, outcome);
      publish();
      syncResources();
    },
    leaveTakeover(occurrenceId) {
      if (takeoverId !== occurrenceId) return;
      takeoverId = null;
      publish();
    },
    revert(occurrenceId) {
      const record = live.get(occurrenceId);
      const material = readMaterial();
      if (
        record === undefined || material === null ||
        !wikiOccurrenceAddressHolds(record.occurrence.address, material)
      ) {
        if (record !== undefined) reconcile();
        return "stale";
      }
      const { address, sourceText } = record.occurrence;
      restoring = Object.freeze({
        nodeId: address.nodeId,
        nodeUpdatedAt: address.nodeUpdatedAt,
        start: address.start,
        end: address.end,
        replacementLength: sourceText.length,
      });
      // The reverted occurrence leaves before the commit, so the material
      // change it causes can never censor it.
      remove(occurrenceId);
      let restored = false;
      try {
        restored = input.restore(Object.freeze({
          treeId: address.treeId,
          documentEpoch: address.documentEpoch,
          nodeId: address.nodeId,
          expectedUpdatedAt: address.nodeUpdatedAt,
          start: address.start,
          end: address.end,
          expectedText: address.canonicalText,
          replacement: sourceText,
        }));
        if (restored) reconcile();
      } catch {
        restored = false;
      } finally {
        restoring = null;
      }
      if (!restored) {
        // A restoration that failed closed leaves the word untouched; the
        // occurrence returns only if its address still holds.
        live.set(occurrenceId, { ...record });
        environment.track(address.nodeId);
        reconcile();
        publish();
        syncResources();
        return "stale";
      }
      try {
        input.settle(occurrenceId, "reverted");
      } catch {
        // The material change stands even when Wiki cannot record it.
      }
      publish();
      syncResources();
      return "reverted";
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    dispose() {
      if (disposed) return;
      disposed = true;
      live.clear();
      takeoverId = null;
      syncResources();
      environment.dispose();
      listeners.clear();
      snapshot = EMPTY_VIEWS;
    },
  });
}
