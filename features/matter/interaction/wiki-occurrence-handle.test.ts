import { describe, expect, it } from "vitest";
import type { MaterialLexicalOccurrencePublication } from "../application/material-lexical-occurrence-port";
import type {
  WikiOccurrenceDriver,
  WikiOccurrenceDriverInput,
  WikiOccurrenceView,
} from "./wiki-occurrence-driver";
import { CHUNK_RECOVERY } from "./chunk-recovery";
import { createTestRecoveryHost } from "./chunk-recovery-test-host";
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

  it("keeps waiting commits across a failed load and retries after backoff", async () => {
    const clock = createTestRecoveryHost();
    const loader = deferredLoader();
    const handle = createLazyWikiOccurrenceDriver(INPUT, loader.load, clock.host);
    expect(handle.disclosureAvailable()).toBe(true);
    handle.admit(publication("occ_a"));
    loader.reject();
    await flush();
    expect(handle.getSnapshot()).toEqual([]);
    // Disclosure cannot load: the composition withholds Wiki meanwhile.
    expect(handle.disclosureAvailable()).toBe(false);

    // A commit inside the backoff waits with the first; nothing is refetched.
    handle.admit(publication("occ_b"));
    expect(loader.calls).toBe(1);
    clock.advance(CHUNK_RECOVERY.initialDelayMs);
    expect(loader.calls).toBe(2);
    const fake = loader.resolve();
    await flush();
    expect(fake.admitted).toEqual(["occ_a", "occ_b"]);
    expect(handle.disclosureAvailable()).toBe(true);
    expect(clock.timers).toBe(0);
    expect(clock.listening).toBe(false);
  });

  it("retries when the network returns and on the next human admission", async () => {
    const clock = createTestRecoveryHost();
    const loader = deferredLoader();
    const handle = createLazyWikiOccurrenceDriver(INPUT, loader.load, clock.host);
    handle.admit(publication("occ_a"));
    loader.reject();
    await flush();

    // Back online: tried at once, without waiting out the backoff.
    clock.signal();
    expect(loader.calls).toBe(2);
    loader.reject();
    await flush();
    expect(handle.disclosureAvailable()).toBe(false);

    // Timed retries are bounded; past them only a signal or a demand retries.
    let timedRetries = 0;
    while (clock.timers > 0) {
      clock.advance(CHUNK_RECOVERY.maxDelayMs);
      loader.reject();
      await flush();
      timedRetries += 1;
    }
    // The first failure's timed retry was replaced by the signal's attempt.
    expect(timedRetries).toBe(CHUNK_RECOVERY.maxTimedRetries - 1);
    const calls = loader.calls;
    expect(clock.timers).toBe(0);
    clock.advance(CHUNK_RECOVERY.maxDelayMs * 10);
    expect(loader.calls).toBe(calls);

    // Wiki applies nothing meanwhile, so the next human admission is the demand.
    handle.noteHumanAdmission();
    expect(loader.calls).toBe(calls + 1);
    const fake = loader.resolve();
    await flush();
    expect(fake.admitted).toEqual(["occ_a"]);
    expect(handle.disclosureAvailable()).toBe(true);
    expect(clock.listening).toBe(false);
  });

  it("bounds the commits that wait for disclosure", async () => {
    const clock = createTestRecoveryHost();
    const loader = deferredLoader();
    const handle = createLazyWikiOccurrenceDriver(INPUT, loader.load, clock.host);
    for (let index = 0; index < 20; index += 1) handle.admit(publication(`occ_${index}`));
    loader.reject();
    await flush();
    clock.advance(CHUNK_RECOVERY.initialDelayMs);
    const fake = loader.resolve();
    await flush();
    expect(fake.admitted).toEqual(Array.from({ length: 16 }, (_, index) => `occ_${index + 4}`));
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
