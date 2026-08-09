import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRepositoryGraph, findProblems, importsOf, layerOf } from "./check-architecture.mjs";

test("the repository holds its own shape", () => {
  assert.deepEqual(findProblems(buildRepositoryGraph()), []);
});

test("a check that cannot fail proves nothing", () => {
  // Each case is a shape this repository actually had, and paid for.
  const cases = [
    {
      why: "the domain reaching the store",
      graph: new Map([
        ["features/matter/runtime/navigation.ts", ["features/matter/store/matter-store.ts"]],
        ["features/matter/store/matter-store.ts", []],
      ]),
      expect: /must not depend on store code/u,
    },
    {
      // Doubly wrong: it is also an inner layer reaching an outer one, and
      // the check says both rather than picking one.
      why: "a wire contract reaching its own server",
      graph: new Map([
        ["features/matter/protocol/label-contract.ts", ["features/matter/server/label-route.ts"]],
        ["features/matter/server/label-route.ts", []],
      ]),
      expect: /must not depend on either side of its own wire/u,
    },
    {
      why: "a browser module reaching a provider",
      graph: new Map([
        ["features/matter/interaction/label-client.ts", ["features/matter/server/model-pool.ts"]],
        ["features/matter/server/model-pool.ts", []],
      ]),
      expect: /Only features\/matter\/server\/ may reach a provider/u,
    },
    {
      why: "two transports importing each other",
      graph: new Map([
        ["features/matter/interaction/browser-voice.ts", ["features/matter/interaction/browser-speech-voice.ts"]],
        ["features/matter/interaction/browser-speech-voice.ts", ["features/matter/interaction/browser-voice.ts"]],
      ]),
      expect: /import cycle/u,
    },
  ];

  for (const { why, graph, expect } of cases) {
    const problems = findProblems(graph);
    assert.ok(problems.length > 0, `${why}: the check reported nothing`);
    assert.ok(
      problems.some((problem) => expect.test(problem)),
      `${why}: no reported problem matched ${expect}\n${problems.join("\n")}`,
    );
  }
});

test("a test file may reach anywhere, because a proof is not a dependency", () => {
  assert.deepEqual(
    findProblems(new Map([
      ["features/matter/tree/engine.test.ts", ["features/matter/components/MatterApp.tsx"]],
      ["features/matter/components/MatterApp.tsx", []],
    ])),
    [],
  );
});

test("a type-only edge is not a runtime edge", () => {
  assert.deepEqual(importsOf('import type { A } from "./a";'), []);
  assert.deepEqual(importsOf('import { type A, type B } from "./a";'), []);
  // One value binding among types is still a runtime edge.
  assert.deepEqual(importsOf('import { type A, b } from "./a";'), ["./a"]);
  assert.deepEqual(importsOf('import { a } from "./a";'), ["./a"]);
  assert.deepEqual(importsOf('import Default from "./a";'), ["./a"]);
  // A side-effect import has no bindings and is the most real edge of all.
  assert.deepEqual(importsOf('import "./a";'), ["./a"]);
  assert.deepEqual(importsOf('export { a } from "./a";'), ["./a"]);
  assert.deepEqual(importsOf('export type { A } from "./a";'), []);
  // A specifier inside a string or comment is not an import.
  assert.deepEqual(importsOf('const note = `import { a } from "./a"`;'), []);
});

test("the deepest matching directory names the layer", () => {
  assert.equal(LAYER_NAME("features/matter/tree/model.ts"), "tree");
  assert.equal(LAYER_NAME("features/matter/protocol/label-contract.ts"), "protocol");
  assert.equal(LAYER_NAME("features/matter/components/MatterApp.tsx"), "composition");
  assert.equal(LAYER_NAME("app/api/label/route.ts"), "composition");
  // A path the table does not claim is unranked rather than misranked.
  assert.equal(layerOf("scripts/check-architecture.mjs"), null);
});

function LAYER_NAME(file) {
  const index = layerOf(file);
  return index === null ? null : ["tree", "material", "protocol", "domain", "adapter", "store", "composition"][index];
}
