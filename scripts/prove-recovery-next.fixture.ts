/** Node-only fixture/oracle code. The Next qualification never serves this bundle. */
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { unzipSync } from "fflate";
import { materialFilesCopy } from "../features/matter/components/material-files-copy";
import { toolRailCopy } from "../features/matter/components/tool-rail-copy";
import { importSnapshotArchive } from "../features/matter/persistence/archive-transport";
import {
  assembleHistoryJournal, emptyHistoryJournal, FULL_HISTORY_RETENTION,
  historyJournalManifest, planHistoryJournalWrite, readHistoryManifest,
  type StoredHistoryEntry,
} from "../features/matter/persistence/history-journal";
import { attachRecoveredHistory } from "../features/matter/persistence/history-recovery";
import { labelKey, type StoredSnapshot } from "../features/matter/persistence/matter-database";
import { bundleToTree, treeToBundle } from "../features/matter/persistence/snapshot-codec";
import {
  commitTreeCommand, createTreeHistory, MATTER_HISTORY_LIMITS, redoTreeHistory, undoTreeHistory,
  type TreeHistory,
} from "../features/matter/tree/history";
import type { ImagePointer } from "../features/matter/tree/image-pointer";
import { validateThoughtTree } from "../features/matter/tree/invariants";
import type { ThoughtTree, TreeMutation } from "../features/matter/tree/model";
import { createInitialWikiState } from "../features/matter/wiki/wiki-evidence";
import { encodeWikiStateAsV7 } from "../features/matter/wiki/wiki-codec";

const TIME = "2026-10-16T00:00:00.000Z";
type Session = Readonly<{ tree: ThoughtTree; history: TreeHistory }>;
type Picture = Readonly<{ pointer: ImagePointer; bytes: readonly number[] }>;

function requireFixture(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function base(treeId: string): Session {
  const tree: ThoughtTree = {
    protocolVersion: "0.2", id: treeId, revision: 0, rootId: "recovery_root", title: "Synthetic Next recovery",
    nodes: {
      recovery_root: { id: "recovery_root", role: "document-root", text: "", parentId: null, children: ["a", "m"], createdAt: TIME, updatedAt: TIME },
      a: { id: "a", text: "Synthetic passage zero", parentId: "recovery_root", children: [], createdAt: TIME, updatedAt: TIME },
      m: { id: "m", text: "Synthetic second passage", parentId: "recovery_root", children: [], createdAt: TIME, updatedAt: TIME },
    },
  };
  requireFixture(validateThoughtTree(tree).ok, "INVALID_NEXT_FIXTURE");
  return { tree, history: createTreeHistory() };
}

function commit(session: Session, id: string, mutation: TreeMutation): Session {
  const result = commitTreeCommand(session.tree, session.history, {
    id, source: "human", expectedTreeId: session.tree.id, expectedRevision: session.tree.revision, createdAt: TIME, mutation,
  }, MATTER_HISTORY_LIMITS);
  requireFixture(result.ok, "NEXT_FIXTURE_COMMAND_REFUSED");
  return result;
}

function text(session: Session, id: string): Session {
  return commit(session, id, {
    type: "replace-text", nodeId: "a", expectedText: session.tree.nodes.a!.text, expectedUpdatedAt: TIME,
    text: `Synthetic passage ${id}`, updatedAt: TIME,
  });
}

function undo(session: Session): Session {
  const result = undoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
  requireFixture(result.ok, "NEXT_FIXTURE_UNDO_REFUSED");
  return result;
}

function redo(session: Session): Session {
  const result = redoTreeHistory(session.tree, session.history, MATTER_HISTORY_LIMITS);
  requireFixture(result.ok, "NEXT_FIXTURE_REDO_REFUSED");
  return result;
}

function picture(channel: number): Picture {
  const width = 256;
  const height = 256;
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name, "ascii"), data]);
    const frame = Buffer.alloc(data.length + 12);
    frame.writeUInt32BE(data.length);
    body.copy(frame, 4);
    frame.writeUInt32BE(crc32(body), data.length + 8);
    return frame;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * (1 + width * 3) + 1 + column * 3;
      scanlines[index] = channel;
      scanlines[index + 1] = 80;
      scanlines[index + 2] = 130;
    }
  }
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0)),
  ]);
  return {
    bytes: [...bytes],
    pointer: { mediaType: "image/png", byteLength: bytes.length, width, height, contentHash: createHash("sha256").update(bytes).digest("hex") },
  };
}

function rows(session: Session, secondary: ThoughtTree, pictures: readonly Picture[] = []) {
  const journal = planHistoryJournalWrite(session.tree.id, emptyHistoryJournal(3), session.history, FULL_HISTORY_RETENTION);
  const wiki = encodeWikiStateAsV7(createInitialWikiState());
  requireFixture(wiki.ok && wiki.state.schemaVersion === 7, "NEXT_LEGACY_WIKI_NOT_REPRESENTABLE");
  return {
    snapshots: [{
      storageSchemaVersion: Object.values(session.tree.nodes).some((node) => node.image !== undefined) ? 2 : 1,
      treeId: session.tree.id, treeRevision: session.tree.revision, writeGeneration: 11,
      bundle: treeToBundle(session.tree), historyJournal: historyJournalManifest(journal.journal, 11, session.tree.revision),
    }, {
      storageSchemaVersion: 1, treeId: secondary.id, treeRevision: secondary.revision, writeGeneration: 7,
      bundle: treeToBundle(secondary), historyJournal: historyJournalManifest(emptyHistoryJournal(0), 7, secondary.revision),
    }],
    historyEntries: journal.records,
    labels: [
      { nodeId: "a", label: "Synthetic manual", origin: "user", basis: null },
      { nodeId: "m", label: "Synthetic model", origin: "model", basis: "synthetic-basis" },
    ].map((record) => ({ storageSchemaVersion: 1, key: labelKey(session.tree.id, record.nodeId), treeId: session.tree.id, ...record, updatedAt: TIME })),
    inquiryRecords: [{
      storageSchemaVersion: 1, recordSchemaVersion: 1, treeId: session.tree.id, writeGeneration: 5, recordEpoch: 2,
      exchanges: [{ id: "synthetic_question", askedAt: TIME, question: "Synthetic question?", outcome: { status: "answered", text: "Synthetic answer." }, basis: { treeId: session.tree.id, revision: session.tree.revision, scope: "tree" } }],
    }],
    wiki: [{ storageSchemaVersion: 1, recordSchemaVersion: 7, key: "origin", writeGeneration: 13, state: wiki.state }],
    blobs: pictures.map(({ pointer, bytes }) => ({ storageSchemaVersion: 1, ...pointer, bytes, storedAt: TIME })),
  };
}

export function createNextRecoveryFixture(treeId: string) {
  requireFixture(/^[A-Za-z0-9_-]+$/u.test(treeId), "NEXT_FIXTURE_ID_INVALID");
  let legacy = base(treeId);
  for (const id of ["one", "two", "three"]) legacy = text(legacy, id);
  legacy = undo(legacy);
  const available = picture(40);
  const missing = picture(80);
  const historyOnly = picture(120);
  const initial = base(treeId);
  const imageTree: ThoughtTree = { ...initial.tree, nodes: {
    ...initial.tree.nodes,
    a: { ...initial.tree.nodes.a!, image: historyOnly.pointer },
    m: { ...initial.tree.nodes.m!, image: missing.pointer },
  } };
  let image = commit({ tree: imageTree, history: createTreeHistory() }, "replace_picture", {
    type: "replace-image", nodeId: "a", expectedUpdatedAt: TIME, expectedImage: historyOnly.pointer, image: available.pointer,
  });
  image = undo(text(image, "future_text"));
  const secondary = base("secondary_next_fixture").tree;
  const expectation = (session: Session) => ({ current: session.tree, undone: undo(session).tree, replayed: redo(undo(session)).tree });
  return {
    treeId,
    copy: { files: materialFilesCopy("en-US"), rail: toolRailCopy("en-US") },
    legacy: { rows: rows(legacy, secondary), ...expectation(legacy) },
    image: { rows: rows(image, secondary, [available, historyOnly]), ...expectation(image), available, missing, historyOnly },
  };
}

export function inspectNextSnapshot(row: StoredSnapshot, records: readonly StoredHistoryEntry[]) {
  const decoded = bundleToTree(row.bundle);
  requireFixture(decoded.ok, "NEXT_STORED_TREE_INVALID");
  const manifest = readHistoryManifest(row);
  requireFixture(manifest.status === "journal", "NEXT_STORED_MANIFEST_INVALID");
  const stack = (name: "undo" | "redo") => records
    .filter((entry) => entry.treeId === row.treeId && entry.epoch === manifest.manifest.epoch && entry.stack === name && entry.position >= manifest.manifest[name][0] && entry.position < manifest.manifest[name][1])
    .sort((left, right) => left.position - right.position);
  const assembled = assembleHistoryJournal(row.treeId, manifest.manifest, stack("undo"), stack("redo"), MATTER_HISTORY_LIMITS);
  const attached = attachRecoveredHistory(decoded.tree, assembled.recovered, MATTER_HISTORY_LIMITS);
  requireFixture(!attached.released, "NEXT_STORED_HISTORY_RELEASED");
  return { tree: decoded.tree, undo: attached.history.entries.length, redo: attached.history.redoEntries.length };
}

export async function inspectNextArchive(bytes: Uint8Array) {
  const imported = await importSnapshotArchive(bytes);
  requireFixture(imported.ok, "NEXT_DOWNLOADED_ARCHIVE_INVALID");
  return {
    tree: imported.tree,
    blobPaths: Object.keys(unzipSync(bytes)).filter((name) => name.startsWith("matter/blobs/")).sort(),
    blobs: [...imported.blobs].map(([contentHash, value]) => ({ contentHash, bytes: [...value] })),
  };
}
