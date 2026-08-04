# Material

One rooted tree carries the canvas, document structure, and context boundary.
Matter does not add a separate memory or session system beside it.

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
- non-adjacent hits are rejected;
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

For a turn focused on node `X`, both the person and the model work with:

```text
root → … → parent → X
```

This path is the session. Siblings, cousins, descendants, and unrelated branches
are not sent. There is no retrieval step. A focus view must render this same path
without silently truncating it; if a protocol bound is exceeded, the turn is
rejected rather than given hidden context.

Fold and focus are navigation state, not material. Folding hides a node's
descendants in the full tree view. Focusing opens the root-to-node working path.
Neither is persisted in the material document or placed in the generative undo
history.

The full view is depth-first order minus folded descendants. The focus view is
the exact root-to-focus path and ignores folds along that path. A generative
transformation can begin only in focus view; human admission may still attach a
child from the full view. This keeps visible and sent context identical for
every model turn.

## Persistence and export

The canonical serialized snapshot is a nested Markdown directory tree:

```text
matter/
  matter.json                    tree id, protocol version, snapshot revision
  index.md                       root
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
`matter.json` carries only tree-level metadata that cannot live in a node.

The snapshot preserves the complete `ThoughtTree`: current material, structure,
ids, order, times, tree revision, and protocol version. Command and undo history
are runtime state and do not survive export.

In a browser, local durability and a user-visible folder are different physical
stores. IndexedDB keeps one versioned logical Markdown bundle automatically. A
ZIP or directory export is an explicit copy of the same bundle. They share one
codec, not one filesystem object.

## Deliberately absent

- vector store, embeddings, retrieval, or conversation history;
- user-authored coordinates;
- cross-branch links or a node type system;
- persisted fold, focus, selection, pointer, audio, or transcript state.

Memory in Matter is a consequence of structure, not a subsystem.
