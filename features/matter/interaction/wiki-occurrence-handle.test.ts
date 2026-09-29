import { describe, expect, it } from "vitest";
import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import type {
  WikiOccurrenceDriver,
  WikiOccurrenceDriverInput,
  WikiOccurrenceView,
} from "./wiki-occurrence-driver";
import { createLazyWikiOccurrenceDriver } from "./wiki-occurrence-handle";

describe("lazy Wiki occurrence driver", () => {
  it("answers empty until the first occurrence loads the driver, then forwards everything", async () => {
    const loader = deferredLoader();
    const handle = createLazyWikiOccurrenceDriver(INPUT, loader.load);
    let notified = 0;
    let unsaved = 0;
    handle.subscribe(() => {
      notified += 1;
    });
    handle.subscribeUnsaved(() => {
      unsaved += 1;
    });

    // Nothing loads for commits without occurrences, and nothing is live.
    handle.reconcile();
    handle.noteExported();
    expect(loader.calls).toBe(0);
    expect(handle.getSnapshot()).toEqual([]);
    expect(handle.openTakeover("occ_a")).toBe(false);
    expect(handle.revert("occ_a")).toBe("stale");
    expect(handle.hitTest("thought", 1, 1)).toBeNull();

    handle.setSurfaceAvailable(false);
    handle.admit(publication("occ_a"));
    handle.admit(publication("occ_b"));
    expect(loader.calls).toBe(1);

    const fake = loader.resolve();
    await flush();
    expect(fake.surface).toEqual([false]);
    expect(fake.admitted).toEqual(["occ_a", "occ_b"]);
    expect(fake.reconciled).toBe(1);
    expect(notified).toBe(2);
    expect(handle.getSnapshot().map((view) => view.id)).toEqual(["occ_a", "occ_b"]);

    handle.admit(publication("occ_c"));
    expect(fake.admitted).toEqual(["occ_a", "occ_b", "occ_c"]);
    fake.reportUnsaved();
    expect(unsaved).toBe(1);

    handle.dispose();
    expect(fake.disposed).toBe(true);
    expect(handle.getSnapshot()).toEqual([]);
  });

  it("drops waiting commits when the chunk fails and retries with the next one", async () => {
    const loader = deferredLoader();
    const handle = createLazyWikiOccurrenceDriver(INPUT, loader.load);
    handle.admit(publication("occ_a"));
    loader.reject();
    await flush();
    expect(handle.getSnapshot()).toEqual([]);

    handle.admit(publication("occ_b"));
    expect(loader.calls).toBe(2);
    const fake = loader.resolve();
    await flush();
    expect(fake.admitted).toEqual(["occ_b"]);
  });

  it("never loads after disposal", async () => {
    const loader = deferredLoader();
    const handle = createLazyWikiOccurrenceDriver(INPUT, loader.load);
    handle.admit(publication("occ_a"));
    handle.dispose();
    const fake = loader.resolve();
    await flush();
    expect(fake.admitted).toEqual([]);
    handle.admit(publication("occ_b"));
    expect(loader.calls).toBe(1);
  });
});

const INPUT: WikiOccurrenceDriverInput = Object.freeze({
  readMaterial: () => {
    throw new Error("not read by the handle");
  },
  settle: () => undefined,
  restore: () => false,
});

type FakeDriver = WikiOccurrenceDriver & {
  admitted: string[];
  surface: boolean[];
  reconciled: number;
  disposed: boolean;
  reportUnsaved: () => void;
};

function deferredLoader() {
  const pending: { resolve: () => FakeDriver; reject: () => void }[] = [];
  const state = {
    calls: 0,
    load: () => {
      state.calls += 1;
      return new Promise<(input: WikiOccurrenceDriverInput) => WikiOccurrenceDriver>(
        (resolve, reject) => {
          pending.push({
            resolve: () => {
              const fake = fakeDriver();
              resolve(() => fake);
              return fake;
            },
            reject: () => reject(new Error("chunk failed")),
          });
        },
      );
    },
    resolve: () => pending.shift()!.resolve(),
    reject: () => pending.shift()!.reject(),
  };
  return state;
}

function fakeDriver(): FakeDriver {
  const listeners = new Set<() => void>();
  const unsavedListeners = new Set<() => void>();
  let views: readonly WikiOccurrenceView[] = [];
  const fake: FakeDriver = {
    admitted: [],
    surface: [],
    reconciled: 0,
    disposed: false,
    reportUnsaved: () => unsavedListeners.forEach((listener) => listener()),
    admit(publication) {
      const id = publication.edits[0]!.occurrence;
      fake.admitted.push(id);
      views = [...views, { id } as WikiOccurrenceView];
      listeners.forEach((listener) => listener());
    },
    reconcile() {
      fake.reconciled += 1;
    },
    noteHumanAdmission: () => undefined,
    noteMaterialCopied: () => undefined,
    noteExported: () => undefined,
    setSurfaceAvailable(available) {
      fake.surface.push(available);
    },
    markDisclosed: () => undefined,
    openTakeover: () => true,
    closeTakeover: () => undefined,
    leaveTakeover: () => undefined,
    revert: () => "reverted",
    hitTest: () => null,
    subscribeUnsaved(listener) {
      unsavedListeners.add(listener);
      return () => unsavedListeners.delete(listener);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => views,
    dispose() {
      fake.disposed = true;
    },
  };
  return fake;
}

function publication(occurrence: string): MaterialLexicalOccurrencePublication {
  return {
    treeId: "tree",
    documentEpoch: 0,
    nodeId: "thought",
    nodeUpdatedAt: "2026-09-29T00:00:00.000Z",
    stage: "admission",
    channel: "spoken",
    locale: "en-US",
    edits: [{ start: 0, end: 5, occurrence, sourceText: "code x" }],
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}
