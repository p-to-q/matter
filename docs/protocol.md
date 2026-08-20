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
segment addressing, stretch degree, Markdown durability, and bounded inquiry
are implemented. The strict `transform/2` Elastic Language contract, synthetic
fixture, and focused E2E receipt are implemented. The new `text-swap/1` contract
is frozen as its sibling rather than an optional Voice field. The deleted
Voice-direction `transform/1` path is historical trace only and its envelopes
remain invalid. Both production generative provider gates remain off. Markdown
archive export/import is available as a strict local return path.

`0.2` is a clean break because `0.1` has no persisted documents. A multi-passage
lasso selection set is deliberately not a protocol field: it is transient UI
state for copy and navigation, while either material transform receives one
validated `SegmentSelection` at a time.

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

The sole lower grip is transient presentation state, not a network field. It
expresses one non-negative downward expansion degree. The selected Elastic
Language tool supplies the only direction: fixed `expand-in-place`. Voice is a
human-admission channel and does not enter this request.

Offsets must land on grapheme boundaries. Segment punctuation rules live in
[`material.md`](material.md); segment indices and screen geometry never cross
the network. Surrounding text is derived from the final lineage node rather than
duplicated in the envelope.

`validateSelection(text, selection)` remains the shared base rule at envelope
creation, server planning, and pre-commit translation. Both `transform/2` and
`text-swap/1` narrow it: the range must equal exactly one current derived
punctuation segment, not a contiguous adjacent run. It requires integer ordered
bounds, grapheme boundaries from a fixed-locale segmenter, and an exact text
slice. Client locale never changes the address space.

## Elastic Language transform/2 envelope

```ts
export type LineageNode = Pick<
  ThoughtNode,
  "id" | "text" | "parentId" | "createdAt" | "updatedAt"
>;

export type TransformEnvelope = {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: "transform/2";
  id: string;
  treeId: string;
  mode: "transform";
  operation: "expand-in-place";
  treeRevision: number;
  selection: SegmentSelection;
  gesture: StretchGesture;
  locale: MatterLocale;
  context: {
    lineage: LineageNode[];  // exactly visible root → selected node
  };
};
```

All keys are exact and all shown keys are required. The request carries no
Voice object, transcript, target length, prompt version, fixture flag, or
client-authored intent. An old `transform/1` envelope is rejected rather than
interpreted as the new action. The lineage is derived by one pure function used
by both focus rendering and envelope construction. The invisible
`document-root` never enters model context; the browser normalizes the first
visible passage's wire `parentId` to `null`. The server validates unique ids, a
visible root first node, every following `parentId` against its predecessor, and
the final selected node. There is no create envelope: material admission ends
after transcription and a local human command. Fixture routing is
deployment/test configuration, not a client-controlled product protocol field.

### Length units and target

The four units do not substitute for one another:

- selection offsets, replacement capacity, and final-node capacity are UTF-16
  code units;
- request and response bounds are measured from actual UTF-8 bytes;
- stretch degree targets Unicode extended grapheme clusters from the
  locale-independent `Intl.Segmenter("und", { granularity: "grapheme" })`;
- provider tokens are only a transport and spend ceiling, never product length.

The server derives the target; the client does not send it. Let:

```text
S     = graphemeCount(selection.selectedText)
U     = selection.selectedText.length                         // UTF-16
R     = min(800, 2000 - before.length - after.length)          // UTF-16
Gcap  = floor(R * S / U)                                      // capacity projection
Dmax  = min(2 * S, Gcap - S)
D     = max(1, ceil(gesture.amount * Dmax))
T     = S + D
```

`S` and `U` must be positive and `Dmax` must be at least one; otherwise the
selection is ineligible and no model call starts. A full unconstrained stretch
therefore aims at three times the source, while the existing 800-code-unit
replacement and 2,000-code-unit node bounds retain authority. `Gcap` projects
capacity using the selected text's observed UTF-16 density; it is not permission
to skip checking the actual answer. The final answer must still be at most 800
UTF-16 code units and the composed node at most 2,000.

The answer is judged against added graphemes, not total-length tolerance:

```text
actualDelta = graphemeCount(answer) - S
lower       = max(1, floor(0.75 * D))
upper       = ceil(1.25 * D)
```

Only `lower <= actualDelta <= upper` is admissible. This replaces the
`transform/1` whole-target ±45% band, which could accept an unchanged passage at
small stretch amounts. The provider output ceiling is
`min(1200, max(96, 2 * T + 96))` tokens; truncation falls to the unchanged floor
rather than changing `T`.

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
  intent: "expand";
};

export type ActionPlan = {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: "transform/2";
  id: string;
  treeId: string;
  treeRevision: number;
  action: ReplaceTextRangeAction;
  presentation: { motionHint: "grow" };
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

### Expand-in-place adjudication

The prompt improves the odds; a shared pure adjudicator is the acceptance
boundary. The server runs it before building a plan and the browser runs the
same policy while parsing the returned plan. In order, it rejects:

1. a non-string, empty, multi-line, control/format-bearing, over-bound, labelled,
   list-shaped, chat-shaped, or explanatory answer;
2. a no-op, including the selected text itself or any answer that does not add a
   grapheme;
3. an answer outside the added-grapheme band above;
4. an answer whose normalized lexical skeleton drops or reorders an original
   Latin word or Han/Kana grapheme; expansion is insertion-shaped, not a free
   rewrite;
5. a change to the ordered multiset of numbers, units, percentages, dates,
   times, versions, URLs, emails, stable identifiers, polarity, modality,
   uncertainty, quantifiers, conditions, causal markers, or question type;
6. a dominant-script change, or a significant new script family not present in
   mixed-script source material; and
7. an answer whose punctuation duplicates the preserved outer seam or whose
   complete node exceeds its UTF-16 bound.

These checks cannot prove that arbitrary new natural language contains no
semantic claim. That residual risk is owned by the frozen multilingual live
evaluation corpus; it is not delegated to a second judge model. A provider that
cannot pass that gate remains disabled rather than receiving a looser prompt or
adjudicator.

### Timing, failure, and idempotency

The scenario has a 12-second deadline, the route boundary 14 seconds, the client
16 seconds, and the platform route 25 seconds. The margins cover body parsing,
plan construction, and response transport without shrinking the measured cold
provider attempt before live evidence exists. A model rejection is never
retried. Ordered relay fallback inside one provider call remains transport
behavior; it does not resample a rejected answer.

Unavailable, timeout, busy, rejected, malformed, no-op, and cancelled turns all
leave the passage unchanged. A new selection, stretch, document epoch, revision,
undo/redo, import, unmount, or page hide aborts the current request and makes a
late answer inert. Pre-commit validation repeats request version, interaction,
tree, revision, node text/timestamp, selection, grapheme, adjudication, and
composed-node checks synchronously before the tree engine sees one command.

One pointer release creates one immutable interaction id and one POST. Neither
client nor route automatically retries it. A successful commit increments the
tree revision, so the same plan cannot commit twice. This is durable-effect
idempotency, not a promise that provider billing is exactly once; transform
responses remain uncached. A future cost-level deduplicator would require a
distributed, no-material TTL record containing only a hash of the interaction
id and terminal state, and is not part of the first slice.

## Text Swap text-swap/1

Text Swap is a separate selected-language operation. It does not add a Voice
field to `transform/2`, accept an Elastic amount, or reinterpret the superseded
`transform/1` envelope.

```ts
export type TextSwapEnvelope = {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: "text-swap/1";
  id: string;
  treeId: string;
  mode: "transform";
  operation: "paraphrase-in-place";
  treeRevision: number;
  selection: SegmentSelection;
  direction: {
    text: string;
  };
  locale: MatterLocale;
  context: {
    lineage: LineageNode[];  // exactly visible root → selected node
  };
};
```

All shown keys are required and unknown keys reject the whole envelope. The
boundary trims the direction, then requires the normalized value to be
non-empty, contain no CR, LF, Unicode line separator, dangerous invisible,
variation-selector, or bidirectional control, and contain at most 240 Unicode
code points. UTF-16 length is not substituted for this code-point bound. Audio,
partial hypotheses, duration, confidence, language detection, and whether Voice
or the optional typed accessibility path supplied the direction do not cross the
wire. The whole request remains limited to 32 KiB of actual UTF-8 bytes.

The selected passage and visible lineage are fenced reference material, never
instructions. The direction is the only person-authored instruction, but it
cannot override the closed operation, scope, preservation policy, answer shape,
or system rules. The current node appears once as `before / passage / after` and
is not duplicated in the ancestor lineage.

### Closed degree and capacity policy

Text Swap has no dragged or model-chosen amount. Its degree is a server-owned
near-source band. For the first corpus seed, let `S` be the selected passage's
extended-grapheme count, `U` its UTF-16 length, and `R` the remaining UTF-16
replacement capacity:

```text
S     = graphemeCount(selection.selectedText)
U     = selection.selectedText.length                         // UTF-16
R     = max(0, min(800, 2000 - before.length - after.length)) // UTF-16
Gcap  = floor(R * S / U)                                      // capacity projection
lower = max(1, floor(0.75 * S))
upper = min(ceil(1.35 * S), Gcap)
```

`S`, `U`, and `R` must be positive and `upper >= lower`; otherwise no request is
admissible. `Gcap` projects the selected passage's observed grapheme-to-UTF-16
density into the remaining capacity. It is an eligibility and target-band
projection, not permission to skip validation against the actual answer. An
answer is admissible only when its extended-grapheme count is inside the
inclusive band, it is at most 800 UTF-16 code units, and `before + answer +
after` is at most 2,000 UTF-16 code units. Text Swap counts graphemes with the
locale-independent `Intl.Segmenter("und", { granularity: "grapheme" })`. The
provider token ceiling is a cost bound derived from `upper`, never a product
length unit. The band is a frozen seed, not a claimed natural-language constant:
a dedicated five-locale corpus must calibrate it before live promotion.
Calibration may narrow the tool-owned policy through a later recorded freeze;
it may not expose a free degree control or let the model choose length.

### Output, plan, and adjudication

The model still returns only `{ text }`. The server constructs exactly one plan:

```ts
export type TextSwapAction = {
  id: string;
  type: "replace-text-range";
  nodeId: string;
  start: number;
  end: number;
  text: string;
  intent: "paraphrase";
};

export type TextSwapPlan = {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestVersion: "text-swap/1";
  id: string;
  treeId: string;
  treeRevision: number;
  action: TextSwapAction;
  presentation: { motionHint: "settle" };
};
```

The server and browser share a pure Text Swap policy. It rejects empty, no-op,
multi-line, newly wrapped, labelled, list-shaped, chat-shaped, control-bearing,
over-band, over-capacity, or script-family-set-drifting output. It also rejects
drift in the ordered protected anchors the pure policy extracts: numbers, units,
percentages, dates, versions, URLs, emails, stable identifiers, polarity,
modality, uncertainty, quantifiers, conditions, and causality markers. Prompt
artifacts, joiners, variation selectors, and outer seams must preserve their
ordered sequences. Unlike Elastic expansion, Text Swap may replace and reorder
lexical wording, so it does not apply the insertion-only lexical-skeleton rule.

Static rules cannot prove that an arbitrary paraphrase adds no claim or fully
follows a nuanced direction. That residual risk belongs to the dedicated
synthetic corpus and independent human review, never a second judge model. The
direction cannot authorize a new topic, fact, example, reason, conclusion,
advice, certainty, translation, or answer to the person.

Immediately before commit, the browser synchronously revalidates request
version, id, tree, revision, selected node text and timestamp, exact
selection, direction bounds, answer policy, echoed action, and the complete
composed node. Only the tree engine receives one whole-node `replace-text`
command and constructs its exact inverse. Candidate text, streamed tokens, and
an old-text copy never become material.

### Lifecycle, failure, and gate

Only Focus plus exactly one current punctuation segment can enter Text Swap.
Entry makes the Elastic grip hidden and inert. Full-view Voice continues normal
material admission. Leaving the mode, changing selection or document basis,
tree mutation, Undo/Redo, import, document switch, unmount, page hide, or Escape
aborts recording or request work and revokes every late result.

Before either local operation begins, the same eligible selection may expose
both Elastic and Text Swap. A non-zero Elastic degree, active drag, request, or
recoverable Elastic failure then owns that selection: the Text Swap carrier is
absent and Voice cannot begin a second generative operation. Resetting and
redrawing the lasso returns to the two-operation choice point. This ownership is
symmetric with Text Swap entry hiding and inerting Elastic; the two grammars
never hand an in-flight basis directly to one another.

One valid Voice finalization, or one local submit from the optional typed path,
creates one immutable request. There is no automatic retry, candidate carousel,
streaming mutation, or multi-step plan. A retryable provider failure leaves
material untouched and may keep the still-current selection and bounded
direction only inside the transient mode for a person's explicit retry; a stale
or cancelled turn clears them. The scenario initially uses the same
12-second scenario, 14-second route, 16-second client, and 25-second platform
boundaries as Elastic while retaining its own operation identity, governor, and
candidate-health lane.

`POST /api/text-swap` is the only Text Swap wire boundary; `/api/turn` remains
the `transform/2` boundary and never accepts this envelope. Production
`text-swap/1` is independently gated off. It cannot reuse a fixture as production
fallback or open merely because `transform/2` is enabled. Live promotion
requires a frozen synthetic fixture, a dedicated multilingual corpus,
critical-drift review, distributed rate limiting, an isolated or explicitly
approved provider credential, hard spend cap and alerts, a deployed-origin
receipt, privacy-safe metrics, and a tested gate-off rollback.

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
for 14, Japanese for 20), browser deadline 13,000 ms, provider deadline 12,000 ms. There is no
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

Material admission never waits on a network envelope. The final transcript first
commits through the ordinary human admission translator. That successful call
returns an opaque, non-persisted repair capability directly to the admission
driver; it is deliberately omitted from observable store receipts. After the
baseline commits, the repair port computes its deterministic rule floor and may
ask the existing managed envelope for one stronger proposal beside the
visibility gate, but no candidate may settle before the baseline crosses two
animation-frame opportunities and a 650 ms minimum. Settling or
abandoning the attempt always consumes the capability.

The interaction owner captures a document epoch beside its material anchor.
The store validates that epoch in the same atomic update that calls the pure
translator, so a hydration or conflict replacement with the same tree id and
revision still rejects a late transcript. Repair capability ids are generated
by the store instance rather than derived solely from caller command ids; two
otherwise valid admissions can never overwrite each other's authority.

The store owns the deadline and authority check. A rules candidate must equal
the current pure rule result exactly; a managed-model candidate must pass
the semantic adjudicator. Either path must still match the document epoch,
tree, node text, and node timestamp captured at admission. Only then does the
runtime construct one `replace-text` command with `source: "repair"`. It is a
separate undo entry. The capability, worker, cache, input, and candidate are
never serialized.

Rules and model form one candidate, not two accumulating edits. The server sees
the rule floor; the browser and store independently recompute it and adjudicate
only the model delta from that floor. This prevents an authorised filler or
restart removal from consuming the spelling-fix budget a second time. Numeric,
unit, literal-address, negation, uncertainty, and quantifier locks apply to the
ordinary model path. The only wider case is an exact deletion-only correction:
the candidate must be the untouched prefix and suffix around a spoken correction
marker, so it can choose the fact the person actually supplied but cannot insert
or reorder one.

A committed repair may return a transient `repairChange` receipt containing the
actual before/after node mementos and committed revision to its synchronous
owner. Observable store state keeps the base runtime receipt, so this view hint
cannot become a wire value, persisted log, replay signal, or restored animation.

The existing managed envelope is shared by Ask Matter dictation drafts and the
post-admission repair port. It carries one utterance and gets one back,
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
the request text is the answer. For material admission that request text is the
deterministic rule floor, not the raw transcript. The only error codes are
`INVALID_REQUEST` and `REPAIR_FAILED`, and neither reaches the person, because
the browser already holds durable material and keeps the rule floor.

`vocabulary` is a bounded recognition hint, not material structure: terms the person already repeated
in their own visible material, most-used first, carrying no node id, depth, or
ordering. It can only help a model recognise a word that was said —
`adjudicateRepair` gives the hint no special authority, and still applies the
same edit, growth, fact, and order guards. Absent, malformed, or over-long
vocabulary is refused or ignored, and repair proceeds without it.

Bounds: transcript 2,000 code units, vocabulary 24 terms of 32 code units,
request and response 12 KiB, provider deadline scaled to the utterance with a
six-second floor and eight-second ceiling, and a browser deadline 800 ms above
it. The twelve-second store lease remains the final authority.

## Inquiry envelope

Ask Matter is a read-only orientation boundary, separate from transformation.
It cannot name an action or create a tree command. Its context scope is
`selection` when lasso passages exist, otherwise `tree` for the bounded active
working projection. `tree` names the resulting material shape, not every node
in the durable tree: held-aside branches are omitted before this envelope is
constructed and their ids are never sent.

An explicit lasso never widens silently. If its selected passages are held
aside after selection but before submission, the browser keeps
`scope: "selection"`, sends an empty `lineage`, and leaves `thoughtCount` as the
count of the active working tree. That exact request is valid and returns
`NO_MATERIAL`; it never falls back to tree scope. Only tree scope requires an
empty lineage and zero thought count to occur together.

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
passages from one node. With no lasso selection it projects the active working
tree in authored preorder. Both scopes are bounded; the server parses the request whole,
reports a receipt,
and returns `Cache-Control: no-store`. No question, context, answer, or turn list
enters `ThoughtTree`, command history, material archive, or routine logs.
The browser may retain a completed exchange in its separate bounded Ask Matter
record, without copied material context and never as later model input; see
[`reference/inquiry-record.md`](reference/inquiry-record.md).

Bounds: question 500 code points, request 24 KiB, response 8 KiB, lineage 64 nodes, each projected
node 480 code points, total projected context 4,000 code points, and browser
deadline 20 seconds. Answer text is bounded to 1,201 code points. The response is either one text answer or an explicit
unavailable reason; no fallback prose is invented. The live answer adapter is
independently server-gated. Its optional local completed record is not an answer
adapter or model memory and never changes this visible-context, non-mutation
contract.

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
| transform scenario / route / client | 12 / 14 / 16 seconds |

Bounds reject rather than truncate. Stable error codes cover microphone,
transcription, timeout, invalid interaction or plan, revision conflict, tree
invariant violation, bound exceeded, and internal failure. Provider errors never
reach the browser.

`protocolVersion` is checked on every generative envelope, plan, and serialized
snapshot; `requestVersion` is additionally checked on every Elastic or Text Swap
envelope and plan. Mismatches are rejected; migration is explicit.

Tree validation also rejects a record key that differs from `node.id`, invalid
or non-canonical timestamps, an unsafe revision integer, duplicate or unknown
children, parent/child disagreement, a non-empty tree without exactly one root,
cycles, unreachable nodes, and any depth, child, node, or text bound violation.
Validation never repairs.

A command also rejects the wrong tree id, `revision >= Number.MAX_SAFE_INTEGER`,
a text replacement equal to its expected text, a non-leaf inserted node,
non-canonical times or `createdAt > updatedAt`, and any mutation that would
exceed a final bound. One successful command increments revision exactly once.
