# Protocol 0.2

Status: document, tree engine, navigation, layout, local tool actions, browser
native voice admission, fixture HTTP voice tests, derived thought labels, lasso
segment addressing, stretch degree, and Markdown durability are implemented.
Generative transformation remains specified for Phase 2 in
[`plans/active-tree-material.md`](../plans/active-tree-material.md); `/api/turn` remains
gated. Markdown archive
export/import is available as a strict local return path.

`0.2` is a clean break because `0.1` has no persisted documents.

## ThoughtTree

```ts
export const PROTOCOL_VERSION = "0.2" as const;

export type ThoughtNode = {
  id: string;
  text: string;
  parentId: string | null;
  children: string[];
  createdAt: string;
  updatedAt: string;
};

export type ThoughtTree = {
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  rootId: string | null;
  nodes: Record<string, ThoughtNode>;
  revision: number;
};
```

A valid tree is either empty (`rootId: null` and no nodes) or has one root,
bidirectional parent/child agreement, unique ordered children, no cycle, and no
unreachable node. Invalid documents are rejected as a whole, never repaired.
Tree and node ids use 1–128 ASCII characters from `[A-Za-z0-9_-]`, beginning
with an alphanumeric character. This grammar is safe in Markdown frontmatter,
network envelopes, IndexedDB keys, and logical paths without transport-specific
escaping.

Before the first voice admission, the document already has identity, version,
and revision, but no root. Transcription of the first utterance commits an
`initialize-root` command; its inverse returns to the same empty document while
revision continues forward. Later admissions append a human child under the sole
root, regardless of the currently selected depth. Admission does not call the
generative planner.

## Addressing and degree

```ts
export type SegmentSelection = {
  type: "segment-range";
  nodeId: string;
  start: number;          // UTF-16 code units, inclusive
  end: number;            // UTF-16 code units, exclusive
  selectedText: string;
};

export type StretchGesture = {
  type: "stretch";
  axis: "vertical";
  amount: number;         // [0, 1]
};
```

The physical edge (`top` or `bottom`) is transient presentation state, not a
second semantic direction and not a network field. Both edges express one
non-negative expansion degree; voice carries where the language should go.

Offsets must land on grapheme boundaries. Segment punctuation rules live in
[`material.md`](material.md); segment indices and screen geometry never cross
the network. Surrounding text is derived from the final lineage node rather than
duplicated in the envelope.

`validateSelection(text, selection)` is the shared rule at envelope creation,
server planning, and pre-commit translation. It requires integer ordered bounds,
grapheme boundaries from a fixed-locale segmenter, an exact text slice, and a
range equal to one derived punctuation segment or one contiguous adjacent run.
Client locale never changes the address space.

## Transform envelope

```ts
export type LineageNode = Pick<
  ThoughtNode,
  "id" | "text" | "parentId" | "createdAt" | "updatedAt"
>;

export type TransformEnvelope = {
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  treeId: string;
  mode: "transform";
  treeRevision: number;
  selection: SegmentSelection;
  gesture: StretchGesture;
  voice: { transcript: string; language?: string; durationMs?: number };
  context: {
    lineage: LineageNode[];  // exactly root → selected node
  };
};
```

The lineage is derived by one pure function used by both focus rendering and
envelope construction. The server validates unique ids, a root first node, every
following `parentId` against its predecessor, and the final selected node. There
is no create envelope: material admission ends after transcription and a local
human command. Fixture routing is deployment/test configuration, not a
client-controlled product protocol field.

## Model output and plan

The model's entire output surface is:

```ts
type ModelResult = { text: string };
```

The server constructs the only public agent action from the envelope:

```ts
export type ReplaceTextRangeAction = {
  id: string;
  type: "replace-text-range";
  nodeId: string;
  start: number;
  end: number;
  text: string;
  intent: "expand" | "compress" | "reinterpret" | "refine";
};

export type ActionPlan = {
  protocolVersion: typeof PROTOCOL_VERSION;
  interactionId: string;
  treeId: string;
  treeRevision: number;
  action: ReplaceTextRangeAction;
  presentation?: { motionHint?: "grow" | "compress" | "settle" };
};
```

The model cannot choose the node, range, action, or number of changes because
none of them exist in its output channel.

Before constructing a plan, the server runs lineage and selection validation.
Immediately before commit,
`planToTreeCommand(currentTree, originalEnvelope, plan)` synchronously verifies
interaction id, tree id, revision, echoed action fields, the current selected
slice, and the complete composed node bound. It then creates one whole-node
`replace-text` mutation and dispatches it without an asynchronous gap. The tree
engine sees the resulting expected text and timestamp, not the public range.
The server is not an authoritative document replica.

## Label envelope

Labelling names an existing node for navigation. It is a separate, smaller
boundary than the transform turn: it changes no material, so it has no plan, no
action, and no command.

```ts
export type LabelBasis = {
  treeId: string;
  nodeId: string;
  revision: number;
};

export type LabelRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: string;
  operationId: string;
  basis: LabelBasis;
  locale: string;
  maxGraphemes: number;    // 2 … 32
  text: string;            // the node's own material
  reference: {
    parentLabel?: string;
    parentExcerpt?: string;      // ≤ 240 UTF-16 code units
    siblingLabels?: string[];    // ≤ 8 entries, ≤ 64 code units each
  };
};

export type LabelSuccess = {
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: string;
  operationId: string;
  basis: LabelBasis;
  label: string;
  source: "provisional" | "model";
  fallbackReason?: "MODEL_UNAVAILABLE" | "MODEL_TIMEOUT" | "MODEL_REJECTED" | "MODEL_BUSY";
};
```

The model's entire output surface is `{ text }`, as in a transform turn. The
server constructs the response from the request it parsed, so a model cannot
name a node, a revision, or a document.

Reference material is context, never instruction: it is fenced and named as
material to be labelled, and text inside it is never followed. Both sides parse
against this contract and reject unknown fields whole. A response must echo
`operationId`, `basis`, and `promptVersion` exactly, and the browser then checks
the node, its material fingerprint, and the latest operation once more before a
row changes.

A label always settles. When a model is unavailable, slow, saturated, or
answers badly, the response carries the deterministic label with a
`fallbackReason`, and the browser applies nothing it did not already have.

`promptVersion` participates in cache identity, so raising it invalidates every
stored label without a schema change.

Bounds: request 8 KiB, response 4 KiB, label 32 graphemes (Chinese material asks
for 14, Japanese for 20), browser deadline 3,500 ms, provider deadline 3,000 ms. There is no
retry. Nothing waits on those deadlines — a label is already on screen — so
they are set from measured relay latency rather than from a perceived-response
budget.

Labels are not part of the document. They never appear in `ThoughtTree`, a
command, an inverse, a snapshot, or an archive. A model answer and a name a
person typed are kept in a separate browser store keyed by tree and node, each
carrying the fingerprint of the material it came from, so a node is named once
rather than once per reload. A deterministic label is never stored: recomputing
it is cheaper than reading it back.

## Private commands

```ts
export type DetachedSubtree = {
  rootId: string;
  nodes: Record<string, ThoughtNode>;
  parentId: string;
  index: number;
  parentChildrenBeforeDetach: string[];
};

export type TreeMutation =
  | { type: "initialize-root"; root: ThoughtNode }
  | { type: "clear-root"; expectedRoot: ThoughtNode }
  | {
      type: "insert-node";
      node: ThoughtNode;
      parentId: string;
      index: number;
      expectedParentChildren: string[];
    }
  | { type: "remove-subtree"; detached: DetachedSubtree }
  | { type: "restore-subtree"; detached: DetachedSubtree }
  | {
      type: "replace-text";
      nodeId: string;
      expectedText: string;
      expectedUpdatedAt: string;
      text: string;
      updatedAt: string;
    };

export type TreeCommand = {
  id: string;
  source: "human" | "agent" | "fixture";
  interactionId?: string;
  expectedTreeId: string;
  expectedRevision: number;
  mutation: TreeMutation;
  createdAt: string;
};

export type CommandSuccess = {
  ok: true;
  tree: ThoughtTree;
  inverse: TreeCommand;
  affectedNodeIds: string[];
};

export type CommandFailure = {
  ok: false;
  error: {
    code:
      | "REVISION_CONFLICT"
      | "INVALID_COMMAND"
      | "TREE_INVARIANT_VIOLATION"
      | "BOUND_EXCEEDED";
    message: string;
  };
};

export type CommandResult = CommandSuccess | CommandFailure;
```

Only `initialize-root` may move an empty tree to a rooted tree; it accepts a leaf
root with `parentId: null`. `clear-root` requires an exact expected root and a
one-node tree. `remove-subtree` cannot target the root. `DetachedSubtree` contains
one complete expected subtree, its parent, its former index, and the parent's
exact child order before detachment. Remove and restore validate that memento,
attachment, child order, id absence/presence, and strict index without clamping.

Every `0.2` command contains exactly one domain mutation. Split or merge may add
one new atomic mutation later; they do not justify a generic transaction now.
`source` records provenance only. Public-action and admission translators decide
which mutation may be constructed; the engine applies validated private
commands without treating provenance as authorization.

`expectedRevision` is checked inside the engine for normal commits and undo,
not only while translating a plan. Undo restores material, structure, sibling
order, and node timestamps exactly. It is itself a new commit, so tree revision
always increments and is never rolled back. Committed human and agent commands
may enter pointer undo history; their source remains distinguishable. Runtime
history has both an entry limit and a retained-inverse byte budget, and is not
serialized.

The engine sets an inverse's expected revision to the newly committed revision.
When sequential undo reaches it after newer commands have themselves been
undone, history clones the inverse and rebases only that revision to the current
one. Every structural or text mutation still verifies its complete memento, so
rebasing cannot become an unconditional overwrite. Successful undo removes the
entry and does not push the inverse produced by undo; failure changes neither
tree nor history. Hydration, import, and document switch clear history and every
pending turn.

`affectedNodeIds` is the material touch set: text replacement names its node;
root operations name the root; insert names node and parent; subtree remove or
restore names every subtree node and the attachment parent. It is not a layout
damage calculation.

## Bounds and errors

Initial bounds:

| Quantity | Bound |
| --- | --- |
| node text | 2,000 UTF-16 code units |
| replacement text | 800 UTF-16 code units |
| tree depth / lineage | 32 nodes |
| children per node | 64 |
| nodes per tree | 2,000 |
| audio | 60 seconds |
| planning request | 20 seconds |

Bounds reject rather than truncate. Stable error codes cover microphone,
transcription, timeout, invalid interaction or plan, revision conflict, tree
invariant violation, bound exceeded, and internal failure. Provider errors never
reach the browser.

`protocolVersion` is checked on every transform envelope, plan, and serialized
snapshot. Mismatches are rejected; migration is explicit.

Tree validation also rejects a record key that differs from `node.id`, invalid
or non-canonical timestamps, an unsafe revision integer, duplicate or unknown
children, parent/child disagreement, a non-empty tree without exactly one root,
cycles, unreachable nodes, and any depth, child, node, or text bound violation.
Validation never repairs.

A command also rejects the wrong tree id, `revision >= Number.MAX_SAFE_INTEGER`,
a text replacement equal to its expected text, a non-leaf inserted node,
non-canonical times or `createdAt > updatedAt`, and any mutation that would
exceed a final bound. One successful command increments revision exactly once.
