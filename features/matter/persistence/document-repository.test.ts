import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createIndexedDbDocumentRepository, type LoadedSnapshot, type SnapshotBasis } from "./document-repository";
import { createSeededDocument } from "../material/seeded-document";
import { treeToBundle } from "./snapshot-codec";
import {
  commitTreeCommand,
  createTreeHistory,
  MATTER_HISTORY_LIMITS,
  undoTreeHistory,
  type TreeHistory,
} from "../tree/history";
import type { ThoughtTree, TreeCommand } from "../tree/model";
import {
  emptyHistoryJournal,
  FULL_HISTORY_RETENTION,
  shedHistoryRetention,
  type HistoryRetention,
} from "./history-journal";
import { createPersistenceController } from "./persistence-controller";

vi.mock("idb", () => ({ openDB: vi.fn() }));

const TIME = "2026-09-29T00:00:00.000Z";

describe("IndexedDB document repository", () => {
  let memory: MemoryDatabase;

  beforeEach(() => {
    vi.mocked(openDB).mockReset();
    vi.stubGlobal("IDBKeyRange", MemoryKeyRange);
    memory = new MemoryDatabase();
    vi.mocked(openDB).mockImplementation(async () => memory as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips material with both undo stacks as one row and one record per step", async () => {
    const session = undo(steps(seeded(), 3));
    const repository = createIndexedDbDocumentRepository();

    const saved = await save(repository, session, UNKNOWN);
    expect(saved).toMatchObject({ ok: true, value: { writeGeneration: 1 } });
    expect(memory.records().map(({ stack, position }) => [stack, position])).toEqual([
      ["redo", 0],
      ["undo", 0],
      ["undo", 1],
    ]);
    expect(memory.row(session.tree.id)).not.toHaveProperty("history");

    const loaded = await loadValue(repository, session.tree.id);
    expect(loaded.tree).toEqual(session.tree);
    expect(loaded.history).toEqual({ history: session.history, released: false });
    expect(loaded.basis.writeGeneration).toBe(1);
    expect(loaded.basis.journal.undo.entries).toEqual(session.history.entries);
  });

  it("writes only the new step on the next save and compacts released positions", async () => {
    const repository = createIndexedDbDocumentRepository();
    const first = steps(seeded(), 2);
    const firstSave = await save(repository, first, UNKNOWN);
    if (!firstSave.ok) throw new Error(firstSave.error.code);
    const puts = memory.recordPuts;

    const next = undo(commitStep(first, "after"));
    const secondSave = await save(repository, next, firstSave.value);
    expect(secondSave.ok).toBe(true);
    // One redo record for the undone step; the steps beneath it are untouched.
    expect(memory.recordPuts - puts).toBe(1);
    expect(memory.records().map(({ stack, position }) => [stack, position])).toEqual([
      ["redo", 0],
      ["undo", 0],
      ["undo", 1],
    ]);
  });

  it("refuses a stale generation without writing the row or a single record", async () => {
    const repository = createIndexedDbDocumentRepository();
    const first = steps(seeded(), 1);
    const saved = await save(repository, first, UNKNOWN);
    if (!saved.ok) throw new Error(saved.error.code);
    const before = memory.snapshot();

    await expect(save(repository, commitStep(first, "stale"), UNKNOWN)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT" },
    });
    expect(memory.snapshot()).toEqual(before);
  });

  it("lets only one of two tabs win a generation and gives the loser the winner's journal", async () => {
    const tabA = createIndexedDbDocumentRepository();
    const tabB = createIndexedDbDocumentRepository();
    const base = steps(seeded(), 1);
    const created = await save(tabA, base, UNKNOWN);
    if (!created.ok) throw new Error(created.error.code);
    const loadedB = await loadValue(tabB, base.tree.id);

    const fromA = commitStep(base, "from_a");
    const wonA = await save(tabA, fromA, created.value);
    expect(wonA.ok).toBe(true);
    await expect(save(tabB, commitStep(base, "from_b"), loadedB.basis)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT" },
    });

    const reloadedB = await loadValue(tabB, base.tree.id);
    expect(reloadedB.tree).toEqual(fromA.tree);
    expect(reloadedB.history.history.entries.map(({ commandId }) => commandId)).toEqual(
      fromA.history.entries.map(({ commandId }) => commandId),
    );
  });

  it("restores the steps above a corrupt record, reports it, and compacts it on the next save", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 3);
    const saved = await save(repository, session, UNKNOWN);
    if (!saved.ok) throw new Error(saved.error.code);
    memory.mutateRecord(session.tree.id, "undo", 0, (record) => ({ ...record, inverse: "damaged" }));

    const loaded = await loadValue(repository, session.tree.id);
    expect(loaded.tree).toEqual(session.tree);
    expect(loaded.history.released).toBe(true);
    expect(loaded.history.history.entries.map(({ commandId }) => commandId)).toEqual(["step_2", "step_3"]);

    const next = commitStep({ tree: loaded.tree, history: loaded.history.history }, "step_4");
    const resaved = await save(repository, next, loaded.basis);
    expect(resaved.ok).toBe(true);
    expect(memory.records().map(({ position }) => position)).toEqual([1, 2, 3]);
    const reloaded = await loadValue(repository, session.tree.id);
    expect(reloaded.history.released).toBe(false);
  });

  it("keeps material and drops history whose manifest is from another format", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 2);
    await save(repository, session, UNKNOWN);
    memory.mutateRow(session.tree.id, (row) => ({
      ...row,
      historyJournal: { ...(row.historyJournal as object), formatVersion: 2 },
    }));

    const loaded = await loadValue(repository, session.tree.id);
    expect(loaded.tree).toEqual(session.tree);
    expect(loaded.history).toEqual({ history: createTreeHistory(), released: true });
  });

  it("fails a write atomically and succeeds when the same save is retried", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 2);
    memory.failNextCommit(new DOMException("disk hiccup", "UnknownError"));

    await expect(save(repository, session, UNKNOWN)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_WRITE_FAILED" },
    });
    expect(memory.snapshot()).toEqual({ rows: [], records: [] });
    await expect(save(repository, session, UNKNOWN)).resolves.toMatchObject({ ok: true });
  });

  it("aborts the whole write when a journal record is refused while it is issued", async () => {
    const repository = createIndexedDbDocumentRepository();
    const first = steps(seeded(), 1);
    const saved = await save(repository, first, UNKNOWN);
    if (!saved.ok) throw new Error(saved.error.code);
    const before = memory.snapshot();
    memory.throwOnPut = { store: "historyEntries", error: new DOMException("uncloneable", "DataCloneError") };

    await expect(save(repository, commitStep(first, "refused"), saved.value)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_WRITE_FAILED" },
    });
    // The row put was already issued; without the abort it would commit alone.
    expect(memory.snapshot()).toEqual(before);

    memory.throwOnPut = { store: "snapshots", error: new DOMException("storage full", "QuotaExceededError") };
    await expect(save(repository, commitStep(first, "full"), saved.value)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_STORAGE_FULL" },
    });
  });

  it.each([
    ["ordinary exception", new Error("write failed")],
    ["quota-shaped object", { name: "QuotaExceededError", message: "not a DOMException" }],
    ["aborted transaction", new DOMException("transaction aborted", "AbortError")],
  ])("keeps a %s classified as a generic write failure", async (_label, error) => {
    const repository = createIndexedDbDocumentRepository();
    memory.failNextCommit(error);

    await expect(save(repository, steps(seeded(), 0), UNKNOWN)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_WRITE_FAILED" },
    });
  });

  it("classifies a quota refusal reported only as the transaction's abort reason", async () => {
    const repository = createIndexedDbDocumentRepository();
    memory.quotaBytes = 1;

    await expect(save(repository, steps(seeded(), 0), UNKNOWN)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_STORAGE_FULL" },
    });
  });

  it("fits material under quota by writing fewer durable undo steps", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 6);
    const withoutUndo = await sizeOf(session, { maxUndoBytes: 0, keepRedo: true });
    memory.quotaBytes = withoutUndo + 1;

    await expect(save(repository, session, UNKNOWN)).resolves.toMatchObject({
      error: { code: "PERSISTENCE_STORAGE_FULL" },
    });
    const half = shedHistoryRetention(session.history, FULL_HISTORY_RETENTION)!;
    const none = shedHistoryRetention(session.history, half)!;
    const saved = await save(repository, session, UNKNOWN, none);
    expect(saved.ok).toBe(true);
    const loaded = await loadValue(repository, session.tree.id);
    expect(loaded.tree).toEqual(session.tree);
    expect(loaded.history).toEqual({ history: createTreeHistory(), released: false });
  });

  it("migrates a pre-v6 inline journal on the first save and never writes it again", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = undo(steps(seeded(), 2));
    memory.putRow({
      storageSchemaVersion: 1,
      treeId: session.tree.id,
      treeRevision: session.tree.revision,
      writeGeneration: 3,
      bundle: treeToBundle(session.tree),
      history: structuredClone(session.history),
    });

    const loaded = await loadValue(repository, session.tree.id);
    expect(loaded.history).toEqual({ history: session.history, released: false });
    expect(loaded.basis).toMatchObject({ writeGeneration: 3, journal: emptyHistoryJournal(0) });

    const next = commitStep({ tree: loaded.tree, history: loaded.history.history }, "after_migration");
    const saved = await save(repository, next, loaded.basis);
    expect(saved).toMatchObject({ ok: true, value: { writeGeneration: 4 } });
    const row = memory.row(session.tree.id);
    expect(row).not.toHaveProperty("history");
    expect(row).toMatchObject({ historyJournal: { formatVersion: 1, epoch: 0, count: next.history.entries.length } });
    const reloaded = await loadValue(repository, session.tree.id);
    expect(reloaded.history).toEqual({ history: next.history, released: false });
  });

  it("treats a manifest left behind by another writer as stale and reclaims its records", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 2);
    const saved = await save(repository, session, UNKNOWN);
    if (!saved.ok) throw new Error(saved.error.code);
    // A writer that copies the row forward without owning the journal.
    memory.mutateRow(session.tree.id, (row) => ({ ...row, writeGeneration: 2 }));

    const loaded = await loadValue(repository, session.tree.id);
    expect(loaded.history).toEqual({ history: createTreeHistory(), released: true });
    const resaved = await save(repository, { tree: loaded.tree, history: loaded.history.history }, loaded.basis);
    expect(resaved.ok).toBe(true);
    expect(memory.records()).toEqual([]);
  });

  it("gives an import a new empty epoch and restores the previous journal on rollback", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 2);
    const saved = await save(repository, session, UNKNOWN);
    if (!saved.ok) throw new Error(saved.error.code);
    const previousRecords = memory.records();

    const imported = steps(seeded(), 0).tree;
    const reserved = await repository.reserveImportedSnapshot(
      imported.id,
      imported.revision,
      treeToBundle(imported),
      1,
    );
    if (!reserved.ok) throw new Error(reserved.error.code);
    expect(reserved.value.basis).toEqual({ writeGeneration: 2, journal: emptyHistoryJournal(1) });
    expect(memory.records()).toEqual(previousRecords);
    expect((await loadValue(repository, imported.id)).history).toEqual({
      history: createTreeHistory(),
      released: false,
    });

    await expect(repository.rollbackImportedSnapshot(reserved.value)).resolves.toEqual({
      ok: true,
      value: { status: "rolled-back", writeGeneration: 3 },
    });
    const restored = await loadValue(repository, session.tree.id);
    expect(restored.tree).toEqual(session.tree);
    expect(restored.history).toEqual({ history: session.history, released: false });
    expect(restored.basis.writeGeneration).toBe(3);
  });

  it("compacts the replaced epoch on the first save after an activated import", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 2);
    await save(repository, session, UNKNOWN);
    const imported = steps(seeded(), 0);
    const reserved = await repository.reserveImportedSnapshot(
      imported.tree.id,
      imported.tree.revision,
      treeToBundle(imported.tree),
      1,
    );
    if (!reserved.ok) throw new Error(reserved.error.code);

    const next = commitStep({ tree: imported.tree, history: createTreeHistory() }, "after_import");
    await expect(save(repository, next, reserved.value.basis)).resolves.toMatchObject({ ok: true });
    expect(memory.records().map(({ epoch, position }) => [epoch, position])).toEqual([[1, 0]]);
  });

  it("never rolls an import back over a row another tab changed", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 1);
    await save(repository, session, UNKNOWN);
    const reserved = await repository.reserveImportedSnapshot(
      session.tree.id,
      session.tree.revision,
      treeToBundle(session.tree),
      1,
    );
    if (!reserved.ok) throw new Error(reserved.error.code);
    await save(repository, commitStep(session, "other_tab"), reserved.value.basis);

    await expect(repository.rollbackImportedSnapshot(reserved.value)).resolves.toEqual({
      ok: true,
      value: { status: "stale" },
    });
  });

  it("exports the exact corrupt row before atomically replacing it and its journal", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 2);
    await save(repository, session, UNKNOWN);
    memory.mutateRow(session.tree.id, (row) => ({ ...row, bundle: { files: {} } }));
    const corrupt = memory.row(session.tree.id);

    const loaded = await repository.load(session.tree.id);
    expect(loaded).toMatchObject({ ok: false, error: { code: "PERSISTENCE_CORRUPT" } });
    const exported = await repository.exportCorrupt(session.tree.id);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(new TextDecoder().decode(exported.value.bytes)).toBe(JSON.stringify(corrupt));

    const replacement = commitStep(session, "replacement");
    const replaced = await repository.replaceCorrupt({
      treeId: replacement.tree.id,
      treeRevision: replacement.tree.revision,
      bundle: treeToBundle(replacement.tree),
      history: replacement.history,
      retention: FULL_HISTORY_RETENTION,
    }, exported.value.basis);
    expect(replaced).toMatchObject({ ok: true, value: { writeGeneration: 2, journal: { epoch: 1 } } });
    expect(new Set(memory.records().map(({ epoch }) => epoch))).toEqual(new Set([1]));
    expect((await loadValue(repository, session.tree.id)).history).toEqual({
      history: replacement.history,
      released: false,
    });
  });

  it("refuses corrupt replacement when the exported row changed", async () => {
    const repository = createIndexedDbDocumentRepository();
    const tree = seeded();
    memory.putRow({ treeId: tree.id, writeGeneration: 3, bundle: { files: {} } });
    const exported = await repository.exportCorrupt(tree.id);
    if (!exported.ok) throw new Error(exported.error.message);
    memory.mutateRow(tree.id, (row) => ({ ...row, writeGeneration: 4 }));
    const before = memory.snapshot();

    await expect(repository.replaceCorrupt({
      treeId: tree.id,
      treeRevision: tree.revision,
      bundle: treeToBundle(tree),
      history: createTreeHistory(),
      retention: FULL_HISTORY_RETENTION,
    }, exported.value.basis)).resolves.toMatchObject({ ok: false, error: { code: "PERSISTENCE_CONFLICT" } });
    expect(memory.snapshot()).toEqual(before);
  });

  it("never overwrites a present malformed row as though the document were missing", async () => {
    const repository = createIndexedDbDocumentRepository();
    const tree = seeded();
    memory.putRow({ treeId: tree.id, bundle: { files: {} } });

    await expect(save(repository, steps(tree, 0), UNKNOWN)).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_CONFLICT" },
    });
  });

  it("fails atomically instead of creating an unsafe write generation", async () => {
    const repository = createIndexedDbDocumentRepository();
    const session = steps(seeded(), 0);
    memory.putRow({
      storageSchemaVersion: 1,
      treeId: session.tree.id,
      treeRevision: session.tree.revision,
      writeGeneration: Number.MAX_SAFE_INTEGER,
      bundle: treeToBundle(session.tree),
    });

    await expect(save(repository, session, {
      writeGeneration: Number.MAX_SAFE_INTEGER,
      journal: emptyHistoryJournal(0),
    })).resolves.toMatchObject({ ok: false, error: { code: "PERSISTENCE_WRITE_FAILED" } });
  });

  it("keeps material saved and says so when storage refuses its history", async () => {
    const session = steps(seeded(), 6);
    memory.quotaBytes = await sizeOf(session, { maxUndoBytes: 0, keepRedo: true }) + 1;
    const controller = createPersistenceController(createIndexedDbDocumentRepository());

    await controller.start(session.tree, session.history);
    await vi.waitFor(() => expect(controller.getStatus().phase).toBe("saved"));
    expect(controller.getStatus()).toMatchObject({
      persistedRevision: session.tree.revision,
      errorCode: null,
      historyNotice: "released",
    });
    expect(memory.records()).toEqual([]);
    controller.dispose();
  });

  it("reports storage full only when the snapshot alone cannot fit", async () => {
    const session = steps(seeded(), 3);
    memory.quotaBytes = 10;
    const controller = createPersistenceController(createIndexedDbDocumentRepository());

    await controller.start(session.tree, session.history);
    await vi.waitFor(() => expect(controller.getStatus().phase).toBe("error"));
    expect(controller.getStatus()).toMatchObject({ errorCode: "PERSISTENCE_STORAGE_FULL" });
    expect(memory.snapshot()).toEqual({ rows: [], records: [] });

    memory.quotaBytes = Number.POSITIVE_INFINITY;
    controller.retry();
    await vi.waitFor(() => expect(controller.getStatus().phase).toBe("saved"));
    expect(memory.records()).toHaveLength(session.history.entries.length);
    controller.dispose();
  });

  it("opens again after the memoized open promise rejects", async () => {
    vi.mocked(openDB)
      .mockRejectedValueOnce(new Error("first open failed"))
      .mockResolvedValueOnce(memory as never);
    const repository = createIndexedDbDocumentRepository();

    await expect(repository.load("tree-1")).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE" },
    });
    await expect(repository.load("tree-1")).resolves.toEqual({ ok: true, value: null });
    expect(openDB).toHaveBeenCalledTimes(2);
  });

  it("does not let an older rejection clear a newer open", async () => {
    let rejectFirst!: (reason: unknown) => void;
    const firstOpen = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    vi.mocked(openDB)
      .mockReturnValueOnce(firstOpen)
      .mockResolvedValueOnce(memory as never);
    const repository = createIndexedDbDocumentRepository();

    const firstLoad = repository.load("tree-1");
    const lifecycle = vi.mocked(openDB).mock.calls[0]?.[2] as
      | { blocked?: () => void; terminated?: () => void }
      | undefined;
    lifecycle?.blocked?.();
    const secondLoad = repository.load("tree-1");
    rejectFirst(new Error("older open failed"));

    await expect(firstLoad).resolves.toMatchObject({ ok: false });
    await expect(secondLoad).resolves.toEqual({ ok: true, value: null });
    lifecycle?.terminated?.();
    await expect(repository.load("tree-1")).resolves.toEqual({ ok: true, value: null });
    expect(openDB).toHaveBeenCalledTimes(2);
  });

  it("closes a late blocked database without touching the explicit retry", async () => {
    const older = new MemoryDatabase();
    let resolveFirst!: (database: MemoryDatabase) => void;
    const firstOpen = new Promise<MemoryDatabase>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(openDB)
      .mockReturnValueOnce(firstOpen as never)
      .mockResolvedValueOnce(memory as never);
    const repository = createIndexedDbDocumentRepository();

    const firstLoad = repository.load("tree-1");
    const lifecycle = vi.mocked(openDB).mock.calls[0]?.[2] as
      | { blocked?: () => void; blocking?: () => void }
      | undefined;
    lifecycle?.blocked?.();
    const secondLoad = repository.load("tree-1");
    resolveFirst(older);

    await expect(firstLoad).resolves.toMatchObject({
      ok: false,
      error: { code: "PERSISTENCE_UNAVAILABLE" },
    });
    await expect(secondLoad).resolves.toEqual({ ok: true, value: null });
    await vi.waitFor(() => expect(older.closed).toBe(1));
    lifecycle?.blocking?.();
    expect(older.closed).toBe(1);

    await expect(repository.load("tree-1")).resolves.toEqual({ ok: true, value: null });
    expect(memory.closed).toBe(0);
    expect(openDB).toHaveBeenCalledTimes(2);
  });
});

type Session = Readonly<{ tree: ThoughtTree; history: TreeHistory }>;
type Repository = ReturnType<typeof createIndexedDbDocumentRepository>;

const UNKNOWN: SnapshotBasis = Object.freeze({ writeGeneration: null, journal: emptyHistoryJournal(0) });

function seeded(): ThoughtTree {
  return createSeededDocument().tree;
}

function save(repository: Repository, session: Session, basis: SnapshotBasis, retention: HistoryRetention = FULL_HISTORY_RETENTION) {
  return repository.save({
    treeId: session.tree.id,
    treeRevision: session.tree.revision,
    bundle: treeToBundle(session.tree),
    basis,
    history: session.history,
    retention,
  });
}

async function loadValue(repository: Repository, treeId: string): Promise<LoadedSnapshot> {
  const loaded = await repository.load(treeId);
  if (!loaded.ok || loaded.value === null) throw new Error("stored snapshot expected");
  return loaded.value;
}

/** The bytes a save with `retention` occupies, measured in an unbounded database. */
async function sizeOf(session: Session, retention: HistoryRetention): Promise<number> {
  const probe = new MemoryDatabase();
  const previous = vi.mocked(openDB).getMockImplementation();
  vi.mocked(openDB).mockImplementation(async () => probe as never);
  const saved = await save(createIndexedDbDocumentRepository(), session, UNKNOWN, retention);
  if (previous !== undefined) vi.mocked(openDB).mockImplementation(previous);
  if (!saved.ok) throw new Error(saved.error.code);
  return probe.bytes();
}

function steps(tree: ThoughtTree, count: number): Session {
  let session: Session = { tree, history: createTreeHistory() };
  for (let step = 1; step <= count; step += 1) session = commitStep(session, `step_${step}`);
  return session;
}

function commitStep(session: Session, id: string): Session {
  const rootId = session.tree.rootId!;
  const root = session.tree.nodes[rootId]!;
  const command: TreeCommand = {
    id,
    source: "human",
    expectedTreeId: session.tree.id,
    expectedRevision: session.tree.revision,
    createdAt: TIME,
    mutation: {
      type: "replace-text",
      nodeId: rootId,
      expectedText: root.text,
      expectedUpdatedAt: root.updatedAt,
      text: `${root.text.slice(0, 40)} ${id}`,
      updatedAt: TIME,
    },
  };
  const result = commitTreeCommand(session.tree, session.history, command, MATTER_HISTORY_LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

function undo(session: Session): Session {
  const result = undoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

type Key = number | string | Key[];
type StoredValue = Record<string, unknown>;
type Mode = "readonly" | "readwrite";

const STORE_KEY_PATHS: Readonly<Record<string, string | readonly string[]>> = {
  snapshots: "treeId",
  historyEntries: ["treeId", "epoch", "stack", "position"],
};

/** The IndexedDB key order: numbers, then strings, then arrays element-wise. */
function compareKeys(left: Key, right: Key): number {
  const rank = (key: Key) => typeof key === "number" ? 1 : typeof key === "string" ? 2 : 3;
  if (rank(left) !== rank(right)) return rank(left) - rank(right);
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const compared = compareKeys(left[index]!, right[index]!);
      if (compared !== 0) return compared;
    }
    return left.length - right.length;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

class MemoryKeyRange {
  constructor(
    readonly lower: Key,
    readonly upper: Key,
    readonly lowerOpen: boolean,
    readonly upperOpen: boolean,
  ) {}

  static bound(lower: Key, upper: Key, lowerOpen = false, upperOpen = false): MemoryKeyRange {
    if (compareKeys(lower, upper) > 0) throw new DOMException("lower exceeds upper", "DataError");
    return new MemoryKeyRange(lower, upper, lowerOpen, upperOpen);
  }

  includes(key: Key): boolean {
    const low = compareKeys(key, this.lower);
    const high = compareKeys(key, this.upper);
    return (this.lowerOpen ? low > 0 : low >= 0) && (this.upperOpen ? high < 0 : high <= 0);
  }
}

type Stores = Map<string, Map<string, Readonly<{ key: Key; value: StoredValue }>>>;

/**
 * The subset of IndexedDB the repository uses, with its guarantees: a
 * transaction sees its own writes, commits all or nothing once no request is
 * pending, stores structured clones, and may be refused at commit for quota.
 */
class MemoryDatabase {
  stores: Stores = new Map(Object.keys(STORE_KEY_PATHS).map((name) => [name, new Map()]));
  quotaBytes = Number.POSITIVE_INFINITY;
  throwOnPut: Readonly<{ store: string; error: unknown }> | null = null;
  recordPuts = 0;
  closed = 0;
  private commitFailures: unknown[] = [];

  transaction(names: string | string[], mode: Mode) {
    return new MemoryTransaction(this, typeof names === "string" ? [names] : names, mode);
  }

  async get(store: string, key: Key) {
    const entry = this.stores.get(store)?.get(JSON.stringify(key));
    return entry === undefined ? undefined : structuredClone(entry.value);
  }

  close() {
    this.closed += 1;
  }

  failNextCommit(error: unknown) {
    this.commitFailures.push(error);
  }

  takeCommitFailure(): unknown {
    return this.commitFailures.shift();
  }

  bytes(stores: Stores = this.stores): number {
    let total = 0;
    for (const store of stores.values()) {
      for (const { value } of store.values()) total += JSON.stringify(value).length;
    }
    return total;
  }

  putRow(row: StoredValue) {
    this.stores.get("snapshots")!.set(JSON.stringify(row.treeId), { key: row.treeId as Key, value: structuredClone(row) });
  }

  row(treeId: string): StoredValue | undefined {
    return this.stores.get("snapshots")!.get(JSON.stringify(treeId))?.value;
  }

  mutateRow(treeId: string, change: (row: StoredValue) => StoredValue) {
    this.putRow(change(this.row(treeId)!));
  }

  records(): StoredValue[] {
    return [...this.stores.get("historyEntries")!.values()]
      .sort((left, right) => compareKeys(left.key, right.key))
      .map(({ value }) => value);
  }

  mutateRecord(treeId: string, stack: string, position: number, change: (record: StoredValue) => StoredValue) {
    const store = this.stores.get("historyEntries")!;
    const record = this.records().find((value) =>
      value.treeId === treeId && value.stack === stack && value.position === position);
    if (record === undefined) throw new Error("record missing");
    const key = [treeId, record.epoch as number, stack, position];
    store.set(JSON.stringify(key), { key, value: change(record) });
  }

  snapshot() {
    return {
      rows: [...this.stores.get("snapshots")!.values()].map(({ value }) => value),
      records: this.records(),
    };
  }
}

class MemoryTransaction {
  readonly done: Promise<void>;
  error: DOMException | null = null;
  private state: "active" | "committed" | "aborted" = "active";
  private readonly working: Stores;
  private resolveDone!: () => void;
  private rejectDone!: (reason: unknown) => void;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly database: MemoryDatabase,
    private readonly names: readonly string[],
    private readonly mode: Mode,
  ) {
    this.working = new Map(names.map((name) => [name, new Map(database.stores.get(name))]));
    this.done = new Promise((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    this.scheduleCommit();
  }

  objectStore(name: string) {
    if (!this.names.includes(name)) throw new DOMException("store outside transaction", "NotFoundError");
    const request = <Value>(operation: () => Value): Promise<Value> => {
      if (this.state !== "active") {
        return Promise.reject(new DOMException("transaction finished", "TransactionInactiveError"));
      }
      this.scheduleCommit();
      return Promise.resolve().then(operation);
    };
    const store = () => this.working.get(name)!;
    const writable = () => {
      if (this.mode !== "readwrite") throw new DOMException("read-only transaction", "ReadOnlyError");
    };
    return {
      get: (key: Key) => request(() => {
        const entry = store().get(JSON.stringify(key));
        return entry === undefined ? undefined : structuredClone(entry.value);
      }),
      getAll: (range?: MemoryKeyRange, count?: number) => request(() => [...store().values()]
        .filter(({ key }) => range === undefined || range.includes(key))
        .sort((left, right) => compareKeys(left.key, right.key))
        .slice(0, count ?? Number.POSITIVE_INFINITY)
        .map(({ value }) => structuredClone(value))),
      put: (value: StoredValue) => this.database.throwOnPut?.store === name
        // A clone, key, or quota refusal throws while the request is issued.
        ? (() => { throw this.database.throwOnPut.error; })()
        : request(() => {
        writable();
        const keyPath = STORE_KEY_PATHS[name]!;
        const key = (typeof keyPath === "string"
          ? value[keyPath]
          : keyPath.map((part) => value[part])) as Key;
        store().set(JSON.stringify(key), { key, value: structuredClone(value) });
        if (name === "historyEntries") this.database.recordPuts += 1;
        return key;
      }),
      delete: (target: Key | MemoryKeyRange) => request(() => {
        writable();
        for (const [serialized, { key }] of store()) {
          const matches = target instanceof MemoryKeyRange
            ? target.includes(key)
            : compareKeys(key, target) === 0;
          if (matches) store().delete(serialized);
        }
      }),
    };
  }

  abort() {
    if (this.state !== "active") throw new DOMException("transaction finished", "InvalidStateError");
    this.finish("aborted", new DOMException("AbortError", "AbortError"));
  }

  private scheduleCommit() {
    if (this.commitTimer !== null) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), 0);
  }

  private commit() {
    if (this.state !== "active") return;
    if (this.mode === "readwrite") {
      const failure = this.database.takeCommitFailure();
      if (failure !== undefined) {
        this.finish("aborted", failure);
        return;
      }
      const next = new Map(this.database.stores);
      for (const [name, store] of this.working) next.set(name, store);
      if (this.database.bytes(next) > this.database.quotaBytes) {
        const quota = new DOMException("quota exhausted", "QuotaExceededError");
        this.error = quota;
        this.finish("aborted", quota);
        return;
      }
      this.database.stores = next;
    }
    this.state = "committed";
    this.resolveDone();
  }

  private finish(state: "aborted", reason: unknown) {
    this.state = state;
    if (this.commitTimer !== null) clearTimeout(this.commitTimer);
    this.rejectDone(reason);
  }
}
