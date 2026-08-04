# Changes

Append-only. Newest first. A few lines per entry.

Record a change here when it is durable: protocol, rendering model, provider,
privacy, deployment, license, or workflow. A local reversible change belongs in
a PR note. Multi-slice implementation belongs in a plan.

Format:

```text
## YYYY-MM-DD — one line
Changed:    what is now true
Why:        the reason, not the restatement
Forecloses: what this makes harder or impossible
```

---

## 2026-08-04 — The Markdown tree becomes a visible material outline

Changed: every thought is projected as one logical Markdown document in a
left-edge file outline. Display titles and search terms derive deterministically
from node text but carry no identity. The same canonical path allocator writes
`index.md` paths with numeric sibling order; strict frontmatter keeps node id and
created/updated times. IndexedDB stores one generation-checked bundle per tree,
while sidebar search, copy selection, navigation and status stay transient.

Why: material must be inspectable and recoverable as files without turning the
file browser into another editor or state owner. One tree revision can update
the canvas, file outline and snapshot atomically from the person's point of
view, while storage completion remains honest and retryable.

Forecloses: path identity, watcher-driven local refresh, one OPFS file per node,
lexical reordering, persisted UI selection, and importing a generic VFS beside
the tree engine.

## 2026-08-04 — Expansion projects language without splitting the document

Changed: one validated range derives a transient centered `before / selected +
outer seam / after` projection. The connected source text remains the sole DOM
and accessibility owner. Pointer preview changes only local CSS geometry; after
settlement the presentation box may grow and the pure tree layout repacks.
Viewport clipping never changes the normalized expansion degree.
Words above a downward expansion retain their original inline layout through an
invisible suffix ghost; only the displaced suffix becomes a centered block.
Both physical grips adjust this one downward projection; grip ownership is not
a second semantic direction.

Why: stretching a middle phrase must physically move the suffix instead of
painting a taller rectangle over an unchanged paragraph, while preserving one
addressable document and predictable downstream layout.

Forecloses: durable span nodes, viewport-dependent generation length, duplicate
accessible text, and publishing tree layout on every pointer move.

## 2026-08-04 — Lasso success and expansion remain material-local

Changed: the lasso closing seam appears only when the current path resolves one
valid punctuation selection through the same pure target rule used at release.
A selected range exposes upper and lower physical grips anchored to its first
and last visual lines; both adjust one shared non-negative expansion degree.

Why: gesture qualification alone cannot promise that language will be selected,
and a wrapped text range is not a rectangular resize box. Feedback must follow
the real material address and the handles must remain attached to visible text.

Forecloses: success feedback based only on stroke size, a decorative upper grip,
signed compression hidden inside an expansion gesture, and union-center handles
for stepped multi-line selections.

## 2026-08-03 — Language addresses remain semantic, geometry remains disposable

Changed: lasso selection resolves plain DOM text into one grapheme-safe,
punctuation-bounded address. Pointer ink, Range rectangles and camera geometry
remain transient; resize, fonts, layout or material changes remeasure or clear
them rather than persisting screen coordinates.

Why: reference must survive reflow while its physical measurement cannot. The
separation also keeps pointer movement outside the tree and durable history.

Forecloses: token-wrapped text, stored selection rectangles, cross-node guessing,
and per-pointer-move tree or layout work.

## 2026-08-03 — Human admission is one cancellable voice operation

Changed: voice admission freezes an empty-root or selected-parent target and
commits a verbatim transcript through one human tree command. Browser resources
remain behind a tokened effect boundary; fixture and live transcription share a
strict Matter-native route selected only by server configuration.

The first running adapter is fixture-only. It crosses the real browser recording
and multipart boundary, while live transcription stays unavailable until its
deployment limits and physical-device receipts are proven.

Why: permission, recording, final chunks, transcription and commit cross several
failure domains. One lifecycle owner and commit-time tree revalidation prevent a
late result or changed selection from relocating material.

Forecloses: transcript preview/editing, cached audio retry, client-selected
fixtures or providers, partial streaming, and independent voice lifecycle hooks.

## 2026-08-03 — Hackathon surface returns over rooted geometry

Changed: Matter restores the original frameless paper surface, fixture sentence,
brand, hints, and editing island. The complete derived world can be panned and
zoomed transiently, while child-right, first-child-top, and sibling-left
alignment remain structural and unauthorable. The root column, rather than the
complete tree bounds, anchors the surface, so growth cannot move the thought
already in hand. Pointer capture distinguishes a sub-threshold node selection
from a pan and cancels safely when capture is lost.

Why: the columnar proof established the correct growth rules but its boxes and
connectors made material read as a diagram. The hackathon surface expresses the
intended bodily, direct interaction more accurately.

Forecloses: treating card frames or connectors as product structure, persisting
camera state, and interpreting pan as permission to freely position nodes.

## 2026-08-03 — The retired scene system leaves the build

Changed: the non-archive Arrow feature tree, `/api/arrow/*` routes, scene CSS,
and `ARROW_*` configuration were removed. Matter now owns the only running
document and interface path; provider routes return in Phase 2 with protocol
`0.2` rather than through compatibility aliases.

Why: the old routes encode a coordinate scene, broader agent authority, and a
different multi-mutation contract. Renaming them would make an incompatible
system appear current and preserve two sources of product truth.

Forecloses: deploying the hackathon API accidentally, importing scene types into
Matter code, or preserving the old contract through environment aliases.

## 2026-08-03 — Spatial outline replaces nested-flow presentation

Changed: visible material is arranged as a top-anchored columnar tree with
derived geometry. Depth owns the left edge, a first child aligns to its parent,
and later siblings pack below prior subtrees. The editing rail is a closed
projection of runtime capability and owns no state.

Why: the semantic flow proved the runtime and browser envelope but read as one
long conversation. Product review confirmed that constrained spatial lineage
and the visible editing instrument are part of Matter's form.

Forecloses: treating nested flow as the final renderer, persisting coordinates,
free node movement, a stateful mode bar, and a speculative plugin registry.

## 2026-08-03 — Runtime becomes a reducer with capability ports

Changed: durable tree state, runtime history, navigation, interaction, and
persistence have one owner each. A framework-free reducer describes async
effects; late results carry an operation token and must pass current tree and
revision checks. Browser voice, turn transport, document storage, and archives
enter through four narrow ports.

Why: the `0.1` store and hooks duplicate lifecycle state across Zustand, React
refs, timers, browser resources, and request closures. That path can demonstrate
the gesture but cannot make cancellation, stale results, recovery, or another
host reliably testable.

Forecloses: adding more independent lifecycle hooks, treating a cache as a
document model, and building a generic SDK, event log, or native adapter before
the browser release needs one.

## 2026-08-03 — Roadmap ends at the first release

Changed: the active plan is the only roadmap. Work moves through a small
research → freeze → build and proof loop, across four vertical phases ending at
the first deployed, recoverable version. Only the current phase carries detailed
implementation scope.

Why: foundation quality needs explicit evidence and stable boundaries, while
specifying later product phases before using the first version creates planning
debt rather than robustness.

Forecloses: one plan per phase, perpetual foundation work, reopening frozen
choices by preference, and treating post-release possibilities as commitments.

## 2026-08-03 — Matter-native kernel chosen

Changed: protocol `0.2` uses a small normalized tree engine, an explicit pointer
state machine, real DOM text with pure derived layout, and a storage-independent
snapshot codec.
ProseMirror, tldraw, React Flow, CRDTs, and a fork of the local Murmur repository
are reference sources rather than application foundations. New dependencies are
limited to `idb` and `fflate` when their persistence/export slices begin.

Why: Matter's root, lineage, bounded range action, and exact handle-preserving
undo are smaller and more specific than the editing, canvas, or collaboration
models those foundations impose. Keeping that kernel pure makes its distinctive
behavior testable while still reusing generic transport code.

Forecloses: user-authored coordinates, editor-controlled selection, generic
object patches as domain history, and CRDT state before collaboration has a
product contract.

## 2026-08-03 — Empty document retains identity and revision

Changed: `ThoughtTree` always exists. Before first admission it has
`rootId: null` and no nodes; initialize and undo change the root while tree
revision remains monotonic. Commands carry an engine-checked expected revision
and domain preconditions.

Why: representing emptiness as `null` loses the document's conflict clock when
the first root is undone. A stable empty envelope makes first admission exactly
undoable without a placeholder thought or an asynchronous stale-plan gap.

Forecloses: resetting revision on undo, unconditional inverse commands, and a
fake root that leaks into material or context.

## 2026-08-03 — Contract kept small; admission separated from transformation

Changed: `product.md` and `material.md` are the only always-read product
contracts. Reference notes are optional context. Raw transcription admits human
material without a planner call; the four-signal grammar applies when AI
transforms existing material. Focus and fold are transient navigation, and model
context is the rendered root-to-focus path.

Why: the first thought has no existing anchor or meaningful degree, and forcing
it through a generative plan would overwrite the person's source expression.
Making every reference note mandatory would turn useful context into ceremony.

Forecloses: AI silently rewriting admission, persisted fold state, hidden
retrieval, and directory-shaped documentation requirements.

## 2026-08-03 — Documentation layer rebuilt around the tree

Changed: `docs/` replaced wholesale. Product and material contracts are now
separate from protocol and optional implementation references. Prior documents,
the `soft-input` Vite prototype, ADRs, and completed plans moved to `archive/`.

Why: the documents described a canvas of loosely placed thoughts and a
three-experiment playground. The product had already become one rooted tree with
a punctuation-level address space, and the documents were drifting away from it.

Forecloses: reading the old documents as current. They are kept for trace only.

## 2026-08-03 — ADRs removed in favor of an append-only log

Changed: `decisions/ADR-*.md` archived. This file replaces them. Their content is
compressed into the entries below.

Why: one file per decision was heavier than the decisions warranted, and the
ceremony meant small decisions went unrecorded — the opposite of the intent.

Forecloses: per-decision discussion threads. If a decision needs argument at
that length, it needs a plan, not a record.

## 2026-08-03 — Protocol 0.2: the tree is the document model

Changed: flat object bag replaced by `ThoughtTree` with an explicit root and
authored child order. Positions, `kind`, and `style` removed from the document.
Viewport removed from the document. Human material is inserted under a selected
parent without a generative create envelope. Context is the root-to-focus path;
siblings and descendants are excluded.

Why: one structure now carries four jobs — canvas, file system, context
boundary, and restraint. Session scoping, memory, and canvas discipline stop
being three separate mechanisms.

Forecloses: free spatial placement, infinite-canvas panning, and any
context-selection UI. Also forecloses a retrieval or memory subsystem: if the
path is not enough context, that is a product question, not a retrieval problem.

## 2026-08-03 — Markdown directory tree is the storage format

Changed: a node serializes to one `index.md` inside its own directory; children
are nested directories with numeric-prefixed, slug-suffixed names. Frontmatter
carries identity and time. The directory slug is derived and non-authoritative.

Why: local durability and export share one readable snapshot format rather than
separate data models. In the browser they remain separate physical stores.

Forecloses: a binary or database-native document format, and any schema that
cannot round-trip through a text file a person can read.

## 2026-08-03 — Cross-branch links deferred

Changed: cross-branch links remain an open product question and do not appear in
protocol `0.2`.

Why: weak references may be useful, but an inert wire shape adds weight without
validating behavior. The protocol can be versioned when the need becomes real.

Forecloses: implementing links in passing during the tree migration.

## 2026-08-04 — Lasso success and stretch edges are literal

Changed: the lasso closing seam appears only when the stroke expresses closure
intent and current epoch-bound geometry resolves to one valid contiguous
segment selection. Closure intent combines an absolute near-start gate with a
stable initial-direction angle and two scale-relative gap limits. The ink is a
heavier solid stroke, with no speculative seam at gesture start. Stretch now
has two real grips: the first and last selected visual lines can both adjust one
downward material slot. Both write one non-negative degree.

Why: a dashed seam reads as a promise that releasing will select, so geometric
closure alone was dishonest. A decorative upper grip likewise promised an
operation the system did not perform. Handle positions must come from actual
first/last line fragments, not the rectangular union of wrapped text.

Forecloses: sticky success feedback, dashed closure for empty or ambiguous
loops, a decorative upper grip, negative compression, and whole-selection
centering of grips.

## 2026-08-03 — Stretch expresses degree, not candidate choice

Changed: one two-edge gesture stores only a normalized transient degree beside
a text address. Either physical grip adjusts one downward expansion; neither
replaces text or browses model options.

Why: degree is a continuous human signal used to construct one later turn.
Candidate carousels are ordinal model output and would add a fifth interaction
channel, weaken the `{ text }` response boundary, and make commit semantics
ambiguous before the first end-to-end transformation exists.

Forecloses: option stacks, swipe-to-commit, and generated text during stretch in
the first release. A later proposal must reopen the product grammar explicitly.

---

## Carried from archived ADRs

**Standalone application at a base path** (ADR-0001, 2026-08-02). Matter is an
independent repository and deployment served beneath `ptoq.io/matter` via a base
path, not a module inside the site repository. Keeps protocol, release cadence,
and provider configuration independent of the site.

**Public actions separated from private mutations** (ADR-0002, 2026-08-02). The
agent's action vocabulary is strictly smaller than the reducer's mutation
vocabulary; the reducer keeps removal and reordering so it can construct exact
inverses. This is the technical form of the retained-handle principle and it
survives into `0.2` unchanged.

**Text rendered as DOM material with local feedback** (ADR-0003, 2026-08-02).
Language is real DOM text, not canvas-painted glyphs, so selection geometry,
accessibility, and text rendering come from the platform. Feedback ink is a
local SVG overlay. Survives into `0.2`.

**Create and transform turns discriminated** (ADR-0004, 2026-08-02). The
underlying lesson survives: invalid signals should be unrepresentable. In `0.2`,
human admission is no longer a generative envelope at all; only transformation
crosses the planning boundary.

**Product renamed to Matter** (ADR-0005, 2026-08-02). The `arrow` identifier
predates the name. `0.2` removes it wholesale with no compatibility aliases.
