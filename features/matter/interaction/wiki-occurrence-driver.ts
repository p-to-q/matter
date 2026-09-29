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
/**
 * A rewrite of a passage (typically its late repair) re-applies the same
 * correction as a new occurrence. The person already watched it settle, so the
 * successor is disclosed without a second settle. This memory is presentation
 * continuity only: bounded, short-lived, and never evidence.
 */
const DISCLOSURE_CONTINUITY = Object.freeze({ maxEntries: 16, windowMs: 15_000 });
/**
 * Wiki… hands the takeover to the settings surface. Silence stays suspended
 * until that surface has covered the paper and let it go again; if it never
 * covers the paper, suspension lapses after this much visible time.
 */
const CONSULT_WITHOUT_SURFACE_MS = 3_000;

export type WikiOccurrenceSettleOutcome =
  | "accepted-implicit"
  | "inspected-kept"
  | "explicit-confirm"
  | "reverted"
  | "censored";

/** Content-free result of recording one settlement. */
export type WikiOccurrenceSettleStatus =
  | "unattributed"
  | "neutral"
  | "recorded"
  | "unchanged"
  | "failed";

export type WikiOccurrenceSettle = (
  occurrenceId: string,
  outcome: WikiOccurrenceSettleOutcome,
) => void | Promise<WikiOccurrenceSettleStatus>;

/** One addressable candidate for a pointer hit test. */
export type WikiOccurrenceTarget = Readonly<{ id: string; address: WikiOccurrenceAddress }>;

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
  /** The candidate a pointer at this client point lands on, if any. */
  hitTest(targets: readonly WikiOccurrenceTarget[], clientX: number, clientY: number): string | null;
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
  /**
   * Closes the takeover without settling. `consult` hands it to the Wiki
   * surface and keeps silence suspended until that surface is gone; `unread`
   * returns a takeover dismissed before it could be read to silence.
   */
  leaveTakeover(occurrenceId: string, reason: "consult" | "unread"): void;
  /** Restores the heard form as an ordinary human material command. */
  revert(occurrenceId: string): "reverted" | "stale";
  /** The disclosed occurrence a pointer at this point on a passage lands on. */
  hitTest(nodeId: string, clientX: number, clientY: number): string | null;
  /** Keep or revert that Wiki could not record; the material change stands. */
  subscribeUnsaved(listener: () => void): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly WikiOccurrenceView[];
  dispose(): void;
}>;

type Record = {
  occurrence: LiveWikiOccurrence;
  locale: MatterLocale;
};

const EMPTY_VIEWS: readonly WikiOccurrenceView[] = Object.freeze([]);

// The record type forces every view field to be named, so a new field is
// compared without another list to keep in step. Every field is a primitive.
const VIEW_FIELDS = Object.freeze(Object.keys({
  id: true,
  nodeId: true,
  nodeUpdatedAt: true,
  start: true,
  end: true,
  canonicalText: true,
  sourceText: true,
  locale: true,
  disclosed: true,
  takeover: true,
  admittedAtMs: true,
} satisfies { [Field in keyof WikiOccurrenceView]: true }) as (keyof WikiOccurrenceView)[]);

function sameView(left: WikiOccurrenceView, right: WikiOccurrenceView): boolean {
  return VIEW_FIELDS.every((field) => left[field] === right[field]);
}

/**
 * The one browser owner of committed Wiki occurrences. It holds every timer,
 * observer, and page listener the lifecycle needs, attaches them only while an
 * occurrence is live, and releases them idempotently. It reads material only
 * through `readMaterial` and settles only through `settle`; it never observes
 * Material Undo, only whether each committed address still holds.
 */
export type WikiOccurrenceDriverInput = Readonly<{
  readMaterial: () => MaterialView;
  settle: WikiOccurrenceSettle;
  restore: (request: WikiOccurrenceRestorationRequest) => boolean;
  /**
   * Keeps an occurrence's attribution alive while the person decides about
   * it: the takeover and the Wiki surface it hands off to suspend silence and
   * so may outlast the attribution's ordinary wait.
   */
  renew?: (occurrenceId: string) => void;
}>;

export function createWikiOccurrenceDriver(input: WikiOccurrenceDriverInput & Readonly<{
  environment: WikiOccurrenceEnvironment;
}>): WikiOccurrenceDriver {
  const { environment } = input;
  const live = new Map<string, Record>();
  const listeners = new Set<() => void>();
  const unsavedListeners = new Set<() => void>();
  let snapshot = EMPTY_VIEWS;
  let takeoverId: string | null = null;
  let consulting: { id: string; covered: boolean; openMs: number } | null = null;
  let revertingId: string | null = null;
  let surfaceAvailable = true;
  let lastTickMs: number | null = null;
  let stopTicker: (() => void) | null = null;
  let stopPage: (() => void) | null = null;
  let restoring: WikiOccurrenceRestoration | null = null;
  let lastDocument: Readonly<{ treeId: string; documentEpoch: number }> | null = null;
  let disposed = false;
  // Heard forms live here for at most the continuity window; content never
  // outlives its purpose or crosses a document boundary.
  const recentlyDisclosed: {
    nodeId: string;
    canonicalText: string;
    sourceText: string;
    atMs: number;
  }[] = [];

  const pruneDisclosures = (nowMs: number) => {
    while (recentlyDisclosed.length > 0 &&
        nowMs - recentlyDisclosed[0]!.atMs > DISCLOSURE_CONTINUITY.windowMs) {
      recentlyDisclosed.shift();
    }
  };

  const rememberDisclosure = (occurrence: LiveWikiOccurrence, nowMs: number) => {
    pruneDisclosures(nowMs);
    if (!occurrence.progress.disclosed) return;
    recentlyDisclosed.push({
      nodeId: occurrence.address.nodeId,
      canonicalText: occurrence.address.canonicalText,
      sourceText: occurrence.sourceText,
      atMs: nowMs,
    });
    if (recentlyDisclosed.length > DISCLOSURE_CONTINUITY.maxEntries) recentlyDisclosed.shift();
  };

  /** Takes one matching remembered disclosure, so each is inherited once. */
  const inheritDisclosure = (occurrence: LiveWikiOccurrence, nowMs: number): boolean => {
    pruneDisclosures(nowMs);
    const index = recentlyDisclosed.findIndex((entry) =>
      entry.nodeId === occurrence.address.nodeId &&
      entry.canonicalText === occurrence.address.canonicalText &&
      entry.sourceText === occurrence.sourceText);
    if (index < 0) return false;
    recentlyDisclosed.splice(index, 1);
    return true;
  };

  /** A new document or epoch leaves nothing of the old one behind. */
  const noteDocument = (material: MaterialView) => {
    if (
      lastDocument !== null &&
      (lastDocument.treeId !== material.tree.id ||
        lastDocument.documentEpoch !== material.documentEpoch)
    ) recentlyDisclosed.length = 0;
    lastDocument = Object.freeze({
      treeId: material.tree.id,
      documentEpoch: material.documentEpoch,
    });
  };

  const reportUnsaved = () => {
    for (const listener of [...unsavedListeners]) {
      try {
        listener();
      } catch {
        // A presentation observer cannot change what was recorded.
      }
    }
  };

  /** Records one settlement; an explicit one that fails is reported once. */
  const record = (occurrenceId: string, outcome: WikiOccurrenceSettleOutcome) => {
    const explicit = outcome === "explicit-confirm" || outcome === "reverted";
    let pending: void | Promise<WikiOccurrenceSettleStatus>;
    try {
      pending = input.settle(occurrenceId, outcome);
    } catch {
      if (explicit) reportUnsaved();
      return;
    }
    if (!explicit || pending === undefined) return;
    void pending.then(
      (status) => {
        if (!disposed && (status === "failed" || status === "unattributed")) reportUnsaved();
      },
      () => {
        if (!disposed) reportUnsaved();
      },
    );
  };

  /**
   * Publishes structurally shared views: an occurrence whose view did not
   * change keeps its object identity, so a presentation bound to one word (an
   * open takeover holding focus, a pending touch dismissal) is not rebuilt
   * because another word settled.
   */
  const publish = () => {
    const previous = new Map(snapshot.map((view) => [view.id, view]));
    const next = live.size === 0
      ? EMPTY_VIEWS
      : [...live.values()].map(({ occurrence, locale }) => {
          const view: WikiOccurrenceView = {
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
          };
          const kept = previous.get(occurrence.id);
          return kept !== undefined && sameView(kept, view) ? kept : Object.freeze(view);
        });
    if (next.length !== snapshot.length || next.some((view, index) => view !== snapshot[index])) {
      snapshot = Object.freeze(next);
    }
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
    const entry = live.get(occurrenceId);
    if (entry === undefined) return null;
    live.delete(occurrenceId);
    if (takeoverId === occurrenceId) takeoverId = null;
    if (consulting?.id === occurrenceId) consulting = null;
    const nodeId = entry.occurrence.address.nodeId;
    if (![...live.values()].some((other) => other.occurrence.address.nodeId === nodeId)) {
      environment.untrack(nodeId);
    }
    return entry;
  };

  const renewAttribution = (occurrenceId: string) => {
    try {
      input.renew?.(occurrenceId);
    } catch {
      // Attribution is best effort; the takeover itself never depends on it.
    }
  };

  const settle = (occurrenceId: string, outcome: WikiOccurrenceSettleOutcome) => {
    if (remove(occurrenceId) === null) return;
    record(occurrenceId, outcome);
  };

  const update = (occurrenceId: string, next: LiveWikiOccurrence) => {
    const entry = live.get(occurrenceId);
    if (entry !== undefined) live.set(occurrenceId, { ...entry, occurrence: next });
  };

  /** Applies every settlement that is now due; returns whether any happened. */
  const settleDue = (material: MaterialView, pageExit: boolean): boolean => {
    const nowMs = environment.now();
    let changed = false;
    for (const [occurrenceId, record] of [...live]) {
      // The word being restored leaves once its restoration commits.
      if (occurrenceId === revertingId) continue;
      const addressIntact = wikiOccurrenceAddressHolds(record.occurrence.address, material);
      if (occurrenceId === takeoverId || occurrenceId === consulting?.id) {
        // An open takeover, or the Wiki surface it handed off to, suspends
        // silence; leaving the page or losing the word ends it.
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
      if (!addressIntact) rememberDisclosure(record.occurrence, nowMs);
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
    if (consulting !== null) {
      if (!surfaceAvailable) consulting.covered = true;
      else if (consulting.covered) consulting = null;
      else {
        consulting.openMs += elapsed;
        if (consulting.openMs >= CONSULT_WITHOUT_SURFACE_MS) consulting = null;
      }
    }
    // Only the paper itself can hold the word in view: a covering dialog,
    // including the Wiki surface opened from this very word, counts nothing.
    const paperVisible = visible && surfaceAvailable;
    for (const [occurrenceId, record] of live) {
      if (occurrenceId === takeoverId || occurrenceId === consulting?.id) continue;
      const progress = record.occurrence.progress;
      const perceivable = paperVisible && progress.disclosed && !progress.perceived &&
        environment.isPerceivable(record.occurrence.address);
      const next = advanceWikiOccurrenceDwell(
        advanceWikiOccurrencePerception(progress, elapsed, perceivable),
        elapsed,
        paperVisible,
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
    if (disposed) return;
    const material = readMaterial();
    if (material === null) return;
    noteDocument(material);
    if (live.size === 0) return;
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
      noteDocument(material);
      const nowMs = environment.now();
      const admitted = admitWikiOccurrences(publication, material, nowMs);
      if (admitted.length === 0) return;
      for (const occurrence of admitted) {
        if (live.has(occurrence.id)) continue;
        const disclosed = inheritDisclosure(occurrence, nowMs)
          ? Object.freeze({
              ...occurrence,
              progress: markWikiOccurrenceDisclosed(occurrence.progress),
            })
          : occurrence;
        live.set(occurrence.id, { occurrence: disclosed, locale: publication.locale });
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
      renewAttribution(occurrenceId);
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
    leaveTakeover(occurrenceId, reason) {
      if (takeoverId !== occurrenceId) return;
      takeoverId = null;
      if (reason === "consult") {
        consulting = { id: occurrenceId, covered: false, openMs: 0 };
        renewAttribution(occurrenceId);
      }
      publish();
    },
    revert(occurrenceId) {
      const entry = live.get(occurrenceId);
      const material = readMaterial();
      if (
        entry === undefined || material === null ||
        !wikiOccurrenceAddressHolds(entry.occurrence.address, material)
      ) {
        if (entry !== undefined) reconcile();
        return "stale";
      }
      const { address, sourceText } = entry.occurrence;
      restoring = Object.freeze({
        nodeId: address.nodeId,
        nodeUpdatedAt: address.nodeUpdatedAt,
        start: address.start,
        end: address.end,
        replacementLength: sourceText.length,
      });
      // The material change this restoration causes must never censor the
      // occurrence it settles; a failed restoration leaves it where it was.
      revertingId = occurrenceId;
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
        revertingId = null;
      }
      if (!restored) {
        if (takeoverId === occurrenceId) takeoverId = null;
        reconcile();
        publish();
        syncResources();
        return "stale";
      }
      remove(occurrenceId);
      record(occurrenceId, "reverted");
      publish();
      syncResources();
      return "reverted";
    },
    hitTest(nodeId, clientX, clientY) {
      if (disposed) return null;
      const targets: WikiOccurrenceTarget[] = [];
      for (const { occurrence } of live.values()) {
        if (occurrence.address.nodeId === nodeId && occurrence.progress.disclosed) {
          targets.push(Object.freeze({ id: occurrence.id, address: occurrence.address }));
        }
      }
      return targets.length === 0 ? null : environment.hitTest(targets, clientX, clientY);
    },
    subscribeUnsaved(listener) {
      unsavedListeners.add(listener);
      return () => {
        unsavedListeners.delete(listener);
      };
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
      recentlyDisclosed.length = 0;
      takeoverId = null;
      consulting = null;
      syncResources();
      environment.dispose();
      listeners.clear();
      unsavedListeners.clear();
      snapshot = EMPTY_VIEWS;
    },
  });
}
