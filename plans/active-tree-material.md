# Plan: Matter first release

Status: Active  
Current phase: 2 — Thought can be handled  
Destination: the first usable public release at `ptoq.io/matter`

This is the only roadmap. It ends at the first release; it is not a forecast of
Matter as a platform.

## Release line

The release is complete when a person can, without a keyboard:

1. speak a root thought and another thought beneath a selected node;
2. move between the full tree and one exact root-to-focus working path;
3. lasso a punctuation segment, stretch it, speak direction, and receive one
   local material change;
4. undo that change with the pointer;
5. reload and recover the same tree;
6. export it and later import it on a supported browser;
7. complete the same path in fixture and live modes on the deployed origin.

The release ends there. Accounts, sync, collaboration, touch parity, streaming,
split/merge, cross-links, redo, tool prediction, retrieval, and a public SDK are
not later phases of this plan. They remain outside the first release.

## How a phase moves

Each phase has three states. It does not create a new plan or document set.

### Research

Research only questions that can change the next build slice. Inspect the
existing code, a relevant reference, or a small prototype; stop when one
implementable answer and its proof are clear. The output is a short update to
this plan or an existing reference, not a research report.

### Freeze

A freeze names what the build may rely on: boundary, data shape, interaction,
acceptance proof, and non-goals. During build, frozen choices are not reopened
because another architecture is interesting.

A freeze may reopen only when one of these produces contrary evidence:

- a focused test or browser behavior;
- a measured performance, durability, or security failure;
- a provider contract that cannot satisfy the frozen boundary;
- a correction to the product intent.

Record the evidence and revised choice in the same reference or
[`docs/changes.md`](../docs/changes.md), then freeze again. Preference alone is
not evidence.

### Build and proof

Build one end-to-end slice through the real boundary. A phase finishes with its
receipt passing, the fixture still usable, and no temporary parallel model left
behind. Run the narrow focused checks while working; finish with `npm run check`
and the relevant Playwright flow.

Only the current phase is implementation-detailed. The next phases state their
outcome and freeze boundary so they do not accumulate speculative phase debt.

## Freeze ledger

| Area | State | Frozen answer |
| --- | --- | --- |
| Product loop | Frozen | admission and one four-signal transformation; one perceivable pointer-undoable change |
| Document | Frozen | one normalized `ThoughtTree`, empty root state, monotonic revision |
| Agent boundary | Frozen | exact lineage in; model returns `{ text }`; server constructs one action |
| Text address | Frozen | punctuation segments over grapheme-safe UTF-16 offsets |
| Presentation | Re-frozen | top-anchored columnar tree; measured text, pure derived geometry, no authored coordinate |
| Editing tools | Frozen | closed context projection; right/bottom rail owns no runtime or tree state |
| Local return | Frozen | Markdown `SnapshotBundle`, IndexedDB durability, ZIP export/import |
| Visual composition | Local to each phase | quiet Matter form; refine from the running interface, not a second design system |

The foundation freeze was completed on 2026-08-03 after source research and a
second adversarial review. Its evidence lives in
[`docs/reference/foundation.md`](../docs/reference/foundation.md) and the nearby
references. It does not need another foundation phase.

## Phase 1 — Rooted Matter

State: Proven.

Outcome: the running fixture is Matter `0.2`, rendered as a rooted material tree
rather than the coordinate-based Arrow scene.

Build slice:

- rename the `arrow` namespace, API paths, environment names, and errors to
  `matter` without compatibility aliases;
- add the empty/rooted tree model, invariant validator, one-mutation engine,
  exact inverse history, and full/focus selectors;
- render fixture root and children through derived top-anchored columns;
- support child insertion, focus, fold, and pointer undo;
- remove positions, viewport, styles, free movement, links, and per-node
  revision arrays only after the rooted fixture works.

Receipt:

- empty ↔ root keeps document identity and monotonic revision;
- insert/remove subtree and sequential undo restore exact material;
- wrong tree id, stale revision, invalid structure, and failed undo change
  nothing;
- DOM order follows authored preorder; focus shows the exact lineage;
- fixture works at laptop and narrow widths without a keyboard.

Non-goals: lasso rewrite, live transcription, persistence, import/export, and
visual expansion beyond what the rooted fixture needs.

### Slice 1A — Pure tree kernel

State: Proven.

```text
Outcome:    rooted material can be committed, selected, and exactly undone
Boundary:   features/matter/tree only
Invariants: one mutation, monotonic revision, no partial failure, no side effects
Proof:      command/inverse, invalid memento, lineage/fold, and bounded-history tests
Non-goals:  React, namespace migration, voice, geometry, persistence, and visual form
```

The kernel uses explicit `treeId`, `revision`, ids, and ISO time values. Runtime
history is bounded by entry count and retained inverse bytes. Full-tree and
focus projections come from pure selectors; the focus selector is also the
lineage used for model context. The slice ends with an independent verifier pass
against this contract before it is connected to the running fixture.

Receipt, 2026-08-03: 41 focused tests cover the engine, atomic bounded history,
and selectors. The first verifier pass rejected shared command/memento aliases,
non-atomic history capacity, and cyclic malformed projection. The revised slice
copies ownership at commit boundaries, publishes material and history together
only when the inverse fits, and guards projection. A second independent pass
found no remaining issue in the frozen boundary. Full `npm run check` passed
after the initial implementation; the revised slice separately passed focused
tests, typecheck, lint, and diff check.

Next slice: connect this kernel to one rooted fixture renderer and remove the
parallel scene path only after the no-keyboard laptop/narrow receipt passes.

### Slice 1B — Rooted runtime and spatial presentation

State: Proven.

```text
Outcome:    a person can handle a rooted fixture through select, fold, focus,
            child insertion, and pointer undo at laptop and narrow widths
Boundary:   navigation/session → thin store → pure layout/tool projection → page
Invariants: tree+history publish atomically; navigation is transient; spatial
            order is authored order; focus is exact lineage; no authored coordinates
Proof:      runtime failure matrix, two-viewport pointer receipt, production
            2,000-node measurement, independent verifier
Non-goals:  voice, lasso, live API, persistence, import/export, virtualization
```

The runtime owns `{ tree, history, navigation, lastError }`. Pure session
operations reconcile focus, selection, and folded ids whenever material changes;
Zustand only publishes their result. It exposes named human actions rather than
generic private mutations. Fixture ids, timestamps, text, and history limits are
deterministic inputs. Seed material is constructed through real commands, then
its bootstrap history is cleared so it is not presented as a person's undo.

The renderer uses native nested `ul` / `li` flow. It does not claim ARIA treeview
semantics, which would require a different composite-widget keyboard model.
Buttons own select, disclosure, focus, add-child, exit-focus, and undo actions;
folded descendants are unmounted. Depth appears through spacing and one quiet
lineage spine, not cards, links, coordinates, or measured geometry. The page
scrolls vertically and must not overflow horizontally at `390×844`.

Failure cases are part of the slice: missing parent or focus, bounds, inverse
capacity, empty undo, repeated clicks, undo removing selected/focused/folded
nodes, malformed bootstrap, long text, depth and child limits, narrow wrapping,
reduced motion, and browser focus. A failed material action preserves tree,
history, and navigation ownership references; navigation reconciles in the same
successful publication as material.

CI proves semantic behavior at `1280×800` and `390×844` without calling
`page.keyboard`: DOM node ids equal the pure projection, fold removes descendants,
focus equals exact lineage, insertion and undo are pointer-complete, and no page,
console, or horizontal-overflow error occurs. Native keyboard accessibility is
still retained and checked separately; “pointer primary” does not remove it.

A production-build receipt uses a fixed realistic 2,000-node fixture. After
three warmups, twenty fold/unfold and focus/full samples record pointer-to-paint
median, p95, maximum, and long tasks. The slice reopens if, on the same machine,
two of three runs have p95 at least `200 ms`, or an operation-related long task
reaches `100 ms`. Results between `100–200 ms` p95 or `50–100 ms` long task need
profiling or explanation. Virtualization is forbidden without this evidence.

Product correction, 2026-08-03: the semantic renderer proves runtime behavior,
accessibility, responsive wrapping, and the performance envelope, but its
vertical nested flow reads like one long conversation. It is not the final
spatial form. Matter needs a constrained two-dimensional rooted canvas: every
generation moves one column to the right; a parent's first child aligns to its
top, while siblings share one left edge and pack downward. Coordinates remain
derived and unauthorable. The right-side editing instrument also remains a
product requirement, but returns as a context-derived tool system rather than
the old hard-coded canvas toolbar. Layout and tools now have separate pure
boundaries before presentation implementation continues. The proven tree,
history, navigation, readonly store, fixture, and performance harness remain.

Presentation re-freeze, 2026-08-03: implement the spatial outline as a measured,
top-anchored columnar tree. Same-depth nodes share a left edge; the first child
shares the parent's top; later siblings pack beneath the previous sibling's
complete visible subtree. The right editing rail is a pure projection of
selection, view, history, and interaction capability into a closed `ToolIntent`.
The first proof is the two pure systems and their adversarial tests; the second
replaces the semantic renderer and repeats laptop, narrow, and 2,000-node
browser receipts. Details live in the two nearby reference notes, not another
phase document.

After the rooted browser receipt passes, the coordinate UI, scene store,
viewport/move paths, and their e2e tests leave the running path in the same
slice. Provider routes remain temporarily untouched so an inactive `0.1` scene
contract cannot be mechanically renamed and mistaken for `0.2`.

### Slice 1C — Namespace and inactive surface burial

State: Proven.

The Phase 1 cutover is still one `0.2` migration with no aliases, but its proofs
are staged. `1C` removes every remaining `arrow`/scene namespace and environment
name. Because voice and transformation are outside Phase 1, the preferred path
is to remove the inactive `0.1` API/client/server surface and rebuild the
documented `0.2` routes in Phase 2. Renaming `/api/arrow/turn` to `/api/turn`
without changing its scene protocol is explicitly forbidden.

Receipt, 2026-08-03: the entire non-archive `features/arrow/` implementation,
three `/api/arrow/*` routes, old scene CSS, and every `ARROW_*` environment name
were removed rather than renamed. `MATTER_BASE_PATH` is the only current mount
configuration. Phase 2 will introduce provider settings together with the
Matter-native envelopes and route validation; no inactive compatibility surface
remains in the build. The clean production route manifest contains only `/`,
`/performance`, and `/icon.svg`; full checks and the laptop/narrow pointer
receipt pass as package `0.2.0`.

Semantic-prototype evidence, 2026-08-03: two pointer-only Chromium receipts pass at
`1280×800` and `390×844`, covering authored order, fold/unfold, exact focus,
full-tree insertion, pointer undo, selection, console/page
errors, and horizontal overflow. Visual review at both widths kept text and the
lineage spine primary; selected-node controls stay local to material.

The first production 2,000-node semantic run failed the performance freeze: permanent controls made
23,357 elements and produced a `180 ms` long task. Mounting controls only for the
selected node reduced the DOM to 6,874 elements. On the same machine, three
subsequent rounds measured fold p95 `58.8–59.6 ms` and focus p95 `58.4–59.2 ms`;
the maximum long task was `64 ms`. This clears the blocker and leaves one known
optimization signal on full 2,000-node subtree remount. It is not evidence for
virtualization because the interaction p95 is below `100 ms` and default fixture
contains five nodes.

Spatial-renderer receipt, 2026-08-03: the corrected renderer passed the same
production 2,000-node walk through the closed tool rail. Across three rounds,
fold/unfold p95 was `78.3–79.5 ms` and focus/show-all p95 was `75.4–84.6 ms`;
the maximum long task was `91 ms` with 6,046 elements. This remains below the
frozen blocker and keeps the known 50–100 ms optimization signal. The default
five-node product path still does not justify virtualization.

Hackathon-surface correction, 2026-08-03: the running fixture now starts with
the original single sentence and restores the frameless paper field, original
brand, version hint and right editing island without restoring scene positions.
The pure columnar layout still owns every relationship; a separate transient
camera pans or zooms the complete world. Its root-column anchor prevents new
rightward or downward material from shifting the current root. Pointer capture
resolves click versus pan by device threshold and recovers on cancellation.
Focused interaction tests cover the viewport reducer and fixture-version undo;
the laptop/narrow browser receipt covers root stability, child-right and top
alignment, sibling-left packing, fold, focus, fixture undo and pan without tree
revision.

### Confidence gate

The foundation audit on 2026-08-03 rated the `0.2` document, address, layout, and
boundary designs at `0.72–0.86`: retain and harden. The running `0.1` tree-like
scene, canvas renderer, token selection, and async hook/store lifecycle rated at
`0.28–0.46`: replace at the slice boundary rather than adapt. Snapshot/IndexedDB
design rated `0.74`; it remains frozen but unimplemented until Phase 3. These
ratings are decision confidence, not product-quality scores; contrary test,
browser, measurement, provider, or product evidence may reopen them.

## Phase 2 — Thought can be handled

State: Frozen outcome; detail after Phase 1 evidence.

Outcome: a person can admit language, focus it, lasso a valid segment, speak and
stretch concurrently, receive one fixture or live transformation, and undo it.

The frozen boundary is [`docs/protocol.md`](../docs/protocol.md) plus
[`docs/reference/text-material.md`](../docs/reference/text-material.md). Research
is limited to interaction tuning and model-quality examples observed in the
rooted interface; it may not reopen the tree, action authority, or address model.

Receipt: the complete primary loop works in fixture and live modes; stale turns,
pointer cancellation, microphone failure, reflow, and geometry invalidation
preserve material and leave a pointer recovery path.

### Slice 2A — Voice admits human material

State: Frozen for build.

```text
Outcome:    pointer-controlled voice admits one verbatim human root or child as
            one perceivable, pointer-undoable material change
Boundary:   pure admission translator + pure interaction reducer/effects +
            browser voice port + strict transcription route + atomic session commit
Invariants: no AI rewrite; target/tree/revision freeze at activation; no audio or
            transcript in durable/runtime history; one completion, one command;
            every cancel, error, late result, or unmount changes no material
Proof:      reducer race matrix, recorder cleanup tests, route bounds/errors,
            atomic root/child/undo tests, laptop+narrow pointer fixture receipt
Non-goals:  lasso, stretch, generative turn, partial/streaming transcript,
            retained audio, transcript editing, persistence, or a generic SDK
```

An empty tree admits a root. In full view, a selected node admits a child;
material without a selection and focus view do not provide an admission target.
The activation freezes `{ interactionId, attempt, treeId, baseRevision, target }`
and every async completion must match it. A fold-only navigation change does not
invalidate the material target. Any material revision, missing parent, changed
selection/focus, duplicate completion, or document switch does. Successful
child admission preserves the parent selection, so repeated utterances create
siblings; descending requires an explicit pointer selection.

Interaction moves through requesting → recording → stopping → transcribing →
committing → idle/error. The browser runner owns all streams, recorder chunks,
meters, timers and abort controllers. Cancel remains available in every async
phase. A late permission grant immediately releases its tracks. Stop waits for
the recorder's final data event before transcription. Audio is discarded after
settlement and retry always records again.

Fixture and live transcription share one Matter-native route and response
shape. Deployment configuration selects the server adapter; the browser cannot
request fixture mode or name a provider. The first build uses the fixture leaf
through the real multipart boundary. The live leaf follows only after current
provider verification, HTTPS Chrome and Safari device receipts, and deployed
request-size, rate and spend guards.

Receipt, 2026-08-03: the fixture adapter now runs through the browser's real
`MediaRecorder`, final-chunk stop, strict multipart `/api/transcribe` route,
tokened interaction reducer and atomic human admission command. Laptop and
`390×844` pointer flows prove selected-parent child admission, locked structural
tools and camera, right/top-aligned material, preserved parent selection and
exact undo. Pure and adapter tests cover focus rejection, stale targets,
fold-only reveal, history capacity, MIME negotiation, late permission, callback
failure isolation, recorder/track errors, final chunk ordering, size/time bounds,
cancel during stop, timer ownership, hostile MIME strings, route fields and
stable provider errors. Live transcription remains deliberately unavailable.

Research hardening, 2026-08-03: comparison with actor/effect systems and current
browser recording guidance kept the local reducer and capability-port design;
no workflow dependency was justified. The previously untested React/effect seam
is now a Matter-specific serialized admission driver with scope invalidation and
idempotent disposal. Client and server deadlines settle even when cancellation
is only advisory. Recorder fallback, background-page policy, decoded media
validation, request admission/rate/spend guards, physical Safari/Chrome proof,
and true level feedback remain explicit live deployment gates rather than claims
of the fixture slice.

### Slice 2B — Language receives a physical address

State: Re-frozen for interaction hardening.

```text
Outcome:    punctuation-bounded language can be addressed by a lasso without
            changing material or reviving token-wrapped text
Boundary:   pure grapheme-safe segment contract, then Range measurement and
            pure lasso geometry behind one transient interaction edge
Invariants: ordinary DOM text; one-node contiguous address; client-pixel gesture;
            visible and semantic closure agree; no geometry/history persistence;
            cancel, degenerate and ambiguous strokes restore prior selection
Proof:      multilingual/grapheme/seam matrix; closure/self-cross/tail topology;
            early trackpad release, wrapped Range and invalidation browser receipt;
            independent verifier
Non-goals:  stretch preview, voice direction, model turn, replacement, touch parity
```

Research retained the existing text-material boundary after comparison with the
old prototype, tldraw and Excalidraw. Those systems contribute pointer lifecycle,
path simplification, cancellation restore and broad-phase patterns; they do not
define Matter's text semantics. The first build is the pure segment derivation
and validation. DOM geometry follows only after its independent proof. Lasso is
an explicit rail mode that temporarily owns the primary pointer instead of the
camera; cross-node, non-adjacent, tiny, stale or ambiguous hits reject rather
than guess. Stretch, handle design and generation remain the next slice so this
one can prove address before degree and direction are coupled.

Build receipt, 2026-08-03: the pure segment contract, lasso geometry, transient
interaction reducer and DOM Range edge now form one explicit Lasso rail mode.
The primary pointer draws client-space SVG ink without a React or tree update;
pointer-up performs node-bounds broad phase, measures plain DOM text, rejects
cross-node/non-adjacent ambiguity, and paints immutable client-space fragments.
Cancellation restores the starting semantic address. Tiny, degenerate and
ambiguous strokes now restore it too; only a trustworthy closed empty loop
clears it. Resize, visual viewport, fonts, layout epoch, camera
and material revision remeasure or hide handles rather than retaining stale
geometry. Laptop and narrow Chromium receipts prove wrapped selection, camera
lock, pointer cancel restoration, viewport remeasure and mode exit. Stretch and
generation remain outside this receipt.

Interaction correction, 2026-08-04: physical use exposed a gap between the raw
open SVG stroke and the polygon's invisible closing edge, plus unstable ink when
the bounded point buffer compacted mid-stroke. The hardening slice now keeps a
bounded semantic polyline and a separate smoothed visual projection, shows the
actual closing seam while drawing, and closes on pointer-up so an early trackpad
release is still intentional lasso input. Tiny or degenerate strokes restore the
prior address; a qualified empty loop alone clears it; self-crossing, cross-node,
non-adjacent and stale results are ambiguous and never guess. Pointer movement
still paints only ink; DOM Range work remains a single pointer-up operation.

Closure-intent correction, 2026-08-04: semantic success alone no longer closes
an arbitrary open stroke. The endpoint must either return within a small fixed
start radius or pass a stable initial-angle plus path-length and bounds-relative
gap rule. Live seam and pointer-up share the same pure gate, so a large remote
endpoint cannot be silently completed into a selection.

### Slice 2C — Selection carries degree

State: Re-frozen for split-language projection.

```text
Outcome:    top and bottom handles let a person expand selected language from
            either visual edge and leave one shared normalized degree
Boundary:   pure stretch reducer + pure client preview geometry + pointer edge
Invariants: one degree and address; client-pixel gesture; no text/tree/history mutation;
            no per-move React/layout/Range work; cancel restores prior degree
Proof:      mapping/lifecycle matrix; zoom/dead-zone/cancel/resize receipts;
            middle/start/end split; suffix displacement; centered laptop/narrow receipt;
            reduced-motion/coarse targets; independent verifier
Non-goals:  voice direction, model request, replacement, predicted reflow,
            durable text splitting, per-pointer-move layout publication,
            generic animation framework, full touch parity
```

Research compared the old two-handle prototype with tldraw and Excalidraw resize
lifecycles. Product correction makes both grips interactive without importing
resize-box semantics: top-up and bottom-down both expand one shared non-negative
degree, while reversing either grip reduces it toward zero. Degree is a
screen-space bodily signal, so fixed client-pixel travel does not divide by
canvas zoom. The source material never scales or rewraps. One disposable,
aria-hidden visual projection may duplicate its language while expansion is
visible. Pointer movement updates the overlay directly;
React receives settlement and invalidation only. CSS expresses the single short
settle, so Framer Motion adds no warranted capability or dependency.

Diana Lu's [Point + Talk](https://diana.lu/point-n-talk) is retained as a
presentation reference, not this gesture's contract. Its selected phrase stays
anchored while a clipped local slot swipes through already generated, discrete
alternatives. Matter borrows the locality, masking, and quiet axis cue. It does
not add candidate browsing here: candidate index is an option-navigation channel,
not continuous human-owned degree, and would exceed the four-signal grammar.

Build receipt, 2026-08-03: the semantic stretch reducer, fixed-top preview
geometry, and one lower handle now settle a normalized degree without changing
material. The hot path owns one primary pointer and writes only local CSS
geometry; pointer cancellation, capture loss, material/navigation changes, and
browser geometry invalidation restore the previous degree before stale handles
can disappear. The slider keeps ordinary keyboard semantics and 40/44px fine
and coarse targets. Laptop and narrow Chromium receipts cover dead zones,
settlement, cancellation, resize, visual viewport, font invalidation, and
keyboard bounds. An independent verifier found no remaining P0/P1 issues.

UI correction, 2026-08-04: the first overlay read as a detached resize box and
was rejected. The material projection now inherits the source column width and
centers the derived language blocks. Source text, Range rectangles, width,
spacing and wrapping remain geometry-identical; after settlement only the
presentation node and canvas may grow so later material cannot collide. This
restores the hackathon rust double-grip skin without restoring its mutable
`elastic-grid` document model.

Dual-handle correction, 2026-08-04: the upper grip is no longer decorative.
Measured Range fragments are grouped into visual lines; the upper grip centers
on the first line and the lower grip on the last, so wrapped stepped selections
do not inherit a false rectangular center. Both are accessible sliders over one
shared `[0,1]` degree. The active edge affects only transient preview direction,
not the semantic address, lineage, or future agent envelope.

Split-language correction, 2026-08-04: an expanded middle selection is no
longer represented by a tall tint over one unchanged paragraph. The rendering
edge derives `before / selected+outer-seam / after` from the validated address
and projects them as centered, transient language blocks. Bottom expansion
keeps the upper language fixed and displaces the suffix to the slot floor; the
upper grip adjusts the same projection without moving or reflowing upper text.
The original DOM text remains connected and
geometry-identical underneath, and the tree never acquires presentation-only
fragments.

## Phase 3 — Material can return

State: Build in progress after product-priority correction.

Outcome: committed material survives reload and can leave and re-enter the
browser as the same inspectable Markdown tree.

The frozen boundary is
[`docs/reference/virtual-file-system.md`](../docs/reference/virtual-file-system.md).
Research is limited to measured storage/archive bounds and browser failures.
It may not introduce accounts, sync, CRDTs, or a second document model.

Receipt: empty and rooted bundles round-trip deterministically; IndexedDB reload,
coalescing, conflict and retry work; ZIP export → import restores identity; bad
versions, paths, collisions, and bounds fail before material changes.

### Slice 3A — Markdown material is visible and durable

State: Proven for the visible/durable sidebar slice.

```text
Outcome:    the authoritative tree is visible as a quiet Markdown file outline,
            survives reload, and selected passages can leave through the clipboard
Boundary:   pure title/search/copy projection + canonical path allocator + strict
            SnapshotBundle codec + generation-checked IndexedDB repository
Invariants: ThoughtTree remains the only document; id and created/updated times
            live in frontmatter; authored child order owns paths and copy order;
            focus shows only exact lineage; file selection is transient
Proof:      multilingual labels; deterministic/strict codec; coalesce/conflict/retry;
            laptop+narrow select/fold/search/copy/reload; bounded 2,000-node
            projection with deferred cached search; independent verifier
Non-goals:  ZIP/directory import-export, path-authored edits, cross-node lasso,
            sync, collaboration, a generic VFS, or a second event model
```

Product-priority correction, 2026-08-04: material needs a visible file outline
before the generative transform is complete. This reorders one Phase 3 slice
without reopening the document: the sidebar and automatic durability are two
projections of the existing `ThoughtTree`, not a second filesystem. Every node
maps to one logical `index.md`; its display title is deterministic but
non-authoritative. Hidden `id`, `createdAt`, and `updatedAt` remain in strict
frontmatter, while numeric directory prefixes preserve authored order.

Research compared Mirage at commit `a1668482`. Its Apache-2.0 VFS is useful
prior art for stat metadata, post-write invalidation, level-triggered freshness,
bounded coalescing, and overflow re-inventory. Matter does not import it: a
multi-mount dispatcher, remote cache, watcher, shell and backend registry would
duplicate the tree engine and add a second source of truth. The current tree
publication is already the exact freshness event for both canvas and sidebar.
At the 2,000-node bound the first uncached title projection measured about
`360 ms` after removing duplicate segmentation; cached full-text search measured
about `2 ms`. The closed sidebar now performs neither label projection nor path
allocation, preserving the proven canvas interaction path. Opening a maximum
tree is therefore an explicit one-time inventory cost; search is deferred and
reuses per-node derived labels. This is an optimization signal for later
windowing, not evidence to introduce virtualization into the default small-tree
surface.
The verifier's first pass rejected blind CAS retry, transport-unsafe ids, and a
path bound smaller than valid maximum-depth material. The revised boundary uses
frontmatter-safe bounded ids, UTF-8-bounded slugs plus an 18 MB logical bundle,
and an explicit validated conflict reload that cannot overwrite a newer local
commit. Closed file chrome is inert and performs no inventory work.
The independent second pass found no remaining blocker after those corrections.

## Phase 4 — First release

State: Outcome only; no feature design before Phase 3.

Outcome: the three slices behave as one quiet, dependable product on the deployed
origin.

Work is limited to integration defects, error language, accessibility of the
existing controls, performance at specified bounds, provider configuration,
responsive polish, and release verification. No new gesture or durable concept
enters this phase.

Receipt:

```bash
npm run check
npm run test:e2e
```

Then complete the no-keyboard path in fixture and live modes at laptop and narrow
widths: admit root, admit child, focus, transform, undo, reload, export, import,
and confirm no page or console errors. Passing this receipt is the end of this
roadmap.

## Current risks

- Phase 2 introduces the first browser-resource and network lifecycles. Voice,
  selection geometry, and late model results must remain transient until one
  revalidated tree command commits.
- Text addressing can be correct in pure tests and still fail after browser
  wrapping or font changes; Phase 2 requires browser proofs.
- Durability makes protocol mistakes survive reload; Phase 3 ships version
  rejection with its first writer, never afterwards.
