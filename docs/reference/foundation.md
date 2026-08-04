# Technical Foundation

Status: chosen for protocol `0.2`.

## Choice

Matter uses a small native kernel over browser primitives. It does not fork a
document editor, canvas SDK, or collaborative database.

```text
strict protocol
      ↓
pure tree commands ── exact inverse ── bounded runtime history
      ↓
visible-tree selectors ── semantic DOM text ── pointer interaction machine
      ↓
snapshot codec ── IndexedDB / ZIP adapters
```

The choice is not "build everything ourselves." It keeps product semantics in
local code and uses small dependencies only at generic transport boundaries.

**Matter-native kernel — chosen.** Node identity, lineage, and one-change
commands are the product's own semantics and fit in a small pure core.

**ProseMirror.** Its mature transforms are valuable prior art. Global document
positions, rich-text schema, and editing pipeline solve a different document.

**tldraw / graph SDK.** Its pointer states and history are useful prior art.
Coordinates, viewport, shape store, free movement, and production license
conditions are wrong infrastructure for the rooted model.

**Yjs / Automerge.** Concurrent replicas and scoped collaborative undo are useful
when collaboration exists. Adding CRDT state before identity and sync have a
product contract would make every current boundary harder.

## Borrowed mechanisms, not source trees

- From [ProseMirror transforms](https://github.com/ProseMirror/prosemirror-transform/blob/662b7a937bafde19b7e2a83241dbc8888e257c89/src/step.ts):
  compute an inverse against the state immediately before a step is applied,
  then publish a transaction only after every step succeeds.
- From tldraw's editor architecture: model pointer work as explicit states with
  `pointerdown`, `pointermove`, `pointerup`, `cancel`, and `interrupt`; no tldraw
  source or package enters Matter. Its
  [current license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) is an
  additional reason not to make it infrastructure.
- From the local Murmur checkout at `287a8c6`: validate every persisted value on
  hydration, keep fixture fallback explicit, and put recording cleanup behind
  one facade. Murmur itself is not a base: its auth, billing, database, worker,
  and artifact lifecycle are unrelated weight.
- From [Jah-yee/cursor-rules at `142f12a`](https://github.com/Jah-yee/cursor-rules/tree/142f12a38323a54d88d65623006bedd1a5b3f762):
  read the repository before writing, keep a change coherent, validate the
  narrow boundary first, and finish with an independent verification pass. The
  repository had no declared license when reviewed, so Matter references the
  method and independently states its own rules; no text, template, or source
  tree is vendored.

## Kernel ownership

```text
features/matter/
  tree/          model, invariants, lineage, command engine, history
  material/      graphemes, punctuation segments, lasso rules
  layout/        visible traversal and focus/fold projection
  interaction/   pointer machine, DOM Range geometry, voice lifecycle
  persistence/   snapshot codec, IndexedDB, archive transport
  server/        transcription, provider adapter, planner
  store/         thin React/Zustand binding over the modules above
```

Zustand may coordinate state and notify React. It does not validate a tree,
construct an inverse, segment text, derive context, or serialize a snapshot.

## Dependency boundary

The tree, material, layout, and interaction machine need no new runtime
dependency. A boundary parser is added with the first Matter-native HTTP schema,
not retained while no application boundary imports it.

Two small dependencies are approved only when their slice begins:

- [`idb`](https://github.com/jakearchibald/idb) for IndexedDB transaction
  completion, upgrade, blocked, and termination handling. Repeating that
  lifecycle locally is worse than its roughly 1.2 kB brotli wrapper.
- [`fflate`](https://github.com/101arrowz/fflate) for ZIP import/export. Writing
  ZIP, CRC, and decompression locally would be unsafe and substantially larger.

Neither belongs in `package.json` before the feature that uses it. No layout,
geometry, immutable-update, state-machine, editor, or CRDT package is approved.

## Evidence gate

The first proof is one vertical slice, not a framework migration:

1. initialize a root and insert a child;
2. derive and render the exact root-to-child lineage;
3. replace one grapheme-safe range through an atomic command;
4. undo to identical material while document revision remains monotonic;
5. reject a stale plan without changing the tree.

Synthetic local probes on the specified maximum found a shallow copy-on-write
replace over a 2,000-node, 4.2 MB tree at about `0.33 ms`, and a 2,000-node
preorder traversal at about `0.07 ms` on this development machine. These are not
product benchmarks. They show that DOM measurement and rendering, not the pure
tree pass, are the first performance risk. The vertical slice therefore records
DOM count, long tasks, and pointer latency before any virtualization is added.
