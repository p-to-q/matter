import { describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbDocumentRepository } from "./document-repository";
import { createPersistenceController } from "./persistence-controller";
import { holdsUnsavedPersonMaterial } from "./persistence-status";
import {
  createSupersededReload,
  SUPERSEDED_RELOAD_LOOP_MS,
  SUPERSEDED_RELOAD_MAX_BACKOFF_MS,
  type SupersededReloadEnvironment,
} from "./superseded-reload";
import { createMatterStore } from "../store/matter-store";
import type { TreeHistory } from "../tree/history";
import type { ThoughtTree } from "../tree/model";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const SUPERSEDED_IDLE = Object.freeze({ superseded: true, unsavedPersonMaterial: false, materialIdle: true });

function page(visibilityState: DocumentVisibilityState = "visible") {
  const listeners = new Set<() => void>();
  return {
    visibilityState,
    listeners,
    addEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
      listeners.delete(listener);
    }),
    setVisibility(next: DocumentVisibilityState) {
      this.visibilityState = next;
      for (const listener of listeners) listener();
    },
  };
}

function session() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function reloader(
  document: ReturnType<typeof page>,
  storage: SupersededReloadEnvironment["session"],
  now: () => number = () => 1_000_000,
) {
  const reload = vi.fn();
  const handle = createSupersededReload({ document, reload, session: storage, now });
  return { reload, handle };
}

describe("superseded reload", () => {
  it("never reloads a tab the person is looking at", () => {
    const document = page("visible");
    const { reload, handle } = reloader(document, session());

    handle.update(SUPERSEDED_IDLE);
    expect(reload).not.toHaveBeenCalled();
    document.setVisibility("hidden");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("waits for nothing unsaved and nothing in progress", () => {
    const document = page("hidden");
    const { reload, handle } = reloader(document, session());

    handle.update({ ...SUPERSEDED_IDLE, unsavedPersonMaterial: true });
    handle.update({ ...SUPERSEDED_IDLE, materialIdle: false });
    handle.update({ ...SUPERSEDED_IDLE, superseded: false });
    expect(reload).not.toHaveBeenCalled();
    handle.update(SUPERSEDED_IDLE);
    expect(reload).toHaveBeenCalledOnce();
    handle.update(SUPERSEDED_IDLE);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads once per loop window, remembered across the reload itself", () => {
    let now = 5_000_000;
    const remembered = session();
    const first = reloader(page("hidden"), remembered, () => now);
    first.handle.update(SUPERSEDED_IDLE);
    expect(first.reload).toHaveBeenCalledOnce();

    // The reload served the same older build: the next page must not loop.
    now += SUPERSEDED_RELOAD_LOOP_MS - 1;
    const second = reloader(page("hidden"), remembered, () => now);
    second.handle.update(SUPERSEDED_IDLE);
    expect(second.reload).not.toHaveBeenCalled();

    now += 1;
    second.handle.update(SUPERSEDED_IDLE);
    expect(second.reload).toHaveBeenCalledOnce();
  });

  it("backs off exponentially while every reload serves the same older build, up to one hour", () => {
    let now = 5_000_000;
    const remembered = session();
    const reloadsAt: number[] = [];
    // A hidden tab whose visibility flickers every ten seconds for two days,
    // each page reloaded into the same rolled-back build.
    let current = reloader(page("hidden"), remembered, () => now);
    const end = now + 2 * 24 * 60 * 60_000;
    for (; now < end; now += 10_000) {
      current.handle.update(SUPERSEDED_IDLE);
      if (current.reload.mock.calls.length > 0) {
        reloadsAt.push(now);
        current = reloader(page("hidden"), remembered, () => now);
      }
    }
    const gaps = reloadsAt.slice(1).map((at, index) => at - reloadsAt[index]!);
    const minute = SUPERSEDED_RELOAD_LOOP_MS;
    expect(gaps.slice(0, 7)).toEqual([1, 2, 4, 8, 16, 32, 60].map((factor) => factor * minute));
    expect(gaps.slice(7).every((gap) => gap === SUPERSEDED_RELOAD_MAX_BACKOFF_MS)).toBe(true);
    // Two days cost 53 background reloads, not the 2,880 a fixed minute would.
    expect(reloadsAt).toHaveLength(53);
  });

  it("starts a new episode after a long run on a build that was not superseded", () => {
    let now = 5_000_000;
    const remembered = session();
    for (let index = 0; index < 5; index += 1) {
      now += SUPERSEDED_RELOAD_MAX_BACKOFF_MS;
      reloader(page("hidden"), remembered, () => now).handle.update(SUPERSEDED_IDLE);
    }
    expect(JSON.parse(remembered.values.get("matter.superseded-reload.v2")!)).toMatchObject({ count: 5 });

    // The newer build ran for a day before it, too, was superseded.
    now += 24 * 60 * 60_000;
    const later = reloader(page("hidden"), remembered, () => now);
    later.handle.update(SUPERSEDED_IDLE);
    expect(later.reload).toHaveBeenCalledOnce();
    expect(JSON.parse(remembered.values.get("matter.superseded-reload.v2")!)).toEqual({ atMs: now, count: 1 });
  });

  it("treats a malformed record as none and a clock that moved backwards as too soon", () => {
    const malformed = session();
    malformed.values.set("matter.superseded-reload.v2", "{\"atMs\":\"soon\"}");
    const repaired = reloader(page("hidden"), malformed, () => 1_000_000);
    repaired.handle.update(SUPERSEDED_IDLE);
    expect(repaired.reload).toHaveBeenCalledOnce();

    const skewed = session();
    skewed.values.set("matter.superseded-reload.v2", JSON.stringify({ atMs: 9_000_000, count: 1 }));
    const early = reloader(page("hidden"), skewed, () => 1_000_000);
    early.handle.update(SUPERSEDED_IDLE);
    expect(early.reload).not.toHaveBeenCalled();
  });

  it("never reloads by itself where session storage is refused", () => {
    const withoutSession = reloader(page("hidden"), null);
    withoutSession.handle.update(SUPERSEDED_IDLE);
    expect(withoutSession.reload).not.toHaveBeenCalled();

    const throwing = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const refusing = reloader(page("hidden"), { getItem: () => null, setItem: throwing });
    refusing.handle.update(SUPERSEDED_IDLE);
    expect(refusing.reload).not.toHaveBeenCalled();
  });

  it("moves an older build past an untouched seed it could not save, never past the person's change", async () => {
    // A newer build already upgraded the database: this build's open fails.
    vi.mocked(openDB).mockImplementation(async () => {
      throw new DOMException("The requested version is older", "VersionError");
    });
    const olderTab = async (edit: (store: ReturnType<typeof createMatterStore>) => void) => {
      const store = createMatterStore();
      const controller = createPersistenceController(createIndexedDbDocumentRepository());
      const begun = store.getState();
      await expect(controller.start(begun.tree as ThoughtTree, begun.history as TreeHistory)).resolves.toBeNull();
      edit(store);
      // As the persistence hook does once the first load is reconciled.
      const state = store.getState();
      const authored = state.tree !== state.untouchedTree;
      controller.publish(state.tree as ThoughtTree, state.history as TreeHistory, authored);
      const status = controller.getStatus();
      expect(status.errorCode).toBe("PERSISTENCE_SUPERSEDED");
      const { reload, handle } = reloader(page("hidden"), session());
      handle.update({
        superseded: true,
        unsavedPersonMaterial: holdsUnsavedPersonMaterial(status, true, authored),
        materialIdle: true,
      });
      controller.dispose();
      return reload;
    };

    expect(await olderTab(() => undefined)).toHaveBeenCalledOnce();
    const edited = await olderTab((store) => {
      const rootId = store.getState().tree.rootId!;
      store.getState().extendMaterial(rootId, { nodeId: "thought_mine", createdAt: "2026-09-29T00:00:00.000Z" });
    });
    expect(edited).not.toHaveBeenCalled();
  });

  it("stops listening when disposed", () => {
    const document = page("visible");
    const { reload, handle } = reloader(document, session());
    handle.update(SUPERSEDED_IDLE);
    handle.dispose();
    document.setVisibility("hidden");
    expect(reload).not.toHaveBeenCalled();
    expect(document.listeners.size).toBe(0);
  });
});
