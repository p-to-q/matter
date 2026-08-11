# Protocol 0.2

## Locale contract

Locale fields use the supported BCP 47 values `zh-CN`, `en-US`, `ja-JP`,
`de-DE`, and `zh-TW`. The language picker presents them in product order:
Simplified Chinese, English, Japanese, German, Traditional Chinese. The
selected value is local presentation state, but it is also sent as request
context to transcription, derived labels, and future model turns so server
output follows the person's chosen language. It is never stored in
`ThoughtTree`, command history, or exported material snapshots.

Unknown or syntactically valid-but-unsupported locale values are rejected at
the request boundary. A locale addition is a protocol change: update the
shared allow-list, client copy, provider handling, and focused tests together.

Status: document, tree engine, navigation, layout, local tool actions, browser
native voice admission, fixture HTTP voice tests, derived thought labels, lasso
segment addressing, stretch degree, Markdown durability, bounded inquiry, and
the fixture-gated transform vertical slice are implemented. `POST /api/turn`
accepts one strict envelope, returns one server-built plan, and remains
unavailable on a production origin until the separate transform provider gate is
explicitly enabled. Markdown archive export/import is available as a strict
local return path.

`0.2` is a clean break because `0.1` has no persisted documents. A multi-passage
lasso selection set is deliberately not a protocol field: it is transient UI
state for copy and navigation, while a transform still receives one validated
`SegmentSelection` at a time.

## ThoughtTree

```ts
export const PROTOCOL_VERSION = "0.2" as const;

export type ThoughtNode = {
  id: string;
  text: string;
  role?: "document-root";
  parentId: string | null;
  children: string[];
  createdAt: string;
  updatedAt: string;
};

export type ThoughtTree = {
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  rootId: string | null;
  title?: string;
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

The running document normalizes that root into one invisible `document-root`.
Its ordered children are the visible first level, so a canvas can have several
peer headings without becoming a forest. The container has empty text and is
never a drag source, focus target, model passage, or material-index row. `title`
names the canvas independently from every passage; legacy `0.2` trees seed it
from their former visible root and are wrapped at the document boundary.

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

## Repair boundaries

Material admission does not use a network envelope. The final transcript first
commits through the ordinary human admission translator. That successful call
returns an opaque, non-persisted repair capability directly to the admission
driver; it is deliberately omitted from observable store receipts. After the
baseline commits, the local port may compute beside the first-paint gate, but
no candidate may settle before the baseline crosses that boundary. Settling or
abandoning the attempt always consumes the capability.

The interaction owner captures a document epoch beside its material anchor.
The store validates that epoch in the same atomic update that calls the pure
translator, so a hydration or conflict replacement with the same tree id and
revision still rejects a late transcript. Repair capability ids are generated
by the store instance rather than derived solely from caller command ids; two
otherwise valid admissions can never overwrite each other's authority.

The store owns the deadline and authority check. A rules candidate must equal
the current pure rule result exactly; a future local-model candidate must pass
the semantic adjudicator. Either path must still match the document epoch,
tree, node text, and node timestamp captured at admission. Only then does the
runtime construct one `replace-text` command with `source: "repair"`. It is a
separate undo entry. The capability, worker, cache, input, and candidate are
never serialized.

A committed repair may return a transient `repairChange` receipt containing the
actual before/after node mementos and committed revision to its synchronous
owner. Observable store state keeps the base runtime receipt, so this view hint
cannot become a wire value, persisted log, replay signal, or restored animation.

The existing managed envelope remains for Ask Matter dictation drafts and an
explicit future managed adapter. It carries one utterance and gets one back,
and names no tree, node, revision, lineage, or target:

```ts
export type RepairRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: typeof TRANSCRIPT_REPAIR_PROMPT_VERSION;
  operationId: string;
  attempt: number;
  locale: string;
  text: string;
  vocabulary?: string[];   // bounded terms from the person's own material
};

export type RepairSuccess = {
  protocolVersion: typeof PROTOCOL_VERSION;
  promptVersion: typeof TRANSCRIPT_REPAIR_PROMPT_VERSION;
  operationId: string;
  attempt: number;
  text: string;
  source: "verbatim" | "model";
  fallbackReason?:
    | "MODEL_UNAVAILABLE"
    | "MODEL_TIMEOUT"
    | "MODEL_REJECTED"
    | "MODEL_BUSY"
    | "NOT_WORTH_ASKING";
};
```

`operationId` and `attempt` echo the dictation interaction, so a late answer for
a superseded attempt is discarded by identity rather than by timing.
`source: "verbatim"` with a `fallbackReason` is a success, not an error: it means
the words as heard are the answer. The only error codes are `INVALID_REQUEST`
and `REPAIR_FAILED`, and neither reaches the person, because the browser admits
the transcript it already holds.

`vocabulary` is a hint, not context: bounded terms the person already repeated
in their own visible material, most-used first, carrying no node id, depth, or
ordering. It can only help a model recognise a word that was said —
`adjudicateRepair` still rejects any answer that moves the spoken skeleton past
its edit budget, so a hinted term cannot be inserted into a sentence that did
not contain it. Absent, malformed, or over-long vocabulary is refused or
ignored, and repair proceeds without it.

Bounds: transcript 2,000 code units, vocabulary 24 terms of 32 code units,
request and response 12 KiB, provider deadline scaled to the utterance with a
4-second ceiling, and a browser deadline 800 ms above it.

## Inquiry envelope

Ask Matter is a read-only orientation boundary, separate from transformation.
It cannot name an action or create a tree command. Its context scope is
`selection` when lasso passages exist, otherwise `tree` for the bounded virtual
file-system projection.

```ts
export type InquiryContextNodePayload = {
  nodeId: string;
  depth: number;
  text: string;
  truncated: boolean;
};

export type InquiryRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  question: string;
  locale: string;
  context: {
    treeId: string;
    revision: number;
    scope: "selection" | "tree";
    lineage: InquiryContextNodePayload[];
    thoughtCount: number;
    clipped: boolean;
  };
};

export type InquiryReceipt = {
  scope: "selection" | "tree";
  lineageNodes: number;
  contextCodePoints: number;
  clipped: boolean;
  thoughtCount: number;
};

export type InquiryAnswer =
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      basis: { requestId: string; treeId: string; revision: number; scope: "selection" | "tree" };
      status: "answered";
      text: string;
      receipt: InquiryReceipt;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      basis: { requestId: string; treeId: string; revision: number; scope: "selection" | "tree" };
      status: "unavailable";
      reason: "NO_PROVIDER" | "NO_MATERIAL";
      receipt: InquiryReceipt;
    };
```

Both request and response reject unknown fields whole. The response echoes the
request id and exact tree/revision/scope basis; the browser accepts it only while
that operation and complete projected context are still current. Closing the
surface, changing documents, committing material, or changing the selection
aborts the request and makes a late completion inert.

An error response is also parsed as an exact Matter envelope. Its server message
is validated and discarded; only the closed `fallbackReason` receipt may select
localized client copy. `MODEL_BUSY`, `MODEL_TIMEOUT`, and temporary model
unavailability remain distinct. A legacy, malformed, oversized, unknown, or
proxy-authored 429/503 fails closed as unreachable instead of claiming that
Matter received the question. No provider message, status, model, or relay
identity crosses this boundary.

The browser projects lasso passages in authored order, including multiple
passages from one node. With no lasso selection it projects the virtual tree in
authored preorder. Both scopes are bounded; the server parses the request whole,
reports a receipt,
and returns `Cache-Control: no-store`. No question, context, answer, or turn list
enters `ThoughtTree`, command history, material archive, or routine logs.
The browser may retain a completed exchange in its separate bounded Ask Matter
record, without copied material context and never as later model input; see
[`reference/inquiry-record.md`](reference/inquiry-record.md).

Bounds: question 500 code points, request 24 KiB, response 8 KiB, lineage 64 nodes, each projected
node 480 code points, total projected context 4,000 code points, and browser
deadline 20 seconds. Answer text is bounded to 1,201 code points. The response is either one text answer or an explicit
unavailable reason; no fallback prose is invented. The current build has no
answer or memory adapter connected. A future adapter remains server-owned and
must preserve this same visible-context and non-mutation contract.

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
    }
  | {
      type: "replace-title";
      expectedTitle: string;
      title: string;
    }
  | {
      type: "move-node";
      nodeId: string;
      expectedNode: ThoughtNode;
      fromParentId: string;
      fromIndex: number;
      fromParentChildrenBefore: string[];
      toParentId: string;
      toIndex: number;
      toParentChildrenBefore: string[];
    };

export type TreeCommand = {
  id: string;
  source: "human" | "repair" | "agent" | "fixture";
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
`move-node` is a private human structural mutation. It captures the complete
moved node plus exact source and target child orders. The root cannot move, a
node cannot move into itself or its descendants, and an unchanged insertion slot
is rejected before command construction. `toIndex` is the post-removal slot;
therefore the same command supports both reparenting and same-parent ordering.
A successful move changes only the moved node's `parentId` when necessary and
the affected child lists; its inverse restores those exact mementos.

Every `0.2` command contains exactly one domain mutation. Split or merge may add
one new atomic mutation later; they do not justify a generic transaction now.
`source` records provenance only. Public-action and admission translators decide
which mutation may be constructed; the engine applies validated private
commands without treating provenance as authorization.

`expectedRevision` is checked inside the engine for normal commits and undo,
not only while translating a plan. Undo restores material, structure, sibling
order, and node timestamps exactly. It is itself a new commit, so tree revision
always increments and is never rolled back. Committed human, repair, and agent
commands may enter pointer undo history; their source remains distinguishable. The browser
retains the complete local inverse journal alongside its material snapshot,
within the physical IndexedDB quota, and saves both in one compare-and-swap
record. It is deliberately excluded from archives.

The engine sets an inverse's expected revision to the newly committed revision.
When sequential undo reaches it after newer commands have themselves been
undone, history clones the inverse and rebases only that revision to the current
one. Every structural or text mutation still verifies its complete memento, so
rebasing cannot become an unconditional overwrite. Successful undo removes the
entry and does not push the inverse produced by undo; failure changes neither
tree nor history. Hydration validates the whole saved inverse chain against the
restored tree before exposing it; a malformed or legacy journal is discarded
without affecting material. Archive import and a foreign document switch start
a new history, and every document transition clears pending turns.

`affectedNodeIds` is the material touch set: text replacement names its node;
root operations name the root; insert names node and parent; move names the
moved node and both parents; subtree remove or restore names every subtree node
and the attachment parent. It is not a layout
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
