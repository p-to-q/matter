/**
 * Runs inside headless Chromium (see `prove-persistence-indexeddb.mjs`) against
 * the real IndexedDB engine: the repository, journal, and controller exactly
 * as the product bundles them, with no test double beneath them.
 */
import { createIndexedDbDocumentRepository, type SnapshotBasis } from "../features/matter/persistence/document-repository";
import { createSeededDocument } from "../features/matter/material/seeded-document";
import {
  commitTreeCommand,
  createTreeHistory,
  MATTER_HISTORY_LIMITS,
  redoTreeHistory,
  undoTreeHistory,
  type TreeHistory,
} from "../features/matter/tree/history";
import { treeToBundle } from "../features/matter/persistence/snapshot-codec";
import {
  emptyHistoryJournal,
  FULL_HISTORY_RETENTION,
  shedHistoryRetention,
  type HistoryRetention,
} from "../features/matter/persistence/history-journal";
import { createPersistenceController } from "../features/matter/persistence/persistence-controller";
import { attachRecoveredHistory } from "../features/matter/persistence/history-recovery";
import type { ThoughtTree, TreeCommand } from "../features/matter/tree/model";

type Session = Readonly<{ tree: ThoughtTree; history: TreeHistory }>;
type Row = Record<string, unknown> & {
  treeId: string;
  historyJournal: { epoch: number; undo: [number, number]; redo: [number, number] };
};
type StoredRecord = { treeId: string; epoch: number; stack: string; position: number; commandId: string };

const TIME = "2026-09-29T00:00:00.000Z";
const DATABASE = "ptoq-matter";
const UNKNOWN: SnapshotBasis = Object.freeze({ writeGeneration: null, journal: emptyHistoryJournal(0) });

declare global {
  interface Window {
    __proveJournal: () => Promise<Record<string, unknown>>;
    __proveQuota: (expectation: "shed" | "full") => Promise<Record<string, unknown>>;
  }
}

function commitStep(session: Session, id: string, textSize = 40): Session {
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
      text: `${id} ${"x".repeat(textSize)}`.slice(0, 1_990),
      updatedAt: TIME,
    },
  };
  const result = commitTreeCommand(session.tree, session.history, command, MATTER_HISTORY_LIMITS);
  if (!result.ok) throw new Error(result.error.code);
  return result;
}

function save(
  repository: ReturnType<typeof createIndexedDbDocumentRepository>,
  session: Session,
  basis: SnapshotBasis,
  retention: HistoryRetention = FULL_HISTORY_RETENTION,
) {
  return repository.save({
    treeId: session.tree.id,
    treeRevision: session.tree.revision,
    bundle: treeToBundle(session.tree),
    basis,
    history: session.history,
    retention,
  });
}

function request<Value>(pending: IDBRequest<Value>): Promise<Value> {
  return new Promise((resolve, reject) => {
    pending.onsuccess = () => resolve(pending.result);
    pending.onerror = () => reject(pending.error);
  });
}

async function readAll(): Promise<{ rows: Row[]; records: StoredRecord[] }> {
  const database = await request(indexedDB.open(DATABASE));
  const transaction = database.transaction(["snapshots", "historyEntries"], "readonly");
  const rows = await request(transaction.objectStore("snapshots").getAll()) as Row[];
  const records = await request(transaction.objectStore("historyEntries").getAll()) as StoredRecord[];
  database.close();
  return { rows, records };
}

function manifestKeys(row: Row): string[] {
  const keys: string[] = [];
  for (const stack of ["redo", "undo"] as const) {
    const [first, end] = row.historyJournal[stack];
    for (let position = first; position < end; position += 1) {
      keys.push(`${row.treeId}/${row.historyJournal.epoch}/${stack}/${position}`);
    }
  }
  return keys.sort();
}

function recordKeys(records: readonly StoredRecord[]): string[] {
  return records.map((record) => `${record.treeId}/${record.epoch}/${record.stack}/${record.position}`).sort();
}

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(DATABASE);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error);
    deletion.onblocked = () => reject(new Error("deletion blocked"));
  });
}

async function randomRoundTrip(): Promise<unknown> {
  await deleteDatabase();
  const repository = createIndexedDbDocumentRepository();
  let session: Session = { tree: createSeededDocument().tree, history: createTreeHistory() };
  let basis = UNKNOWN;
  let retention: HistoryRetention = FULL_HISTORY_RETENTION;
  let seed = 7;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  try {
    for (let operation = 0; operation < 400; operation += 1) {
      const roll = random();
      if (roll < 0.55) session = commitStep(session, `c${operation}`);
      else if (roll < 0.75) {
        const undone = undoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
        if (undone.ok) session = undone;
      } else if (roll < 0.95) {
        const redone = redoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
        if (redone.ok) session = redone;
      } else {
        retention = shedHistoryRetention(session.history, retention) ?? retention;
      }
      if (random() >= 0.3) continue;
      const saved = await save(repository, session, basis, retention);
      if (!saved.ok) return { operation, saved: saved.error.code };
      basis = saved.value;
      const stored = await readAll();
      const expected = manifestKeys(stored.rows[0]!);
      const actual = recordKeys(stored.records);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) return { operation, expected, actual };
      const loaded = await repository.load(session.tree.id);
      if (!loaded.ok || loaded.value === null) return { operation, loaded };
      const attached = attachRecoveredHistory(loaded.value.tree, loaded.value.history, MATTER_HISTORY_LIMITS);
      const durable = basis.journal.undo.entries.map(({ commandId }) => commandId);
      if (attached.released || JSON.stringify(attached.history.entries.map(({ commandId }) => commandId)) !== JSON.stringify(durable)) {
        return { operation, released: attached.released };
      }
    }
    return null;
  } finally {
    repository.close();
  }
}

async function twoConnectionRace(): Promise<unknown> {
  await deleteDatabase();
  const first = createIndexedDbDocumentRepository();
  const second = createIndexedDbDocumentRepository();
  try {
    const base = commitStep({ tree: createSeededDocument().tree, history: createTreeHistory() }, "base");
    const created = await save(first, base, UNKNOWN);
    if (!created.ok) return { created: created.error.code };
    const loaded = await second.load(base.tree.id);
    if (!loaded.ok || loaded.value === null) return { loaded };
    let fromFirst: Session = base;
    let fromSecond: Session = base;
    for (let step = 0; step < 30; step += 1) {
      fromFirst = commitStep(fromFirst, `a${step}`);
      fromSecond = commitStep(fromSecond, `b${step}`);
    }
    const [a, b] = await Promise.all([
      save(first, fromFirst, created.value),
      save(second, fromSecond, loaded.value.basis),
    ]);
    const stored = await readAll();
    const winner = a.ok ? "a" : "b";
    const undoIds = stored.records.filter(({ stack }) => stack === "undo").map(({ commandId }) => commandId);
    const exactlyOne = [a.ok, b.ok].filter(Boolean).length === 1;
    const loserConflicted = (a.ok ? b : a).ok === false &&
      !(a.ok ? b : a).ok && ((a.ok ? b : a) as { error: { code: string } }).error.code === "PERSISTENCE_CONFLICT";
    const consistent = JSON.stringify(manifestKeys(stored.rows[0]!)) === JSON.stringify(recordKeys(stored.records)) &&
      undoIds.every((id) => id === "base" || id.startsWith(winner));
    return exactlyOne && loserConflicted && consistent ? null : { a: a.ok, b: b.ok, undoIds: undoIds.slice(0, 3) };
  } finally {
    first.close();
    second.close();
  }
}

async function throwingPutAbortsAll(): Promise<unknown> {
  await deleteDatabase();
  const repository = createIndexedDbDocumentRepository();
  try {
    const first = commitStep({ tree: createSeededDocument().tree, history: createTreeHistory() }, "first");
    const created = await save(repository, first, UNKNOWN);
    if (!created.ok) return { created: created.error.code };
    const before = JSON.stringify(await readAll());
    const next = commitStep(first, "second");
    // A function cannot be structured-cloned: the record put throws while issued.
    const poisoned: TreeHistory = {
      ...next.history,
      entries: [
        next.history.entries[0]!,
        { ...next.history.entries[1]!, inverse: { ...next.history.entries[1]!.inverse, poison: () => 1 } as never },
      ],
    };
    const result = await save(repository, { tree: next.tree, history: poisoned }, created.value);
    const after = JSON.stringify(await readAll());
    return !result.ok && before === after ? null : { result, unchanged: before === after };
  } finally {
    repository.close();
  }
}

async function versionFiveUpgrade(): Promise<unknown> {
  await deleteDatabase();
  let legacy: Session = { tree: createSeededDocument().tree, history: createTreeHistory() };
  for (let step = 0; step < 5; step += 1) legacy = commitStep(legacy, `legacy_${step}`);
  const v5 = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 5);
    opening.onupgradeneeded = () => {
      const database = opening.result;
      database.createObjectStore("snapshots", { keyPath: "treeId" });
      const labels = database.createObjectStore("labels", { keyPath: "key" });
      labels.createIndex("treeId", "treeId");
      labels.createIndex("originUpdatedAt", ["origin", "updatedAt"]);
      database.createObjectStore("inquiryRecords", { keyPath: "treeId" });
      database.createObjectStore("wiki", { keyPath: "key" });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  const seeding = v5.transaction(["snapshots", "labels", "inquiryRecords", "wiki"], "readwrite");
  seeding.objectStore("snapshots").put({
    storageSchemaVersion: 1,
    treeId: legacy.tree.id,
    treeRevision: legacy.tree.revision,
    writeGeneration: 9,
    bundle: treeToBundle(legacy.tree),
    history: JSON.parse(JSON.stringify(legacy.history)),
  });
  seeding.objectStore("labels").put({
    storageSchemaVersion: 1, key: "t n", treeId: "t", nodeId: "n", label: "L", origin: "user", basis: null, updatedAt: TIME,
  });
  seeding.objectStore("inquiryRecords").put({
    storageSchemaVersion: 1, recordSchemaVersion: 1, treeId: "t", writeGeneration: 1, exchanges: [],
  });
  seeding.objectStore("wiki").put({
    storageSchemaVersion: 1, recordSchemaVersion: 6, key: "origin", writeGeneration: 3, state: {},
  });
  await new Promise((resolve) => {
    seeding.oncomplete = resolve;
  });
  v5.close();

  const repository = createIndexedDbDocumentRepository();
  let migrated = false;
  try {
    const loaded = await repository.load(legacy.tree.id);
    if (!loaded.ok || loaded.value === null || loaded.value.history.released) return { loaded };
    const attached = attachRecoveredHistory(loaded.value.tree, loaded.value.history, MATTER_HISTORY_LIMITS);
    const next = commitStep({ tree: loaded.value.tree, history: attached.history }, "after");
    const saved = await save(repository, next, loaded.value.basis);
    const stored = await readAll();
    migrated = saved.ok && stored.records.length === 6 && !("history" in stored.rows[0]!);
  } finally {
    repository.close();
  }
  const database = await request(indexedDB.open(DATABASE));
  const others = database.transaction(["labels", "inquiryRecords", "wiki"], "readonly");
  const label = await request(others.objectStore("labels").get("t n")) as { label?: string } | undefined;
  const inquiry = await request(others.objectStore("inquiryRecords").get("t")) as { writeGeneration?: number } | undefined;
  const wiki = await request(others.objectStore("wiki").get("origin")) as { writeGeneration?: number } | undefined;
  const version = database.version;
  database.close();
  const preserved = label?.label === "L" && inquiry?.writeGeneration === 1 && wiki?.writeGeneration === 3;
  return migrated && version === 6 && preserved ? null : { migrated, version, preserved };
}

async function olderBuildRefused(): Promise<unknown> {
  const outcome = await new Promise<string>((resolve) => {
    const opening = indexedDB.open(DATABASE, 5);
    opening.onsuccess = () => {
      opening.result.close();
      resolve("opened");
    };
    opening.onerror = () => resolve(opening.error?.name ?? "unknown");
  });
  return outcome === "VersionError" ? null : outcome;
}

window.__proveJournal = async () => {
  const checks: Record<string, unknown> = {};
  for (const [name, check] of [
    ["randomRoundTripExactCompaction", randomRoundTrip],
    ["twoConnectionRace", twoConnectionRace],
    ["throwingPutAbortsWholeWrite", throwingPutAbortsAll],
    ["versionFiveUpgradePreservesStores", versionFiveUpgrade],
    ["olderBuildRefusedWithVersionError", olderBuildRefused],
  ] as const) {
    const failure = await check();
    checks[name] = failure === null ? "pass" : { fail: failure };
  }
  return checks;
};

window.__proveQuota = async (expectation) => {
  await deleteDatabase();
  let session: Session = { tree: createSeededDocument().tree, history: createTreeHistory() };
  for (let step = 0; step < 400; step += 1) session = commitStep(session, `q${step}`, 1_900);
  const controller = createPersistenceController(createIndexedDbDocumentRepository());
  try {
    await controller.start(session.tree, session.history);
    const started = performance.now();
    while (performance.now() - started < 20_000) {
      const { phase } = controller.getStatus();
      if (phase === "saved" || phase === "error") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const status = controller.getStatus();
    const stored = await readAll();
    const pass = expectation === "shed"
      ? status.phase === "saved" && status.historyNotice === "released" &&
        stored.rows.length === 1 && stored.records.length < session.history.entries.length
      : status.phase === "error" && status.errorCode === "PERSISTENCE_STORAGE_FULL" && stored.rows.length === 0;
    return {
      result: pass ? "pass" : "fail",
      phase: status.phase,
      errorCode: status.errorCode,
      historyNotice: status.historyNotice,
      rows: stored.rows.length,
      records: stored.records.length,
      undoInMemory: session.history.entries.length,
    };
  } finally {
    controller.dispose();
  }
};
