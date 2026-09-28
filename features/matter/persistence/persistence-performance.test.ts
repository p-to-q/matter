import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createPerformanceThoughtTree } from "../material/seeded-document";
import {
  canReplayTreeHistory,
  commitTreeCommand,
  createTreeHistory,
  MATTER_HISTORY_LIMITS,
} from "../tree/history";
import { validateThoughtTree } from "../tree/invariants";
import {
  assembleHistoryJournal,
  emptyHistoryJournal,
  FULL_HISTORY_RETENTION,
  historyJournalManifest,
  planHistoryJournalWrite,
} from "./history-journal";
import { attachRecoveredHistory } from "./history-recovery";
import { bundleToTree, treeToBundle } from "./snapshot-codec";
import { allocateSnapshotPaths } from "./snapshot-paths";

const enabled = process.env.MATTER_PERSISTENCE_BENCHMARK === "1";

describe.skipIf(!enabled)("persistence performance receipt", () => {
  it("measures one maximum supported document through every synchronous storage boundary", {
    timeout: 120_000,
  }, () => {
    const realistic = createPerformanceThoughtTree();
    const maximumText = {
      ...realistic,
      nodes: Object.fromEntries(Object.entries(realistic.nodes).map(([id, node]) => [
        id,
        { ...node, text: "界".repeat(2_000) },
      ])),
    };
    const receipt = {
      realistic: measureProfile(realistic, 12),
      maximumText: measureProfile(maximumText, 5),
    };

    expect(receipt.realistic.nodeCount).toBe(2_000);
    expect(receipt.maximumText.nodeCount).toBe(2_000);
    console.log(JSON.stringify(receipt));
  });

  it("measures bounded journal recovery against the whole-journal replay it replaced", {
    timeout: 300_000,
  }, () => {
    let session = { tree: createPerformanceThoughtTree(), history: createTreeHistory() };
    const ids = Object.keys(session.tree.nodes);
    // 1,050 commits so the product bound has released the oldest 50.
    for (let step = 0; step < 1_050; step += 1) {
      const node = session.tree.nodes[ids[step % ids.length]!]!;
      const committed = commitTreeCommand(session.tree, session.history, {
        id: `bench_${step}`,
        source: "human",
        expectedTreeId: session.tree.id,
        expectedRevision: session.tree.revision,
        createdAt: node.updatedAt,
        mutation: {
          type: "replace-text",
          nodeId: node.id,
          expectedText: node.text,
          expectedUpdatedAt: node.updatedAt,
          text: `${node.text.slice(0, 200)} ${step}`,
          updatedAt: node.updatedAt,
        },
      }, MATTER_HISTORY_LIMITS);
      if (!committed.ok) throw new Error(committed.error.code);
      session = committed;
    }
    const written = planHistoryJournalWrite(
      session.tree.id,
      emptyHistoryJournal(0),
      session.history,
      FULL_HISTORY_RETENTION,
    );
    const manifest = historyJournalManifest(written.journal, 1, session.tree.revision);
    // IndexedDB returns structured clones, never the written objects.
    const records = structuredClone([...written.records]);
    const next = planHistoryJournalWrite(session.tree.id, written.journal, session.history, FULL_HISTORY_RETENTION);

    const receipt = {
      entries: session.history.entries.length,
      retainedInverseBytes: session.history.retainedInverseBytes,
      recover: measure(5, () => attachRecoveredHistory(
        session.tree,
        assembleHistoryJournal(session.tree.id, manifest, records, [], MATTER_HISTORY_LIMITS).recovered,
        MATTER_HISTORY_LIMITS,
      )),
      unchangedSavePlan: measure(12, () => planHistoryJournalWrite(
        session.tree.id,
        written.journal,
        session.history,
        FULL_HISTORY_RETENTION,
      )),
      unchangedSaveRecords: next.records.length,
      wholeJournalReplay: measure(1, () => canReplayTreeHistory(session.tree, session.history)),
    };

    expect(receipt.entries).toBe(MATTER_HISTORY_LIMITS.maxEntries);
    expect(receipt.unchangedSaveRecords).toBe(0);
    console.log(JSON.stringify(receipt));
  });
});

function measureProfile(tree: ReturnType<typeof createPerformanceThoughtTree>, rounds: number) {
  const bundle = treeToBundle(tree);
  const stored = {
    storageSchemaVersion: 1,
    treeId: tree.id,
    treeRevision: tree.revision,
    writeGeneration: 1,
    bundle,
    history: createTreeHistory(),
  };
  const serializedBytes = new TextEncoder().encode(JSON.stringify(stored)).byteLength;
  const decoded = bundleToTree(bundle);
  expect(decoded).toMatchObject({ ok: true, tree: { id: tree.id } });
  return Object.freeze({
    nodeCount: Object.keys(tree.nodes).length,
    serializedBytes,
    validate: measure(rounds, () => validateThoughtTree(tree)),
    paths: measure(rounds, () => allocateSnapshotPaths(tree)),
    encode: measure(rounds, () => treeToBundle(tree)),
    clone: measure(rounds, () => structuredClone(stored)),
    stringify: measure(rounds, () => JSON.stringify(stored)),
    decode: measure(rounds, () => bundleToTree(bundle)),
  });
}

function measure(rounds: number, operation: () => unknown) {
  operation();
  operation();
  const durations: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const startedAt = performance.now();
    operation();
    durations.push(performance.now() - startedAt);
  }
  durations.sort((left, right) => left - right);
  return Object.freeze({
    medianMs: Number(durations[Math.floor(durations.length / 2)]!.toFixed(2)),
    p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1]!.toFixed(2)),
    maxMs: Number(durations.at(-1)!.toFixed(2)),
  });
}
