import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import { createChunkRecovery, type ChunkRecoveryHost } from "./chunk-recovery";
import type {
  WikiOccurrenceDriver,
  WikiOccurrenceDriverInput,
  WikiOccurrenceView,
} from "./wiki-occurrence-driver";

type DriverFactory = (input: WikiOccurrenceDriverInput) => WikiOccurrenceDriver;

/**
 * Publications held while the disclosure loads, or waits to be retried after
 * a failed load; later ones replace the oldest.
 */
const MAX_WAITING_PUBLICATIONS = 16;
const EMPTY_VIEWS: readonly WikiOccurrenceView[] = Object.freeze([]);

export type LazyWikiOccurrenceDriver = WikiOccurrenceDriver & Readonly<{
  /**
   * False once loading the disclosure failed, until a retry succeeds. A
   * change that could not be disclosed would be hidden, so the composition
   * withholds Wiki's suggestions meanwhile.
   */
  disclosureAvailable: () => boolean;
}>;

/**
 * The eager stand-in for the occurrence driver. Material commits publish into
 * it synchronously; the lifecycle, its browser resources, Wiki's policy, and
 * the render-edge disclosure load only when the first committed occurrence
 * arrives. Until then nothing is live, so every question it is asked has the
 * empty answer. A failed load keeps its waiting publications (bounded) and is
 * retried by `chunk-recovery`, and by the next human admission.
 */
export function createLazyWikiOccurrenceDriver(
  input: WikiOccurrenceDriverInput,
  load: () => Promise<DriverFactory>,
  recoveryHost?: ChunkRecoveryHost | null,
): LazyWikiOccurrenceDriver {
  let driver: WikiOccurrenceDriver | null = null;
  let loading: Promise<void> | null = null;
  let disposed = false;
  let failed = false;
  let surfaceAvailable = true;
  const waiting: MaterialLexicalOccurrencePublication[] = [];
  const listeners = new Set<() => void>();
  const unsavedListeners = new Set<() => void>();
  const notify = (targets: ReadonlySet<() => void>) => {
    for (const listener of [...targets]) {
      try {
        listener();
      } catch {
        // One presentation observer cannot stop the others.
      }
    }
  };

  const attempt = (force: boolean) => {
    if (driver !== null || loading !== null || disposed) return;
    if (!force && !recovery.mayAttempt()) return;
    loading = load().then(
      (create) => {
        loading = null;
        if (disposed) return;
        failed = false;
        recovery.succeeded();
        const loaded = create(input);
        loaded.setSurfaceAvailable(surfaceAvailable);
        loaded.subscribe(() => notify(listeners));
        loaded.subscribeUnsaved(() => notify(unsavedListeners));
        driver = loaded;
        // Each waiting commit is admitted against the current material, so a
        // passage that changed while the chunk loaded is simply not shown.
        for (const publication of waiting.splice(0)) loaded.admit(publication);
        loaded.reconcile();
      },
      () => {
        // The waiting commits stay (bounded) for the retry; they are admitted
        // against the material current then, so a changed passage just drops.
        loading = null;
        if (disposed) return;
        failed = true;
        recovery.failed();
      },
    );
  };
  const recovery = createChunkRecovery(() => attempt(true), recoveryHost);
  const ensureLoaded = () => attempt(false);

  return Object.freeze({
    admit(publication) {
      if (disposed) return;
      if (driver !== null) {
        driver.admit(publication);
        return;
      }
      waiting.push(publication);
      if (waiting.length > MAX_WAITING_PUBLICATIONS) waiting.shift();
      ensureLoaded();
    },
    reconcile: () => driver?.reconcile(),
    noteHumanAdmission() {
      if (driver !== null) {
        driver.noteHumanAdmission();
        return;
      }
      // While disclosure is unavailable Wiki applies nothing, so no commit
      // publishes; each admission is the demand that tries again.
      if (failed) ensureLoaded();
    },
    noteMaterialCopied: (nodeIds) => driver?.noteMaterialCopied(nodeIds),
    noteExported: () => driver?.noteExported(),
    setSurfaceAvailable(available) {
      surfaceAvailable = available;
      driver?.setSurfaceAvailable(available);
    },
    markDisclosed: (occurrenceId) => driver?.markDisclosed(occurrenceId),
    openTakeover: (occurrenceId) => driver?.openTakeover(occurrenceId) ?? false,
    closeTakeover: (occurrenceId, outcome) => driver?.closeTakeover(occurrenceId, outcome),
    leaveTakeover: (occurrenceId, reason) => driver?.leaveTakeover(occurrenceId, reason),
    revert: (occurrenceId) => driver?.revert(occurrenceId) ?? "stale",
    hitTest: (nodeId, clientX, clientY) => driver?.hitTest(nodeId, clientX, clientY) ?? null,
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
    getSnapshot: () => driver?.getSnapshot() ?? EMPTY_VIEWS,
    disclosureAvailable: () => !failed,
    dispose() {
      if (disposed) return;
      disposed = true;
      recovery.release();
      waiting.length = 0;
      driver?.dispose();
      driver = null;
      listeners.clear();
      unsavedListeners.clear();
    },
  });
}
