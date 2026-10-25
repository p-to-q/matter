/**
 * Synthetic recovery qualification on the browser's real IndexedDB engine.
 * This imports the shipped owners; it is not a second persistence implementation.
 * The runner gives each case a fresh ephemeral browser context and never opens
 * a person's origin. Receipts contain identities and digests, not material bytes.
 */
import { collectPictureBlobs, restorePictureBlobs } from "../features/matter/interaction/archive-pictures";
import { createPictureSessionCache } from "../features/matter/interaction/picture-session-cache";
import { exportSnapshotArchive, importSnapshotArchive } from "../features/matter/persistence/archive-transport";
import { createIndexedDbDocumentRepository } from "../features/matter/persistence/document-repository";
import {
  emptyHistoryJournal, FULL_HISTORY_RETENTION, historyJournalManifest, planHistoryJournalWrite,
} from "../features/matter/persistence/history-journal";
import { attachRecoveredHistory } from "../features/matter/persistence/history-recovery";
import { createImageBlobRepository } from "../features/matter/persistence/image-blob-repository";
import { createIndexedDbInquiryRecordRepository } from "../features/matter/persistence/inquiry-record-repository";
import { createIndexedDbLabelRepository, type LabelRecord } from "../features/matter/persistence/label-repository";
import { createMatterDatabaseHandle, labelKey } from "../features/matter/persistence/matter-database";
import { treeToBundle } from "../features/matter/persistence/snapshot-codec";
import { createIndexedDbWikiRepository } from "../features/matter/persistence/wiki-repository";
import {
  commitTreeCommand, createTreeHistory, MATTER_HISTORY_LIMITS, redoTreeHistory, undoTreeHistory,
  type TreeHistory,
} from "../features/matter/tree/history";
import type { ImagePointer } from "../features/matter/tree/image-pointer";
import { validateThoughtTree } from "../features/matter/tree/invariants";
import type { ThoughtTree, TreeMutation } from "../features/matter/tree/model";
import { sha256Hex } from "../features/matter/tree/sha256";
import { createInitialWikiState } from "../features/matter/wiki/wiki-evidence";
import { encodeWikiStateAsV7 } from "../features/matter/wiki/wiki-codec";

const DATABASE = "ptoq-matter";
const TIME = "2026-10-16T00:00:00.000Z";
const LEGACY_STORES = ["historyEntries", "inquiryRecords", "labels", "snapshots", "wiki"];
const LABELS: readonly LabelRecord[] = [
  { nodeId: "a", label: "Synthetic user", origin: "user", basis: null, updatedAt: TIME },
  { nodeId: "m", label: "Synthetic model", origin: "model", basis: "synthetic-basis", updatedAt: TIME },
];
type Session = Readonly<{ tree: ThoughtTree; history: TreeHistory }>;
type Receipt = Record<string, unknown>;
type PictureFixture = Readonly<{ pointer: ImagePointer; bytes: Uint8Array<ArrayBuffer> }>;
type StoreReadback = Readonly<{ rows: number; digest: string; keysDigest: string; schema: unknown }>;
type Readback = Readonly<{ version: number; digest: string; legacyDigest: string; stores: Record<string, StoreReadback> }>;
let imageSession: Session | undefined;
let images: Readonly<{ available: PictureFixture; missing: PictureFixture; historyOnly: PictureFixture }> | undefined;

function requireProof(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function canonical(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return { arrayBuffer: [...new Uint8Array(value)] };
  if (ArrayBuffer.isView(value)) return { typedArray: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] };
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}

const digest = (value: unknown) => sha256Hex(new TextEncoder().encode(JSON.stringify(canonical(value))));
const request = <T>(pending: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  pending.onsuccess = () => resolve(pending.result);
  pending.onerror = () => reject(pending.error);
});
const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error("TRANSACTION_ABORTED"));
  transaction.onerror = () => reject(transaction.error ?? new Error("TRANSACTION_FAILED"));
});

function baseSession(): Session {
  const tree: ThoughtTree = {
    protocolVersion: "0.2", id: "recovery_fixture", revision: 0, rootId: "root", title: "Synthetic recovery proof",
    nodes: {
      root: { id: "root", role: "document-root", text: "", parentId: null, children: ["a", "m"], createdAt: TIME, updatedAt: TIME },
      a: { id: "a", text: "Synthetic passage zero", parentId: "root", children: [], createdAt: TIME, updatedAt: TIME },
      m: { id: "m", text: "Synthetic second passage", parentId: "root", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
  requireProof(validateThoughtTree(tree).ok, "FIXTURE_TREE_INVALID");
  return { tree, history: createTreeHistory() };
}

function commit(session: Session, id: string, mutation: TreeMutation): Session {
  const result = commitTreeCommand(session.tree, session.history, {
    id, source: "human", expectedTreeId: session.tree.id, expectedRevision: session.tree.revision, createdAt: TIME, mutation,
  }, MATTER_HISTORY_LIMITS);
  requireProof(result.ok, "FIXTURE_COMMAND_REJECTED");
  return result;
}

function textStep(session: Session, id: string): Session {
  return commit(session, id, {
    type: "replace-text", nodeId: "a", expectedText: session.tree.nodes.a!.text,
    expectedUpdatedAt: TIME, text: `Synthetic passage ${id}`, updatedAt: TIME,
  });
}

function undo(session: Session): Session {
  const result = undoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
  requireProof(result.ok, "RECOVERED_UNDO_REFUSED");
  return result;
}

function redo(session: Session): Session {
  const result = redoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
  requireProof(result.ok, "RECOVERED_REDO_REFUSED");
  return result;
}

function legacySession(): Session {
  let session = baseSession();
  for (const id of ["one", "two", "three"]) session = textStep(session, id);
  return undo(session);
}

async function seedV6(): Promise<IDBDatabase> {
  requireProof((await indexedDB.databases()).every(({ name }) => name !== DATABASE), "PROOF_ORIGIN_NOT_FRESH");
  const opening = indexedDB.open(DATABASE, 6);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore("snapshots", { keyPath: "treeId" });
    const labels = db.createObjectStore("labels", { keyPath: "key" });
    labels.createIndex("treeId", "treeId");
    labels.createIndex("originUpdatedAt", ["origin", "updatedAt"]);
    db.createObjectStore("inquiryRecords", { keyPath: "treeId" });
    db.createObjectStore("wiki", { keyPath: "key" });
    db.createObjectStore("historyEntries", { keyPath: ["treeId", "epoch", "stack", "position"] });
  };
  const db = await request(opening);
  const session = legacySession();
  const legacyWiki = encodeWikiStateAsV7(createInitialWikiState());
  requireProof(legacyWiki.ok, "LEGACY_WIKI_FIXTURE_NOT_REPRESENTABLE");
  const journal = planHistoryJournalWrite(session.tree.id, emptyHistoryJournal(3), session.history, FULL_HISTORY_RETENTION);
  requireProof(journal.journal.undo.entries.length > 0 && journal.journal.redo.entries.length > 0, "EMPTY_HISTORY_FIXTURE");
  const tx = db.transaction(LEGACY_STORES, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore("snapshots").put({
    storageSchemaVersion: 1, treeId: session.tree.id, treeRevision: session.tree.revision, writeGeneration: 11,
    bundle: treeToBundle(session.tree), historyJournal: historyJournalManifest(journal.journal, 11, session.tree.revision),
  });
  const other = { ...baseSession().tree, id: "secondary_fixture" };
  tx.objectStore("snapshots").put({
    storageSchemaVersion: 1, treeId: other.id, treeRevision: other.revision, writeGeneration: 7,
    bundle: treeToBundle(other), historyJournal: historyJournalManifest(emptyHistoryJournal(0), 7, other.revision),
  });
  for (const record of journal.records) tx.objectStore("historyEntries").put(record);
  for (const label of LABELS) tx.objectStore("labels").put({
    storageSchemaVersion: 1, key: labelKey(session.tree.id, label.nodeId), treeId: session.tree.id, ...label,
  });
  tx.objectStore("inquiryRecords").put({
    storageSchemaVersion: 1, recordSchemaVersion: 1, treeId: session.tree.id, writeGeneration: 5, recordEpoch: 2,
    exchanges: [{ id: "synthetic_question", askedAt: TIME, question: "Synthetic question?", outcome: { status: "answered", text: "Synthetic answer." },
      basis: { treeId: session.tree.id, revision: session.tree.revision, scope: "tree" } }],
  });
  tx.objectStore("wiki").put({
    storageSchemaVersion: 1, recordSchemaVersion: 7, key: "origin", writeGeneration: 13, state: legacyWiki.state,
  });
  await done;
  return db;
}

async function readback(db: IDBDatabase): Promise<Readback> {
  const names = [...db.objectStoreNames].sort();
  const tx = db.transaction(names, "readonly");
  const done = transactionDone(tx);
  const values = await Promise.all(names.map(async (name) => {
    const store = tx.objectStore(name);
    const schema = { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: [...store.indexNames].map((indexName) => {
      const index = store.index(indexName);
      return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
    }) };
    const [keys, rows] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    return [name, { schema, keys, rows }] as const;
  }));
  await done;
  const all = Object.fromEntries(values);
  const stores = Object.fromEntries(await Promise.all(values.map(async ([name, value]) => [name, {
    rows: value.rows.length, digest: await digest(value), keysDigest: await digest(value.keys), schema: value.schema,
  }])));
  return { version: db.version, digest: await digest(all), legacyDigest: await digest(Object.fromEntries(values.filter(([name]) => name !== "blobs"))), stores };
}

async function storedReadback(): Promise<Readback> {
  const db = await request(indexedDB.open(DATABASE));
  try { return await readback(db); } finally { db.close(); }
}

async function recoveredReplay(expected: Session): Promise<Receipt> {
  const repository = createIndexedDbDocumentRepository();
  try {
    const result = await repository.load(expected.tree.id);
    requireProof(result.ok && result.value !== null, "RECOVERY_LOAD_FAILED");
    const loaded = result.value;
    const attached = attachRecoveredHistory(loaded.tree, loaded.history, MATTER_HISTORY_LIMITS);
    requireProof(!attached.released && !loaded.history.released, "RECOVERY_RELEASED_HISTORY");
    const session = { tree: loaded.tree, history: attached.history };
    requireProof(await digest(session.tree) === await digest(expected.tree), "RECOVERY_TREE_CHANGED");
    requireProof(session.history.entries.length === expected.history.entries.length &&
      session.history.redoEntries.length === expected.history.redoEntries.length, "RECOVERY_STACK_COUNT_CHANGED");
    const undone = undo(session);
    const redone = redo(undone);
    const priorFuture = redo(session);
    const undoDigest = await digest(undone.tree);
    const redoDigest = await digest(redone.tree);
    const originalRedoDigest = await digest(priorFuture.tree);
    requireProof(undoDigest === await digest(undo(expected).tree), "RECOVERY_UNDO_CHANGED");
    requireProof(redoDigest === await digest(redo(undo(expected)).tree), "RECOVERY_REDO_CHANGED");
    requireProof(originalRedoDigest === await digest(redo(expected).tree), "RECOVERY_ORIGINAL_REDO_CHANGED");
    return { loadedTreeDigest: await digest(session.tree), auxiliary: await readAuxiliaryAuthority(expected.tree.id), undoEntries: session.history.entries.length,
      redoEntries: session.history.redoEntries.length, undoDigest, redoDigest, originalRedoDigest };
  } finally { repository.close(); }
}

async function readAuxiliaryAuthority(treeId: string): Promise<Receipt> {
  const labels = createIndexedDbLabelRepository();
  const inquiries = createIndexedDbInquiryRecordRepository();
  const wiki = createIndexedDbWikiRepository();
  try {
    const [names, record, lexical] = await Promise.all([
      labels.loadAll(treeId, ["a", "m"]), inquiries.load(treeId), wiki.load(),
    ]);
    requireProof(await digest(names) === await digest(LABELS), "RECOVERY_LABELS_NOT_READABLE");
    requireProof(record.ok && record.value !== null && record.value.writeGeneration === 5 &&
      record.value.recordEpoch === 2 && record.value.exchanges.length === 1, "RECOVERY_INQUIRY_NOT_READABLE");
    requireProof(lexical.ok && lexical.value !== null && lexical.value.writeGeneration === 13 &&
      await digest(lexical.value.state) === await digest(createInitialWikiState()), "RECOVERY_WIKI_NOT_READABLE");
    return { labelsRead: names.length, labelsDigest: await digest(names), inquiryExchangesRead: record.value.exchanges.length,
      inquiryGeneration: record.value.writeGeneration, inquiryDigest: await digest(record.value),
      wikiGeneration: lexical.value.writeGeneration, wikiDigest: await digest(lexical.value.state) };
  } finally { labels.close(); inquiries.close(); wiki.close(); }
}

function requireUpgrade(before: Readback, after: Readback): void {
  requireProof(after.version === 7 && before.legacyDigest === after.legacyDigest, "UPGRADE_CHANGED_LEGACY_STORES");
  requireProof(JSON.stringify(Object.keys(after.stores)) === JSON.stringify(["blobs", ...LEGACY_STORES]), "UPGRADE_UNEXPECTED_STORES");
  const blobs = after.stores.blobs!;
  requireProof(blobs.rows === 0 && JSON.stringify(blobs.schema) === JSON.stringify({
    keyPath: "contentHash", autoIncrement: false, indexes: [{ name: "storedAt", keyPath: "storedAt", unique: false, multiEntry: false }],
  }), "UPGRADE_BLOB_SCHEMA_CHANGED");
}

async function versionSixUpgrade(): Promise<Receipt> {
  const old = await seedV6();
  const before = await readback(old);
  old.close();
  const handle = createMatterDatabaseHandle();
  try { await handle.open(); } finally { handle.close(); }
  const after = await storedReadback();
  requireUpgrade(before, after);
  const replay = await recoveredReplay(legacySession());
  requireProof((await storedReadback()).digest === after.digest, "RECOVERY_READ_MUTATED_STORAGE");
  return { name: "R1", result: "pass", before, after, replay };
}

async function blockedUpgrade(): Promise<Receipt> {
  const old = await seedV6();
  const before = await readback(old);
  const events: string[] = [];
  let signalBlocked!: () => void;
  const blocked = new Promise<void>((resolve) => { signalBlocked = resolve; });
  const handle = createMatterDatabaseHandle({ waitWhenBlocked: true, onLifecycle(event) {
    events.push(event);
    if (event === "upgrade-blocked") signalBlocked();
  } });
  let completed = 0;
  const opening = handle.open().then((db) => { completed += 1; return db; });
  try {
    await bounded(blocked, "BLOCKED_EVENT_MISSING");
    const whileBlocked = await readback(old);
    requireProof(whileBlocked.version === 6 && whileBlocked.digest === before.digest && completed === 0, "BLOCKED_UPGRADE_MUTATED_STORAGE");
    old.close();
    const db = await bounded(opening, "BLOCKED_UPGRADE_DID_NOT_RESUME");
    requireProof(db.version === 7 && Number(completed) === 1 && JSON.stringify(events) === JSON.stringify(["upgrade-blocked", "upgrade-ready"]), "BLOCKED_UPGRADE_DUPLICATE_TRANSITION");
    const after = await storedReadback();
    requireUpgrade(before, after);
    return { name: "R2", result: "pass", before, whileBlocked, after, events, completions: completed, replay: await recoveredReplay(legacySession()) };
  } finally { old.close(); handle.close(); }
}

async function abortedUpgrade(): Promise<Receipt> {
  const old = await seedV6();
  const before = await readback(old);
  old.close();
  const nativeCreate = IDBDatabase.prototype.createObjectStore;
  let storeCreated = 0;
  let aborted = 0;
  IDBDatabase.prototype.createObjectStore = function (name, options) {
    const store = nativeCreate.call(this, name, options);
    if (name === "blobs") {
      storeCreated += 1;
      queueMicrotask(() => { store.transaction.abort(); aborted += 1; });
    }
    return store;
  };
  const handle = createMatterDatabaseHandle();
  let errorName = "";
  try { await handle.open(); } catch (error) { errorName = error instanceof Error ? error.name : "unknown"; }
  finally { IDBDatabase.prototype.createObjectStore = nativeCreate; handle.close(); }
  requireProof(storeCreated === 1 && aborted === 1 && errorName === "AbortError", "ABORT_INJECTION_NOT_OBSERVED");
  const reverted = await request(indexedDB.open(DATABASE, 6));
  let afterAbort: Readback;
  try { afterAbort = await readback(reverted); } finally { reverted.close(); }
  requireProof(afterAbort.version === 6 && !Object.hasOwn(afterAbort.stores, "blobs") && before.digest === afterAbort.digest, "ABORT_LEFT_PARTIAL_UPGRADE");
  const retry = createMatterDatabaseHandle();
  try { await retry.open(); } finally { retry.close(); }
  const after = await storedReadback();
  requireUpgrade(before, after);
  return { name: "R3", result: "pass", before, afterAbort, after, storeCreated, aborted, errorName, replay: await recoveredReplay(legacySession()) };
}

async function picture(color: string): Promise<PictureFixture> {
  // Canvas creates closed, real PNG fixtures locally; no generator or provider is involved.
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext("2d");
  requireProof(context !== null, "PNG_FIXTURE_UNAVAILABLE");
  context.fillStyle = color;
  context.fillRect(0, 0, 256, 256);
  const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]!), (character) => character.charCodeAt(0));
  return { bytes, pointer: { mediaType: "image/png", byteLength: bytes.byteLength, width: 256, height: 256, contentHash: await sha256Hex(bytes) } };
}

async function pictureBytesReadback(): Promise<Receipt> {
  requireProof(images !== undefined, "IMAGE_FIXTURE_MISSING");
  const handle = createMatterDatabaseHandle();
  const repository = createImageBlobRepository(handle);
  try {
    const hashes = [];
    for (const image of [images.available, images.historyOnly]) {
      const loaded = await repository.getImageBlob(image.pointer.contentHash);
      requireProof(loaded.ok && loaded.value.status === "found", "IMAGE_BYTES_UNAVAILABLE");
      requireProof(await sha256Hex(loaded.value.blob.bytes) === image.pointer.contentHash &&
        await digest(loaded.value.blob.bytes) === await digest(image.bytes.buffer), "IMAGE_BYTES_CHANGED");
      hashes.push(image.pointer.contentHash);
    }
    const missing = await repository.getImageBlob(images.missing.pointer.contentHash);
    requireProof(missing.ok && missing.value.status === "absent", "MISSING_FIXTURE_BECAME_AVAILABLE");
    return { presentHashes: hashes.sort(), missingHashes: [images.missing.pointer.contentHash], historyOnlyHash: images.historyOnly.pointer.contentHash };
  } finally { handle.close(); }
}

async function olderBuildRefusal(): Promise<Receipt> {
  const old = await seedV6(); old.close();
  images = { available: await picture("#2f557a"), missing: await picture("#8d592b"), historyOnly: await picture("#5c794d") };
  const initial = baseSession();
  const tree: ThoughtTree = { ...initial.tree, nodes: {
    ...initial.tree.nodes, a: { ...initial.tree.nodes.a!, image: images.historyOnly.pointer },
    m: { ...initial.tree.nodes.m!, image: images.missing.pointer },
  } };
  let session = commit({ tree, history: createTreeHistory() }, "replace_picture", {
    type: "replace-image", nodeId: "a", expectedUpdatedAt: TIME, expectedImage: images.historyOnly.pointer, image: images.available.pointer,
  });
  session = undo(textStep(session, "future_text"));
  imageSession = session;
  const handle = createMatterDatabaseHandle();
  const blobs = createImageBlobRepository(handle);
  const documents = createIndexedDbDocumentRepository();
  try {
    for (const image of [images.available, images.historyOnly]) requireProof((await blobs.putImageBlob(image.pointer, image.bytes.buffer)).ok, "IMAGE_FIXTURE_PUT_FAILED");
    const loaded = await documents.load(session.tree.id);
    requireProof(loaded.ok && loaded.value !== null, "IMAGE_FIXTURE_BASE_LOAD_FAILED");
    const saved = await documents.save({ treeId: session.tree.id, treeRevision: session.tree.revision, bundle: treeToBundle(session.tree),
      basis: loaded.value.basis, history: session.history, retention: FULL_HISTORY_RETENTION });
    requireProof(saved.ok, "IMAGE_FIXTURE_SAVE_FAILED");
  } finally { documents.close(); handle.close(); }
  const before = await storedReadback();
  let refused = "";
  let successfulConnections = 0;
  try { const db = await request(indexedDB.open(DATABASE, 6)); successfulConnections += 1; db.close(); }
  catch (error) { refused = error instanceof Error ? error.name : "unknown"; }
  requireProof(refused === "VersionError" && successfulConnections === 0, "OLD_BUILD_OPENED_DB7");
  const after = await storedReadback();
  requireProof(after.version === 7 && before.digest === after.digest, "OLD_BUILD_REFUSAL_CHANGED_DB7");
  const replay = await recoveredReplay(session);
  requireProof(undo(session).tree.nodes.a!.image?.contentHash === images.historyOnly.pointer.contentHash, "HISTORY_ONLY_IMAGE_NOT_REPLAYED");
  return { name: "R4", result: "pass", before, after, refused, successfulConnections, replay, images: await pictureBytesReadback() };
}

async function exportRecoveryArchive(): Promise<{ receipt: Receipt; archive: number[]; expectedTreeDigest: string; expectedImages: Receipt }> {
  requireProof(imageSession !== undefined && images !== undefined, "R4_REQUIRED_BEFORE_R5");
  const before = await storedReadback();
  const documents = createIndexedDbDocumentRepository();
  const handle = createMatterDatabaseHandle();
  try {
    const loaded = await documents.load(imageSession.tree.id);
    requireProof(loaded.ok && loaded.value !== null, "RECOVERY_EXPORT_LOAD_FAILED");
    const attached = attachRecoveredHistory(loaded.value.tree, loaded.value.history, MATTER_HISTORY_LIMITS);
    requireProof(!attached.released && attached.history.entries.length > 0 && attached.history.redoEntries.length > 0, "RECOVERY_EXPORT_HISTORY_LOST");
    const blobs = await collectPictureBlobs(loaded.value.tree, { repository: createImageBlobRepository(handle), cache: createPictureSessionCache() });
    const exported = await exportSnapshotArchive(treeToBundle(loaded.value.tree), blobs);
    requireProof(exported.ok && exported.missingImages === 1 && blobs.size === 1, "RECOVERY_EXPORT_COUNTS_WRONG");
    const parsed = await importSnapshotArchive(exported.bytes);
    requireProof(parsed.ok && parsed.blobs.size === 1 && parsed.blobs.has(images.available.pointer.contentHash) &&
      !parsed.blobs.has(images.historyOnly.pointer.contentHash), "RECOVERY_EXPORT_IMAGE_SET_WRONG");
    requireProof(await digest(parsed.tree) === await digest(imageSession.tree), "RECOVERY_EXPORT_TREE_CHANGED");
    const after = await storedReadback();
    requireProof(before.digest === after.digest, "RECOVERY_EXPORT_MUTATED_SOURCE");
    return { receipt: { name: "R5-export", result: "pass", before, after, artifactKind: "source-bundled-product-owners",
      imageGeneration: "absent", referencedImagesExported: parsed.blobs.size, missingImages: exported.missingImages,
      archiveBytes: exported.bytes.byteLength, archiveSha256: await sha256Hex(exported.bytes),
      historyOnlyExcluded: true, replay: await recoveredReplay(imageSession) },
      archive: [...exported.bytes], expectedTreeDigest: await digest(imageSession.tree),
      expectedImages: { available: images.available.pointer.contentHash, missing: images.missing.pointer.contentHash,
        historyOnly: images.historyOnly.pointer.contentHash, bytesDigest: await digest(images.available.bytes.buffer) } };
  } finally { documents.close(); handle.close(); }
}

async function importRecoveryArchive(input: { archive: number[]; expectedTreeDigest: string; expectedImages: Receipt }): Promise<Receipt> {
  requireProof((await indexedDB.databases()).every(({ name }) => name !== DATABASE), "IMPORT_ORIGIN_NOT_FRESH");
  const parsed = await importSnapshotArchive(new Uint8Array(input.archive));
  requireProof(parsed.ok && parsed.blobs.size === 1, "RECOVERY_IMPORT_PARSE_FAILED");
  const handle = createMatterDatabaseHandle();
  const repository = createImageBlobRepository(handle);
  const documents = createIndexedDbDocumentRepository();
  try {
    const restored = await restorePictureBlobs(parsed.blobs, parsed.tree, { repository, cache: createPictureSessionCache() });
    requireProof(restored !== null, "RECOVERY_IMPORT_BYTES_REFUSED");
    requireProof(restored.saved === 1 && restored.keptInSession === 0, "RECOVERY_IMPORT_BYTES_NOT_DURABLE");
    const reserved = await documents.reserveImportedSnapshot(parsed.tree.id, parsed.tree.revision, parsed.bundle, null);
    requireProof(reserved.ok, "RECOVERY_IMPORT_RESERVATION_FAILED");
    const loaded = await documents.load(parsed.tree.id);
    requireProof(loaded.ok && loaded.value !== null && await digest(loaded.value.tree) === input.expectedTreeDigest, "RECOVERY_IMPORT_TREE_CHANGED");
    const attached = attachRecoveredHistory(loaded.value.tree, loaded.value.history, MATTER_HISTORY_LIMITS);
    requireProof(!attached.released && attached.history.entries.length === 0 && attached.history.redoEntries.length === 0, "ARCHIVE_IMPORT_HISTORY_NOT_EMPTY");
    const available = await repository.getImageBlob(input.expectedImages.available as string);
    requireProof(available.ok && available.value.status === "found" &&
      await digest(available.value.blob.bytes) === input.expectedImages.bytesDigest, "RECOVERY_IMPORT_BYTES_CHANGED");
    for (const key of ["missing", "historyOnly"]) {
      const absent = await repository.getImageBlob(input.expectedImages[key] as string);
      requireProof(absent.ok && absent.value.status === "absent", "RECOVERY_IMPORT_UNEXPECTED_BLOB");
    }
    return { name: "R5-import", result: "pass", freshDatabase: true, treeDigest: await digest(loaded.value.tree),
      restored, importedHashes: [...parsed.blobs.keys()], historyBoundaryEmpty: true, readback: await storedReadback() };
  } finally { documents.close(); handle.close(); }
}

function bounded<T>(pending: Promise<T>, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(code)), 10_000);
    pending.then((result) => { clearTimeout(timeout); resolve(result); }, (error) => { clearTimeout(timeout); reject(error); });
  });
}

declare global {
  interface Window {
    __matterRecoveryProof: {
      R1: typeof versionSixUpgrade; R2: typeof blockedUpgrade; R3: typeof abortedUpgrade; R4: typeof olderBuildRefusal;
      exportArchive: typeof exportRecoveryArchive; importArchive: typeof importRecoveryArchive;
    };
  }
}

window.__matterRecoveryProof = { R1: versionSixUpgrade, R2: blockedUpgrade, R3: abortedUpgrade, R4: olderBuildRefusal,
  exportArchive: exportRecoveryArchive, importArchive: importRecoveryArchive };
