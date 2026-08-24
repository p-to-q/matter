# Material

One rooted tree carries the canvas, document structure, and context boundary.
Matter does not add a separate memory or session system beside it.

A lightweight inquiry may read either the transient lasso selection or a bounded
projection of the active working material when no lasso selection exists.
Drafts, pending state, and voice partials are transient chrome. Dormant Text
Swap direction data, when exercised by regression tests, is transient too. Completed
question/answer exchanges may live in the separate, bounded local Ask Matter
record, but never in the tree, material command history, or material archive.
They are not replayed when the inquiry is opened again and never become model
context; its adapter boundary is specified in
[`reference/inquiry-record.md`](reference/inquiry-record.md).

Every final STT path performs the same punctuation-only normalization at the
edge, then admission enters the tree immediately. The floor combines
high-confidence five-locale clause rules with trusted acoustic gaps when the
local Whisper worker can corroborate adjacent segment timestamps against the decoded
waveform. Each locale remains primary while token-anchored English can bridge
mixed speech; unknown locale fallback uses local Unicode script evidence.
Browser callback timing is never treated as a pause. The insertion
plan preserves every spoken word and timing evidence remains transient. A
detachable browser repair port always
computes an ordered locale-rule floor for punctuation, clause signals, spacing,
casing, filler residue, ASR echoes, restarts, corrections, spoken commands, and
high-confidence spoken percentages, decimals, dates, times, versions, and
units. The same late repair may append one conservative sentence-final emoji
for an explicit direct affect or celebration, or reproducibly sample one
low-ambiguity iconographic noun for a word-tail emoji. Questions, negation,
reports, conditions, conflict, protected text, unlisted nouns, and existing
emoji veto it. Literal
masking and locale-specific classification happen before
rendering so an ambiguous bare number word, code span, URL, email, or quoted
phrase remains untouched.
When its existing gate is enabled, it may send only that one utterance, locale,
and bounded vocabulary to `POST /api/repair`; the model may resolve an abandoned
start, contextual filler, correction, or forced grammar seam, and may redraft
that locally into the shortest natural written phrasing, but never receives
a tree, node, address, or repair capability. The rule floor wins on timeout,
rejection, malformed output, or an unavailable provider. A result is a second
`replace-text` command only when the
tree, node, admitted text, timestamp, document epoch, semantic guards, and
twelve-second store lease still match. Reload, expiry, undo, deletion, or a
human edit makes it inert. Model output is accepted only while numeric facts,
units, stable identifiers, vocabulary, speaker, modality, logical relations,
question type, and claim order remain invariant. The first expression stays visible for a short
perceptual floor before any correction, and admission and repair remain
separately undoable. Free rewriting remains an explicit selected-material
transformation.

Moving a node is a durable tree mutation. Exact source and target child-order
mementos make one undo restore the previous virtual file-system projection and
every other tree-derived view.

The lasso may cross the paper boundary as one continuous pointer stroke. Text
hit testing remains limited to visible canvas material. Ink is drawn on the
paper only; past its edge the stroke appears as sparse square particles in the
field's own ink, brightest under the pointer and fading back along the stroke.
That echo is a bounded render-only trace: it carries no selection, address,
history, persistence, or context meaning, and clipping the line changes nothing
about which passages the same stroke selects.

## Node

A node is one passage of language. Voice admits it, the tree orders it, and
serialization writes it as Markdown.

Every passage contains at least one non-whitespace Unicode character. Empty or
whitespace-only text is not material and is rejected at the tree boundary. The
only node whose text is empty is the invisible `document-root`; its text must be
exactly the empty string.

```ts
type ThoughtNode = {
  id: string;
  text: string;
  parentId: string | null;
  children: string[];
  createdAt: string;
  updatedAt: string;
};
```

Before the first admission the tree is empty. Once material exists there is
exactly one root. The empty tree still has document identity and a monotonic
revision; it does not invent a placeholder node. Child order is authored and
meaningful. A node has no stored position: structure determines its presentation.

## Lasso address

A lasso has one transient semantic owner. Geometry may produce many wrapped DOM
rectangles. One contiguous run in one node publishes an Elastic address:

```ts
type LassoAddress = {
  kind: "contiguous-segment-range";
  range: SegmentSelection;
};
```

- adjacent current segments in one node merge into one contiguous range;
- duplicate hits from wrapping collapse to that same range;
- disconnected runs or runs in different nodes become a transient material
  selection set; two or more selections expose no Elastic controls;
- failed measurement or mixed authority is ambiguous and preserves the last
  trustworthy state;
- a trustworthy empty closed loop clears the address;
- one range may cover the whole node, including a multi-clause title.

One successful Elastic address stays in the current Full or Focus view, revalidates
against the current material and layout, and then exposes two Elastic grips plus
no other operation surface. The upper grip expands when pulled upward and the
lower grip expands when pulled downward. The lower grip keeps the selected row
fixed and moves its suffix plus lower material down; the upper grip keeps the
prefix fixed and moves the selected segment, its suffix, and lower material
down. The gesture never
navigates, hides surrounding material, chooses a nearby sentence, or promotes a
convenient first hit.

The address contains node id, exact UTF-16 bounds, and selected text. Request
start freezes tree id, revision, and document epoch around it. Both are transient
render/domain state, not tree, history, persistence, archive, or model context;
a mismatch clears the controls and revokes late work.

`SegmentSelection` uses the strict discriminator `type: "segment-range"`.
Offsets are UTF-16 code units, must start and end on a contiguous run of current
derived segments, and must reproduce `selectedText` exactly. `text-swap/2`
accepts either one exact segment or the exact complete-node range created by a
passage-local AI click; it never accepts an arbitrary partial substring.

## Punctuation segment

A segment is a punctuation-bounded range derived from a node's current text. It
is never stored. The boundary set is:

```text
CJK     ，  。  ；  ：  ！  ？  、  …  ——
Latin   ,   .   ;   :   !   ?
Other   newline, start of text, end of text
```

- a one-segment range excludes its terminating punctuation;
- adjacent segments in one node may merge; their internal seams remain inside
  the selected text and only the final segment's outer seam stays protected;
- exactly one contiguous current `segment-range` may expose the two Elastic
  Language grips; two or more passage ranges become material selection mode;
- Text Swap accepts one exact segment or one exact whole node; Control Fog owns
  the whole-node Point-and-Talk entry while Lasso continues to expose Elastic;
- offsets are UTF-16 code-unit offsets and must land on grapheme boundaries;
- text changes, resize, or zoom invalidate selection geometry.

The derived address is precise:

```ts
type TextSegment = {
  index: number;
  start: number;     // inclusive replaceable content
  end: number;       // exclusive replaceable content
  seamEnd: number;   // exclusive trailing seam
};
```

`[start, end)` is non-empty. All three offsets are grapheme-safe and ordered.
Single punctuation graphemes are delimiters. `——` and longer em-dash runs
delimit, while one `—` remains content. CRLF is one newline token. After
non-whitespace content, the seam is the maximal run containing delimiter/newline
tokens, horizontal whitespace, and closing punctuation that follows a proven
terminal delimiter, provided the run contains at least one delimiter or newline.
Contextual quote marks remain content unless their position proves they close
that segment. Trailing horizontal whitespace also joins the final seam.
Leading whitespace belongs to the first content range; leading delimiters are
an unselectable prefix. Text containing only whitespace and delimiters has no
selectable segment.

A selection must match one contiguous run of derived segments. Address
validation uses `Intl.Segmenter("en", {
granularity: "grapheme" })`; locale may guide language generation but never
changes the material address.

Structure is coarse; address is fine. A person speaks a passage, then points at
a clause inside it.

## Lineage

One document has one structural root, but that root is not material. Its ordered
children are the visible first-level passages. Speaking with a visible passage
selected adds a child beneath that passage; speaking with no selection adds a
first-level passage. Dropping a passage onto another
passage makes it a child; dropping into a sibling gap changes its exact order;
dropping on unrelated paper attaches it to the structural root as a first-level
passage. The canvas title is separate document metadata and may be renamed
without changing the first passage or its lineage.

For a turn focused on node `X`, both the person and the model work with:

```text
first visible passage → … → parent → X
```

This path is the session. Siblings, cousins, descendants, and unrelated branches
are not sent. There is no retrieval step. A focus view must render this same path
without silently truncating it; if a protocol bound is exceeded, the turn is
rejected rather than given hidden context.

Fold and focus are navigation state, not material. Folding hides a node's
descendants in the full tree view. Focusing opens the root-to-node working path.
Neither is persisted in the material document or placed in the generative undo
history.

The working context is a separate transient projection: a person may hold one
visible node and its descendants aside with the material-index `−` control.
Those passages remain faintly legible but are unavailable to pointer selection,
lasso, inquiry, and later model-facing work until the `+` control returns them.
It is never material, history, export, archive, or hidden retrieval. See
[`reference/working-context.md`](reference/working-context.md).

The lasso address is interaction state. It is never serialized, sent as hidden
context, or included in tree command history. Deleting a node remains a
separate explicit tree action; selecting language does not imply deletion.

The full view is depth-first order minus folded descendants. The focus view is
the exact root-to-focus path and ignores folds along that path. A generative
transformation can begin in either view from one contiguous current segment run
on an active node; Focus additionally requires that node to be the exact Focus
node. In Full, surrounding material stays visible but is not implicit
model context: the request carries only the authored root-to-selected-node
lineage. Elastic Language requires a positive settled stretch; releasing it
starts the fixed `expand-in-place` turn without recording, audio, or transcript.
Starting Voice admission cancels any pending Elastic turn and passes a null
selection to the stretch lifecycle until admission is idle again. The semantic
lasso address may remain transiently available for revalidation, but its grips
and network authority do not coexist with recording or transcription.
Point and Talk publishes one whole-node Text Swap address from the passage-local
AI mark. Its direction, recording, request, and status are transient; Full-view
Voice admission remains separate and unchanged.

The two grips own one degree and one downward presentation band. Pulling the
lower grip down keeps prefix and selection fixed and moves the suffix down.
Pulling the upper grip up keeps its upper seam and prefix fixed while moving the
selection plus suffix down. The mirrored physical directions open the same
non-negative material pocket. The resulting bottom extent is transient layout input; it never
enters the document or a network envelope.

Text Swap audio, partial transcript, final direction,
carrier choice, pending state, and presentation receipt remain transient
interaction state. None enters the
tree, command history, persistence, archive, routine logs, or later model
context. The local typed field feeds the same direction port as its Voice
alternative and has the same lifetime; the current passage mark addresses the
complete node, while the retained lasso grammar may address one exact segment.
A successful swap contributes only the complete
replacement text through one tree command; its exact inverse remains available
to pointer Undo. The active working projection — rather than every faintly
visible held-aside passage — is the exact context boundary for either model
turn.

## Persistence and export

The canonical serialized snapshot is a nested Markdown directory tree:

```text
matter/
  matter.json                    tree id, title, protocol version, revision
  index.md                       invisible document root
  001-women-huainian/
    index.md
    001-name/
      index.md
```

Each `index.md` contains the current node text and minimal frontmatter:

```markdown
---
id: thought_01k9m2rc4v8
createdAt: 2026-08-03T09:12:44.031Z
updatedAt: 2026-08-03T09:31:02.884Z
---

我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。
```

Identity lives in frontmatter. Parent and children derive from nesting; sibling
order derives from the numeric prefix; the readable slug carries no identity.
`matter.json` carries only tree-level metadata that cannot live in a node. The
document root records `role: document-root` in frontmatter so export/import does
not turn it back into visible material.

The snapshot preserves the complete `ThoughtTree`: current material, structure,
ids, order, times, tree revision, and protocol version. The browser pairs that
snapshot with its local inverse journal in one IndexedDB record, so accepted
commands remain reversible after reload. Archive export deliberately contains
only the material snapshot: importing an archive establishes a new undo boundary.

In a browser, local durability and a user-visible folder are different physical
stores. IndexedDB keeps one versioned logical Markdown bundle and its paired
inverse journal automatically. A ZIP or directory export is an explicit copy of
the bundle only. They share one codec, not one filesystem object.

## Deliberately absent

- vector store, embeddings, retrieval, or material/model-fed conversation
  history; the bounded local Ask Matter record remains the explicit exception
  described above;
- user-authored coordinates;
- cross-branch links or a node type system;
- persisted fold, focus, selection, pointer, audio, or transcript state.

Memory in Matter is a consequence of structure, not a subsystem.
