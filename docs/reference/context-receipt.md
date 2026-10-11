# Context receipt

A context receipt is one deterministic, versioned, human-readable rendering of a
projection of the tree: which passages, in what order, under which parent, at
what depth, whether anything was clipped, and which revision of which tree it
describes. It exists so that model context, a deliberate "Copy with context",
and later renderers can all read one projection instead of each re-deriving
structure from text.

It is a projection, never an authority. The tree stays the only durable
material, only the tree engine mutates it, and nothing parsed from a receipt is
ever fed back into the tree. The Archive stays the lossless representation of a
document; a receipt carries canonical text and relations for reading and
checking, not enough to rebuild a document.

## Layers

```text
tree + address + limits ──projectMaterial──▶ MaterialProjection ──render──▶ receipt (Markdown)
                                                    ▲                            │
                                                    └────────── parse ◀──────────┘
```

- `material/material-projection.ts` owns the projection. `projectMaterial` is
  pure and deterministic and reads the tree only for the addressed nodes.
- `material/context-receipt.ts` owns the Markdown grammar. `renderContextReceipt`
  and `parseContextReceipt` are async because the digest uses `crypto.subtle`, as
  persistence already does.
- Mermaid, JSON-LD, or any prompt adapter would read a `MaterialProjection`.
  None of them is the source format.

## Addresses

| Address | Takes | Order | `depth` means |
| --- | --- | --- | --- |
| `selection` | lasso passages (partial text allowed) | as presented | presentation index |
| `lineage` | a focus node id | root to focus | position on the path |
| `working-tree` | the active view and the active node ids | the view's own | the view's depth |

These are the same one-meaning-per-mode depths as the inquiry projection, and a
test holds the two sequences equal. The synthetic document root is structure and
is never a node. An unknown focus or an empty selection is an empty projection,
not an error. One node may appear more than once under `selection`, once per
range; under the other addresses an id appears at most once.

`parentId` is the real tree parent, but only when that parent was carried earlier
in the same projection; otherwise it is `null`. A receipt must not name a node it
does not carry, so a document-root parent, a held-aside parent, a folded-away
parent and a clipped-away parent all read as `null`. `siblingIndex` is the rank
among the parent's children that the address includes, in tree order. It is not
the raw index in the child list, because the raw index would count held-aside
siblings and so reveal how many exist.

## Limits

With no limits the projection clips nothing a valid tree can hold. A caller may
pass `maxNodes`, `maxNodeCodePoints` and `maxTotalCodePoints`; truncation counts
code points and never splits a surrogate pair. `thoughtCount` is the size of the
addressed set before clipping, and `clipped` is true exactly when a limit dropped
or truncated anything.

## Grammar

```text
receipt  = front BLANK [outline BLANK] fence "json" LF machine LF fence LF digest LF
front    = "---" LF
           "matter-receipt: 1" LF
           "projection: material-projection/1" LF
           "tree: " id LF
           "revision: " count LF
           "address: " ("selection" | "lineage" | "working-tree") LF
           "thoughts: " count LF
           "clipped: " ("true" | "false") LF
           "---" LF
outline  = one entry per node, in order
entry    = indent "- " id LF  indent "  > " line LF ...   ("  >" for an empty line)
indent   = two spaces per structural level of the carried nodes
machine  = {"nodes":[{"depth":n,"i":n,"id":"..","parent":".."|null,"truncated":b},...]}
fence    = backticks, longer than any backtick run in any carried text, at least three
digest   = "digest: sha256-" 64 lowercase hex
```

- The front matter keys are fixed and in this order. There is no title, no
  timestamp, no host or application field.
- A node's text is every line of the text behind `> `, split on `\n` only, so
  `\r` and every other character round-trip. A truncated node ends its quote
  with the line `> […]`. The machine block, not the marker, is authoritative for
  `truncated`, so a node whose own last line is `[…]` is not mistaken for one.
- The machine block is canonical JSON: sorted keys, no whitespace, no text. The
  parser requires it to equal its own re-rendering.
- The digest is SHA-256 over the exact UTF-8 bytes of everything before the
  digest line, including the newline after the closing fence.
- Node text is never interpreted. Front matter, fence and digest are located by
  position, and every text line sits behind `> `, so text cannot forge a field, a
  bullet, the machine block or the digest.

`parseContextReceipt` is strict and closed. It rejects anything the renderer
would not have produced: a wrong version, key order or extra key, an unknown
address, a digest mismatch, trailing bytes, an outline that disagrees with the
machine block, ids that repeat outside `selection`, a parent that was not carried
earlier, `thoughts` or `clipped` that disagree with the nodes, and input beyond
`MAX_CONTEXT_RECEIPT_BYTES`, which is derived from the tree's node and text
bounds. Render refuses the same cases, so a receipt that parses is one this code
could have written.

## What it deliberately omits

- Held-aside material. A working-tree caller passes only active ids. The receipt
  holds no withheld text, id, count or position; sibling rank is taken over the
  addressed set for that reason. A lineage caller must restore the focus lineage
  first, as focusing already does.
- Titles, timestamps, images, roles and every other node field.
- Any disclosure that Wiki settled a heard form. The receipt carries canonical
  text only, because the occurrence registry is transient and a durable flag
  would make the receipt differ across reloads.
- Anything about the person, device, locale or application.

## Privacy

Native Copy stays literal text. A receipt is produced only by an explicit act,
never as a side effect of copying, saving or asking, and a receipt that left the
application is a copy the person chose to make.

## Versioning

`matter-receipt: 1` versions the file grammar and `projection:
material-projection/1` versions the projection. A change to either meaning or
shape takes a new number; a parser accepts only the numbers it knows and never
guesses. Adding an address, a field, or a limit semantics is a new version, not
an extension, because the closed grammar is what makes a receipt checkable.

## Worked example

A working-tree projection of three active passages. A fourth branch is held aside
and appears nowhere. The second passage has four lines, one of which is `---`.

````text
---
matter-receipt: 1
projection: material-projection/1
tree: tree_golden
revision: 7
address: working-tree
thoughts: 3
clipped: false
---

- a
  > Matter keeps thought as material.
  - b
    > Branches hold relations.
    > ---
    > `code` > quote
    > - not a bullet
  - c
    > 第三段 שלום 😀

```json
{"nodes":[{"depth":0,"i":0,"id":"a","parent":null,"truncated":false},{"depth":1,"i":0,"id":"b","parent":"a","truncated":false},{"depth":1,"i":1,"id":"c","parent":"a","truncated":false}]}
```
digest: sha256-b8bb7e0de01bdffff3c73268c89a96da55e23997248be096aab2b9eb81cd2fc2
````

This text is the golden in `features/matter/material/context-receipt.test.ts`;
the test fails if the renderer and this example drift.
