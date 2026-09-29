import assert from "node:assert/strict";
import { test } from "node:test";
import {
  architectureImportsOf,
  buildRepositoryGraph,
  findProblems,
  importsOf,
  layerOf,
} from "./check-architecture.mjs";

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
      why: "product code reaching publication tooling",
      graph: new Map([
        ["features/matter/components/MatterApp.tsx", ["studio/film/copy.mjs"]],
        ["studio/film/copy.mjs", []],
      ]),
      expect: /must not depend on studio code/u,
    },
    {
      why: "a server prompt reaching local lexical authority",
      graph: new Map([
        ["features/matter/server/repair-harness.ts", ["features/matter/wiki/wiki-model.ts"]],
        ["features/matter/wiki/wiki-model.ts", []],
      ]),
      expect: /Wiki is local-only/u,
    },
    {
      why: "a wire contract serializing local lexical authority",
      graph: new Map([
        ["features/matter/protocol/repair-contract.ts", ["features/matter/wiki/wiki-model.ts"]],
        ["features/matter/wiki/wiki-model.ts", []],
      ]),
      expect: /Wiki is local-only/u,
    },
    {
      why: "an API route reaching local lexical authority",
      graph: new Map([
        ["app/api/repair/route.ts", ["features/matter/wiki/wiki-model.ts"]],
        ["features/matter/wiki/wiki-model.ts", []],
      ]),
      expect: /Wiki is local-only/u,
    },
    {
      why: "a server relaying through an application service to local lexical authority",
      graph: new Map([
        ["features/matter/server/repair-harness.ts", ["features/matter/application/material-ingress.ts"]],
        ["features/matter/application/material-ingress.ts", ["features/matter/wiki/wiki-model.ts"]],
        ["features/matter/wiki/wiki-model.ts", []],
      ]),
      expect: /repair-harness\.ts -> features\/matter\/application\/material-ingress\.ts -> features\/matter\/wiki\/wiki-model\.ts/u,
    },
    {
      why: "the store selecting a concrete lexical authority",
      graph: new Map([
        ["features/matter/store/matter-store.ts", ["features/matter/application/wiki-material-lexical-adapter.ts"]],
        ["features/matter/application/wiki-material-lexical-adapter.ts", ["features/matter/wiki/wiki-basis.ts"]],
        ["features/matter/wiki/wiki-basis.ts", []],
      ]),
      expect: /store may depend only on the neutral material lexical port/u,
    },
    {
      why: "a history journal reaching Wiki through the shared database schema",
      graph: new Map([
        ["features/matter/persistence/history-journal.ts", ["features/matter/persistence/matter-database.ts"]],
        ["features/matter/persistence/matter-database.ts", ["features/matter/wiki/wiki-model.ts"]],
        ["features/matter/wiki/wiki-model.ts", []],
      ]),
      expect: /history-journal\.ts reaches Wiki through .*matter-database\.ts -> features\/matter\/wiki\/wiki-model\.ts/u,
    },
    {
      why: "an exported archive serializing Wiki",
      graph: new Map([
        ["features/matter/persistence/archive-transport.ts", ["features/matter/wiki/wiki-codec.ts"]],
        ["features/matter/wiki/wiki-codec.ts", []],
      ]),
      expect: /Archive, snapshot, and history modules carry material only/u,
    },
    {
      why: "a snapshot codec that can name a Wiki type",
      graph: new Map([
        ["features/matter/persistence/snapshot-codec.ts", ["features/matter/wiki/wiki-model.ts"]],
        ["features/matter/wiki/wiki-model.ts", []],
      ]),
      expect: /Archive, snapshot, and history modules carry material only/u,
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

test("an aliased import is an edge, not an exemption", () => {
  // `@/*` resolves to the repository root. While the resolver dropped these,
  // every rule was a direct path check against a graph that did not contain
  // them, so an aliased provider import would have passed by being invisible —
  // and the check would still have printed "no provider leak".
  const graph = buildRepositoryGraph();
  const aliasedEdges = [...graph]
    .filter(([file]) => file.startsWith("app/"))
    .flatMap(([, targets]) => targets.filter((target) => target.startsWith("features/matter/")));
  assert.ok(
    aliasedEdges.length > 0,
    "app/ reaches features/ only through @/ imports; an empty set means the resolver dropped them again",
  );
  assert.ok(
    findProblems(new Map([
      ["app/api/turn/route.ts", ["features/matter/server/model-pool.ts"]],
      ["features/matter/server/model-pool.ts", []],
    ])).length > 0,
    "a route reaching the provider module must still be reported",
  );
});

test("the Wiki repository may still reach Wiki; only persisted material may not", () => {
  assert.deepEqual(
    findProblems(new Map([
      ["features/matter/persistence/wiki-repository.ts", ["features/matter/wiki/wiki-codec.ts"]],
      ["features/matter/wiki/wiki-codec.ts", []],
    ])),
    [],
  );
  const graph = buildRepositoryGraph();
  const persisted = [...graph.keys()].filter((file) =>
    /^features\/matter\/persistence\/(?:archive|snapshot|history)-/u.test(file) &&
    !/\.test\./u.test(file));
  assert.ok(
    persisted.length >= 4,
    "the rule must see the archive, snapshot, and history modules it holds",
  );
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
  assert.deepEqual(importsOf('const a = import("./a");'), ["./a"]);
  assert.deepEqual(importsOf('const a = await import(`./${name}`);'), []);
  assert.deepEqual(
    architectureImportsOf('import type { WikiState } from "../wiki/wiki-model";'),
    ["../wiki/wiki-model"],
  );
  assert.deepEqual(architectureImportsOf('import type { A } from "./a";'), []);
  // A specifier inside a string or comment is not an import.
  assert.deepEqual(importsOf('const note = `import { a } from "./a"`;'), []);
  assert.deepEqual(importsOf('const note = `import("./a")`;'), []);
  assert.deepEqual(importsOf('// import("./a")\nconst value = 1;'), []);
});

test("a string-literal dynamic import cannot bypass architecture privacy", () => {
  assert.deepEqual(
    architectureImportsOf('return import("../wiki/wiki-model");'),
    ["../wiki/wiki-model"],
  );
  assert.deepEqual(
    architectureImportsOf('return import("@/features/matter/wiki/wiki-model");'),
    ["@/features/matter/wiki/wiki-model"],
  );
  assert.deepEqual(
    architectureImportsOf('return import("../wiki/wiki-model", { with: { type: "json" } });'),
    ["../wiki/wiki-model"],
  );
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
  return index === null ? null : [
    "tree", "material", "protocol", "domain", "application", "adapter", "store", "composition",
  ][index];
}
