import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createPerformanceThoughtTree } from "../material/seeded-document";
import { createTreeHistory } from "../tree/history";
import { validateThoughtTree } from "../tree/invariants";
import { bundleToTree, treeToBundle } from "./snapshot-codec";
import { allocateSnapshotPaths } from "./snapshot-paths";

const enabled = process.env.MATTER_PERSISTENCE_BENCHMARK === "1";

describe.skipIf(!enabled)("persistence performance receipt", () => {
  it("measures one maximum supported document through every synchronous storage boundary", () => {
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
