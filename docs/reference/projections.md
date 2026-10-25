# Material projections

One authored tree is the material authority. The index, canvas, clipboard,
context receipt, Archive, and model envelopes are projections with different
jobs and explicitly different scopes. Shared meaning does not require an
identical byte format or a broader context. A renderer or parser never writes
back to the tree by implication.

This note records the current outputs, not a format registry. The active plan
owns changes. Exact Receipt v1/v2 rules remain in
[`context-receipt.md`](context-receipt.md); archive and storage rules remain in
[`virtual-file-system.md`](virtual-file-system.md).

## Reading purpose and coherence

The product goal is a readable path through material, not a visible protocol.
Markdown is a familiar surface; permanent identity, explicit scope and closed
versioning make the deliberate receipt checkable. The Atom analogy concerns
that contract, not a feed, a diagram or another format to implement.

Here coherence means passage boundaries and text, authored ancestry and sibling
order, within a declared or deliberately selected scope. It does not mean every
output includes the entire document. The index and export read the same authored
material, but Copy carries full passage text, not shortened index labels or
canvas coordinates. An ancestral path can show how material develops; it does
not assert speaker roles, causality, an answer-to edge or a chat transcript.
The separate Inquiry record is not material, Archive content or later model
context. Future manual dashed associations are not implemented or exported.

| Person's task | Existing output | What to expect |
| --- | --- | --- |
| Paste readable material into an editor or AI | Copy | Single passage stays literal; unrelated passages stay a literal blank-line join; nested selections use a Markdown outline and matching safe HTML. No ids, header or checksum. |
| Share/check a bounded context with stable identities | Receipt (.md) / Copy receipt | One human outline, with explicit scope/version and positional machine metadata. Only this deliberate action adds the formal wrapper; no images or automatic AI request. |
| Recover or move the complete material document | Archive / Import | A Matter ZIP with one `index.md` per passage, document metadata and available verified image bytes. Import validates the archive and requires confirmation before replacing material. |

These boundaries keep ordinary reading light. Receipt's machine block does not
repeat the text, and its metadata is not added to every copy. Neither surface
needs Mermaid or a new grammar to express the current authored tree.

## Concrete outputs and their limits

For a selected parent and two direct children, Copy produces this plain text;
rich editors also receive the corresponding nested HTML list:

```md
- Why keep intelligence local?
  - Privacy and personal control.
  - Work without an internet connection.
```

A single selected passage instead copies its exact text, without `- ` or a
header. Several unrelated passages are joined with a blank line, without
escaping authored Markdown. That convenient flat text is not an unambiguous
node-boundary encoding if a passage itself contains blank lines or Markdown.
Ordinary Copy is for reading and sharing, not exact machine round-trip recovery.

An omitted ancestor is an important difference. In `A → B → C`, selecting
only A and C gives Copy `- A\n  - C`: C belongs under A in the selected outline,
but A is not thereby asserted to be C's original direct parent. A receipt of
that addressed set instead has this human body:

```md
- A
- C
```

Both receipt machine entries have `parent: null`: C's real direct parent B was
not carried. The receipt does not fabricate an A-to-C edge or include B's text
or identifier. The two outputs share material meaning, not identical relation
encodings. Keep an ancestry path selected when that path is needed for reading;
use Archive when the whole original structure must survive.

Receipt adds the existing fixed header, one positional JSON block and SHA-256
around its outline; the exact grammar is in
[`context-receipt.md`](context-receipt.md). The digest detects byte changes, not
authorship or trustworthiness. Copying only its outline drops identity, scope
and clipping evidence and is not equivalent to sharing the complete receipt.

## Import is a separate promise

Current Import accepts a validated Matter ZIP, not an arbitrary `.md`, Receipt,
Mermaid file or clipboard outline. Archive metadata and passage front matter
identify the document and original tree; plain indentation is never silently
interpreted as a durable mutation. Wrapping a receipt in a ZIP does not make it
an archive. Import starts a new Undo boundary; it does not restore the previous
Undo journal, Wiki or Inquiry record. Export reports omitted image bytes.
Import can preserve an image pointer without its bytes; the passage then shows
a missing-state plate rather than a fabricated picture.

Generic Markdown import is not part of this change. If evidence later justifies
it, it needs its own explicit parsing, preview and confirmation contract for
ambiguous lists, headings and existing identities; it must not weaken Archive
validation or turn an ordinary paste into inferred tree structure.

## Current projection scopes and owners

| Projection | Address and scope | Structure and omissions | Current owner |
| --- | --- | --- | --- |
| Material index | document tree, with navigation/search/select presentation | authored ancestry and order; selection context can be removed by the person | `components/material-file-tree.ts`, `material/selection-session.ts` |
| Canvas | current full/focus layout and transient camera | position derives from structure; no authored coordinates; the trail adds no context or selection authority | `layout/columnar-layout.ts`, `layout/operation-trail.ts`, `components/operation-target.ts` |
| Index Copy | checked rows, including ancestors still accepted as context | selected-ancestor nesting, no gaps for excluded parents; literal text for a flat selection, escaped Markdown list for a nested selection, corresponding safe HTML; no ids or digest | `material/material-files.ts`, `material/selection-outline.ts`, `material/render/list.ts`, `material/render/html.ts` |
| Context receipt | deliberate active working-tree export; pure projection also supports selection and lineage | v2 shared human Markdown list plus positional carried parents, addressed sibling ranks, depth, clipping, revision and digest; v1 remains verifiable; no excluded identifiers, Wiki facts, image bytes or chat record | `material/material-projection.ts`, `material/context-receipt-v2.ts`, `material/context-receipt.ts`, `material/receipt-actions.ts` |
| Archive | complete document snapshot, irrespective of transient focus/fold/hold state | identities, timestamps, order and image pointers, plus available verified binary image entries; no Undo journal, Wiki or inquiry record; export reports omitted bytes, import accepts absent bytes and passages show missing-state plates | `persistence/snapshot-codec.ts`, `persistence/archive-transport.ts`, `interaction/archive-pictures.ts` |
| Elastic / Text Swap | exact addressed passage/range and visible root-to-target lineage | no siblings, hidden retrieval, earlier questions or Wiki; authority is the submitted immutable basis | `components/use-fixed-expand-turn.ts`, `interaction/use-text-swap.ts`, `protocol/transform-contract.ts`, `protocol/text-swap-contract.ts` |
| Inquiry | lasso selection, or bounded active working view | each question takes a fresh bounded snapshot, order/depth and explicit clipping; earlier answers do not become context | `material/inquiry-context.ts`, `material/working-context.ts`, `server/inquiry-harness.ts` |

`selection`, `lineage` and `working-tree` name address meanings, not permission
to send every relation the full document holds. `projectMaterial` counts and
ranks only the addressed set; an absent parent is `null`, not a dangling id.
Selection depth in that projection is the presented range index; Copy's depth
is instead the number of selected ancestors. Do not substitute one for the
other merely because both fields are named depth.

The existing AI envelopes already preserve their own context contracts. A
small structural-question evaluation did not justify adding parent fields.
Reopen that decision with a reproducible answer/context failure, especially
clipping or disjoint selections, rather than silently widening all envelopes.

## Conformance work

`material/projection-conformance.test.ts` now characterizes synthetic authored
fixtures in 14 cases: omitted ancestors, repeated same-node ranges, actual
fold/hold, code-point clipping, excluded/empty addresses, hidden sibling
rank/digest stability, missing image bytes through ZIP, and the five v1 line
separator refusals. It compares each output's promised properties, not
identical bytes across intentionally different addresses. Copy/Archive retain
whole authored text where Inquiry/Receipt intentionally carry a bounded view.
The omitted-parent case checks exact Copy and current v2 human bytes alongside
historical v1 verification, so selected ancestry cannot silently become a false
direct-parent claim. The 2026-10-16 reading clarification passed 143 focused
tests across five files, the documentation checks and an independent semantic
review; that is not a new full-suite, browser or release qualification.

V2 adds escaped-separator round trips, malicious structure/fences, literal
entity references, human/machine preorder coherence, byte/indent bounds and
strict version/hash refusal. Clipboard completion rechecks document ownership
after both rich and plain writes. These focused proofs do not constitute the
full Archive ordering/timezone or deployed transport matrix. Missing ZIP image bytes are reported,
not silently repaired or treated as proof that the Archive includes every byte.

Changing the receipt body or machine grammar requires a new version and a
frozen v1 verifier. Receipt contains no derived Mermaid. Archive ordering and
timezone reproducibility need their own exact byte proof. Beyond the explicitly
versioned receipt, these projections add no registry, import surface or node kind.
