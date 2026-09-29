import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import type {
  WikiOccurrenceDriver,
  WikiOccurrenceDriverInput,
  WikiOccurrenceView,
} from "./wiki-occurrence-driver";

type DriverFactory = (input: WikiOccurrenceDriverInput) => WikiOccurrenceDriver;

/** Publications held while the driver loads; later ones replace the oldest. */
const MAX_WAITING_PUBLICATIONS = 16;
const EMPTY_VIEWS: readonly WikiOccurrenceView[] = Object.freeze([]);

/**
 * The eager stand-in for the occurrence driver. Material commits publish into
 * it synchronously; the lifecycle, its browser resources, and Wiki's policy
 * load only when the first committed occurrence arrives. Until then nothing is
 * live, so every question it is asked has the empty answer.
 */
export function createLazyWikiOccurrenceDriver(
  input: WikiOccurrenceDriverInput,
  load: () => Promise<DriverFactory>,
): WikiOccurrenceDriver {
  let driver: WikiOccurrenceDriver | null = null;
  let loading: Promise<void> | null = null;
  let disposed = false;
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

  const ensureLoaded = () => {
    if (driver !== null || loading !== null || disposed) return;
    loading = load().then(
      (create) => {
        loading = null;
        if (disposed) return;
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
        // A failed chunk costs these occurrences only; the next one retries.
        loading = null;
        waiting.length = 0;
      },
    );
  };

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
    noteHumanAdmission: () => driver?.noteHumanAdmission(),
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
    dispose() {
      if (disposed) return;
      disposed = true;
      waiting.length = 0;
      driver?.dispose();
      driver = null;
      listeners.clear();
      unsavedListeners.clear();
    },
  });
}
