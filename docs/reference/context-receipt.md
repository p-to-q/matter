# Context receipt

A context receipt is one deterministic, versioned, human-readable rendering of a
projection of the tree: which passages, in what order, under which parent, at
what depth, whether anything was clipped, and which revision of which tree it
describes. The deliberate Archive receipt (download or "Copy receipt") reads
this projection; future adapters may reuse it without re-deriving structure
from text. Existing model envelopes retain their own bounded contracts; this
note does not claim every AI entry already calls `projectMaterial`.

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
- `material/context-receipt-v2.ts` owns the current v2 writer/parser and exact
  known-version dispatch. `material/context-receipt.ts` keeps the historical v1
  writer/verifier unchanged. Both use the existing asynchronous SHA-256 owner.
- Receipt is Markdown, not a diagram. Mermaid does not participate. Existing
  model adapters retain their bounded contracts; a receipt does not widen them.

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

### Reading scope without inventing relations

The current Archive receipt controls export the active working view, not every
branch and not necessarily the selection used by an Inquiry question. The pure
projection's other addresses do not imply extra export controls. A receipt is
people/AI-readable; creating it neither sends it to a provider nor widens an AI
entry's context.

`parent: null` means no direct parent was carried earlier in this receipt. It
does not prove that the passage was a root in the original document. Likewise,
`clipped: false` means no budget clipping within the chosen address, not that
the whole document was exported. Under `selection`, `thoughts` counts addressed
ranges, which may repeat one permanent node id; positional correspondence
preserves those occurrences but carries no exact source offsets for writing
back. Machine `depth` retains the address-specific meaning in the table above.

The human body alone is a readable excerpt, not the complete receipt: stripping
the wrapper loses scope, identities and clipping flags. SHA-256 detects changes
to the canonical bytes; it is not an authorship signature or a trust decision.

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

## Current grammar — Receipt v2

The owner selected an Atom-like identity/version contract with a Markdown
surface, not a feed or graph export. The default deliberate Receipt actions now
write v2; ordinary Copy and Archive remain distinct.

```text
receipt = front BLANK [outline BLANK] fence "json" LF machine LF fence LF digest LF
front   = "---" LF
          "format: matter-receipt/2" LF
          "projection: material-projection/1" LF
          "tree: " id LF
          "revision: " count LF
          "address: " ("selection" | "lineage" | "working-tree") LF
          "thoughts: " count LF
          "clipped: " ("true" | "false") LF
          "---" LF
outline = shared renderOutlineMarkdown body, one item per carried passage
machine = {"nodes":[{"depth":n,"i":n,"id":"..","parent":".."|null,"truncated":b},...]}
fence   = backticks, longer than any raw carried text run, at least three
digest  = "digest: sha256-" 64 lowercase hex
```

Front keys/order, canonical JSON key order and final LF are closed. SHA-256
covers the exact UTF-8 prefix including the closing-fence LF. Text appears once,
in the human body; machine entries correspond by position. No title, timestamp,
locale, Mermaid or image bytes. There is no extra visible truncation marker:
the header and positional flag disclose clipping.

The body reuses `material/render/list.ts` and its escape/inverse owner: `- `
with two spaces per carried-parent level, continuations aligned with the item
text, a lone `-` for empty text. IDs are not in the body. An explicit receipt
always uses a list, even for one passage; ordinary single Copy stays literal.
Numeric references and backslash escaping preserve exact valid Unicode text
including CR/CRLF/NEL/LS/PS, controls, literal entity-looking text and fences.
The exact inverse is a Matter codec guarantee, not a claim that arbitrary
Markdown viewers render control characters identically.

The carried-parent relation must be representable by the same human list in
the given order. A branch closed by a later root cannot be reopened underneath
that different root: such an input is refused, never reordered, flattened or
given a false parent. Legitimate repeated ranges under `selection` remain
supported. Machine `depth` keeps its address-specific meaning; human indentation
still counts carried parents and must not substitute for that field.

The v2 bound is 34,048,000 bytes, derived from 2,000 nodes × (2,000 UTF-16 code
units × 8 escaped bytes + 1,024 structural/machine allowance). Each expanded
item is checked before joining the body. Structural level is at most 32;
semantic depth and addressed sibling rank are below 2,000. Pathological
multiline indentation can still exceed the byte allowance and is explicitly
refused, not implicitly clipped. Invalid Unicode, unknown versions, extra or
reordered fields, inconsistent structure/count/clipping, noncanonical escapes,
digest mismatch and trailing bytes are refused. Missing digest capability
does not fabricate an unsigned receipt; a deliberate later retry may succeed.

`parseVersionedContextReceipt` dispatches only recognized v1/v2 file prefixes.
`parseContextReceiptV2` knows only v2; the original `parseContextReceipt` knows
only v1. Neither parser imports material or authorizes writes.

## Historical grammar — Receipt v1 (verifier retained)

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
- A node's text is every line of the text behind `> `, split on `\n` only.
  Receipt v1 refuses CR (`\r`), NEL (`U+0085`), LS (`U+2028`) and PS
  (`U+2029`) even though those characters are valid material: Markdown viewers
  may treat them as structural line breaks. It does not normalize or silently
  drop them. Copy and Archive retain their own lossless text contracts. An
  exact escaped representation requires a separately versioned receipt grammar.
  A truncated node ends its quote
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

Copy of a selection is not a receipt. It writes the selected text as it is when
no selected passage contains another, and as an indented plain outline (two
spaces per selected ancestor, plus a nested list for rich editors) when some do;
it carries no ids, digests or headers. A receipt is produced only by an explicit
act in Archive (`Receipt (.md)` downloads the active working tree, `Copy
receipt` puts the same text on the clipboard), never as a side effect of
copying, saving or asking, and a receipt that left the application is a copy
the person chose to make.

## Versioning

Current `format: matter-receipt/2` and historical `matter-receipt: 1` identify
their respective file grammars; `projection: material-projection/1` versions
the projection. A change to either meaning or
shape takes a new number; a parser accepts only the numbers it knows and never
guesses. Adding an address, a field, or a limit semantics is a new version, not
an extension, because the closed grammar is what makes a receipt checkable.

## Historical v1 worked example

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
