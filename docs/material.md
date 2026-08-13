# Material

One rooted tree carries the canvas, document structure, and context boundary.
Matter does not add a separate memory or session system beside it.

A lightweight inquiry may read either the transient lasso selection or a bounded
projection of the complete virtual material tree when no lasso selection exists.
Drafts, pending state, and voice partials are transient chrome. Completed
question/answer exchanges may live in the separate, bounded local Ask Matter
record, but never in the tree, material command history, or material archive.
That record returns only through the existing inquiry surface and never becomes
model context; its adapter boundary is specified in
[`reference/inquiry-record.md`](reference/inquiry-record.md).

Browser speech admission performs punctuation-only normalization at the edge,
then enters the tree immediately. A detachable browser repair port always
computes an ordered locale-rule floor for punctuation, clause signals, spacing,
casing, filler residue, ASR echoes, restarts, corrections, spoken commands, and
high-confidence spoken percentages, decimals, dates, times, versions, and
units. Literal masking and locale-specific classification happen before
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

## Segment

A segment is a punctuation-bounded range derived from a node's current text. It
is never stored. The boundary set is:

```text
CJK     ，  。  ；  ：  ！  ？  、  …  ——
Latin   ,   .   ;   :   !   ?
Other   newline, start of text, end of text
```

- a single segment replacement excludes its terminating punctuation;
- merging adjacent segments includes their internal punctuation and preserves
  only the outer terminating seam;
- adjacent hit segments merge into one range;
- a lasso may address several passages at once; each contiguous run becomes a
  separate transient selection, and non-adjacent hits never merge across a
  gap; one passage may expose the stretch handle, while two or more passages
  form a selection set only, mark their source nodes in the material index,
  and report only a compact count on the canvas;
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
tokens and horizontal whitespace, provided the run contains at least one
delimiter or newline. Trailing horizontal whitespace also joins the final seam.
Leading whitespace belongs to the first content range; leading delimiters are
an unselectable prefix. Text containing only whitespace and delimiters has no
selectable segment.

Two segments are adjacent only when their indices are consecutive and the first
`seamEnd` equals the second `start`. Their merged replacement is
`[first.start, last.end)`. Address validation always uses
`Intl.Segmenter("en", { granularity: "grapheme" })`; locale may guide language
generation but never changes the material address.

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

Lasso selection sets are interaction state. They preserve the visible order of
the addressed passages and support copy, clear, and locate actions at the
rendering edge. They are never serialized, sent as hidden context, or included
in tree command history. Deleting a node remains a separate explicit tree
action; selecting language does not imply deletion.

The full view is depth-first order minus folded descendants. The focus view is
the exact root-to-focus path and ignores folds along that path. A generative
transformation can begin only in focus view; human admission may still attach a
child from the full view. This keeps visible and sent context identical for
every model turn.

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
