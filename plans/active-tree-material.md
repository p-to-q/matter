# Plan: Matter first release

Status: Active  
Current phase: 2 — complete the generative turn
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

## Next preview execution line

## Preview.12 inquiry submit-key freeze

```text
Outcome:    expanding Ask Matter exposes the existing small inquiry composer;
            Enter submits the non-blank draft through the same action as its
            visible Ask button.
Boundary:   inquiry composer key handler, existing submit guard, and one
            browser receipt; no inquiry wire, context, provider, or persistence
            contract changes.
Invariants: an empty or whitespace-only draft never sends; Enter during an IME
            composition never sends; a pending request cannot be duplicated;
            Shift+Enter preserves a deliberate line break; closing or resolving
            the inquiry does not create a transcript or alter material.
Proof:      reducer/interaction tests for empty, Enter, composition, pending,
            and Shift+Enter; browser receipt shows Enter and the visible button
            create the same one bounded request.
Non-goals:  multi-turn chat, keyboard-required primary flow, new prompt UI,
            server changes, context expansion, or durable inquiry history.
```

## Preview.10 interaction durability freeze (proven)

```text
Outcome:    recording beneath a selected passage creates its child; active lasso
            and Canvas pan both exit on a second click; undo returns after reload
            for every locally persisted command in the active document.
Boundary:   admission anchor, lasso rail intent, runtime history, and one atomic IndexedDB document record.
Invariants: document title is metadata; selected parent is revalidated at commit; lasso/stretches stay transient;
            history and material save together or the newer pair is not advertised as durable.
Proof:      parented-admission, repeated-lasso-and-stretch, reload-then-undo, corrupt-history recovery,
            two viewport browser flows, full check, and full browser suite.
Non-goals:  server sync, collaboration, redo, rewriting past history, or promising recovery for records from before
            durable history was first stored.
```

The next preview is not another shell-design pass. Work proceeds in this order,
and each line closes with its focused proof before the next one starts:

1. **Recovery and bootstrap.** Make storage exhaustion discoverable while the
   narrow file drawer is closed; keep export and retry reachable; prevent every
   durable gesture until IndexedDB bootstrap has identified the home lineage.
   Then freeze and build one strict active-document pointer so a successfully
   imported foreign-id archive remains the local home document after reload.
2. **Fixture transform loop.** Build the missing vertical `/api/turn` slice:
   strict envelope and plan contracts, degree-to-length policy, server planner,
   fixture provider, bounded route/client, synchronous plan translator, one
   store commit, and the existing Voice control acting as direction while a
   focused punctuation selection is stretched. The first proof ends with one
   local change and exact pointer undo; a route alone is not a product receipt.
3. **Live transform and deployed receipt.** Enable the same validated scenario
   behind server-only provider configuration, distributed rate and spend guards,
   then run the complete no-keyboard path on the deployed origin. Fixture output
   never silently substitutes for an unavailable live provider.
4. **Large-tree renderer decision.** Either freeze viewport DOM over the complete
   pure layout, or publish a smaller supported interactive bound. No local CSS or
   memoization patch may weaken the existing strict `<100 ms` receipt.
5. **Release integration.** Re-run fixture and live paths at laptop and narrow
   widths, close only issues whose shipped proof exists, and publish the next
   preview from that receipt.

Directory export, multi-document UI, accounts, sync, collaboration, retrieval,
streaming generation, and new gestures remain outside this execution line.

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
| Deployment probe | Frozen | `/matter/api/health` reports coarse gated surface states without provider or material data |
| Visual composition | Local to each phase | quiet Matter form; refine from the running interface, not a second design system |
| Right paper chrome | Frozen | anonymized private composition study; the rounded paper owns ambient media, right rail, and corner utilities |
| Left material field | Re-frozen | 304 px manuscript index; structural depth steps, local disclosure, flat search, copy selection, archive, and local-only identity; drawer below 960 px |
| Lightweight inquiry | Re-frozen | one secondary, non-persistent question surface; bounded visible lineage; no mutation; answer adapter may be unavailable |
| Structural reparenting | Frozen | selected non-root node drops on a visible parent or explicit sibling slot; cross-parent and same-parent authored order use one exact pointer-undoable command; no authored coordinates |

Preview.8 title/document freeze:

```text
Outcome:    the preview has one seeded demo document with an independently renameable title
Boundary:   document-root metadata, title command/inverse, local persistence and archive round-trip
Invariants: material text never derives or overwrites the title; blank rename resets to the demo title;
            title changes are durable and pointer-undoable; no new-document UI is implied
Proof:      title command forward/inverse, blank-reset, reload, and archive tests
Non-goals:  document picker, multiple active documents, accounts, sync, or title generation
```

Post-preview maintenance freeze:

```text
Outcome:    a clean checkout and an interrupted local proof leave no tracked build output,
            orphaned POSIX dev server, or provider work owned by a cancelled request
Boundary:   Next type generation, Playwright process ownership, and one-request model scenarios
Invariants: generated declarations stay untracked; normal dev cannot inherit the E2E distDir;
            inquiry/repair cancellation reaches the provider without creating cooldown debt;
            one label caller still cannot cancel a shared deduplicated provider flight
Proof:      clean typegen/typecheck, runner missing-file/signal tests, route/client cancellation tests,
            full check and browser suite
Non-goals:  Windows process-tree supervision, deployment orchestration, transform implementation,
            or changing the measured 2,000-node rendering model
```

The foundation freeze was completed on 2026-08-03 after source research and a
second adversarial review. Its evidence lives in
[`docs/reference/foundation.md`](../docs/reference/foundation.md) and the nearby
references. It does not need another foundation phase.

Structural reparenting keeps this proof boundary:

```text
Outcome:    a selected non-root node can be reparented or reordered by pointer
Boundary:   pure drop projection -> move translator -> tree engine -> history
Invariants: one mutation, exact source/target order, bounded depth/children, exact undo
Proof:      policy bounds, stale/invalid atomic rejection, reorder/reparent inverse, browser drop/cancel
Non-goals:  authored coordinates, root movement, cross-document drag, generic drag-and-drop
```

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

State: Proven.

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

### Slice 2A.1 — Managed real-time admission

State: Implemented locally; deployed browser/device receipt pending.

```text
Outcome:    native recognition shows transient live hypotheses when available;
            every supported path commits one final transcript only on explicit stop
Boundary:   browser Web Speech session, then lazy on-device Whisper final-transcript
            fallback over the already bounded MediaRecorder lifecycle
Invariants: fixture speech never runs on the public origin; raw audio and partials
            never enter material, persistence, or logs; only one final transcript
            reaches the existing atomic human command; stale events change nothing
Proof:      partial ordering, one-session deadline, interim-only settlement,
            cancellation/scope/unmount cleanup, lazy-worker bounds, final commit
            and undo; deployed HTTPS Chrome and Safari device receipts remain
Non-goals:  accounts, sync, retained recordings/transcripts, a custom media
            relay, continuous material writes, or a new document model
```

The public preview now takes the browser-managed Web Speech API as its first
real-time path. It requires no Matter-side credential and never calls the
fixture transcript. Browsers without native recognition retain the existing
MediaRecorder boundary, whose HTTP route remains unavailable in `browser` mode
until a real provider adapter is separately verified.

### Slice 2B — Language receives a physical address

State: Proven.

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

State: Proven.

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

State: Core archive and durability proven; active-document bootstrap remains.

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

Storage-full kernel hardening, 2026-08-05:

```text
Outcome:    storage exhaustion is distinguishable without losing newer local material
Boundary:   IndexedDB repository classification → persistence retry queue
Invariants: only DOMException QuotaExceededError maps to storage-full; generation
            mismatch remains conflict; all other write exceptions remain generic
Proof:      repository classification matrix; latest-dirty retention and retry drain
Non-goals:  UI recovery copy, pagehide, archive/export, automatic deletion
```

Storage-full recovery receipt, 2026-08-08: the narrow drawer handle now exposes
an unsaved state even while closed. Quota exhaustion is named separately from a
generation conflict, opens the existing archive surface, and keeps export plus
explicit retry reachable while the controller retains the latest dirty tree.
Durable canvas and file actions are inert only during initial storage bootstrap,
closing the load-window loss path without persisting transient UI state.

The remaining persistence slice is one strict active-document pointer. Its
freeze must cover metadata migration, pointer CAS ownership, pointer-load then
snapshot-load ordering, archive save/switch/publication rollback, corrupt or
missing pointer fallback, and multi-tab conflict. It does not introduce a
document picker, recent-file list, or more than one active runtime document.

### Slice 3B — Material can leave and return as one archive

State: Proven.

```text
Outcome:    a person can export the current Markdown bundle as a ZIP and, after
            an explicit replacement confirmation, import a valid ZIP as material
Boundary:   strict browser archive transport + generation-checked repository save
            + one successful document-switch coordinator + transient file-panel UI
Invariants: the archive is only a transport for SnapshotBundle; all entries finish
            validation before any storage or runtime change; a failed or conflicted
            import leaves current material, history, navigation, and selection intact;
            a successful switch clears transient session state and begins persistence
            for exactly the imported tree; the fixed right editing island stays unchanged
Proof:      bundle→ZIP→bundle/tree identity; malformed, duplicate/colliding, traversal,
            CRC, compressed/expanded-size, depth and entry-count rejections; CAS collision
            tests; pointer-only export/import/cancel/confirmation at laptop and narrow widths
Non-goals:  directory picker, path-authored edits, multi-document tabs, sync, migration,
            background archive jobs, archive history, or permanent status chrome
```

The transport uses a dynamic browser-only `fflate` import rather than a local ZIP
implementation: the platform has no complete interoperable archive API, while this
small dependency exposes a streaming `Unzip` boundary. Because `fflate` does not
verify ZIP CRC during streaming extraction, a bounded central-directory reader and
incremental CRC check reject corrupt bytes before the strict snapshot codec runs. The Archive
entry point belongs to a short-lived panel in the left material index; it is not a
sixth editing tool and does not alter the physical ToolRail order. Archive parsing
keeps pointer interaction available, and only a fully verified candidate may enter
the existing generation-checked repository through an explicit document switch.

Receipt, 2026-08-05: deterministic export and streaming import prove exact tree
identity together with traversal, directory, Unicode/case collision, UTF-8, CRC,
entry-count, path-depth, compressed-input, declared-expanded and actual-expanded
bounds. Same-id import reserves a fresh CAS generation before switching; conflict,
cancel and invalid input leave the current document and session untouched. A
document epoch invalidates sidebar selection, lasso settlement, stretch preview,
recording and transcription even when tree id and revision are unchanged. The full
repository passed 460 unit tests, typecheck, lint and documentation checks; the
archive browser matrix passed 6/6 at laptop and 390 px. An independent verifier
reran 69 focused tests and all six browser cases and returned pass with no P0/P1.

### Presentation shell correction — the field becomes a workbench

State: Proven.

```text
Outcome:    material files remain visible at the left while the rooted canvas
            reads as one inset, touchable paper field with quiet leaf-shadow motion
Boundary:   rendering composition, static visual assets, UI type tokens, and the
            ToolRail presenter; tree layout, tool projection, and persistence stay frozen
Invariants: the visible tree remains the canvas and context boundary; controls own no
            durable state; motion is decorative, silent, non-blocking, and reduced-motion safe
Proof:      focused unit/type/lint checks plus laptop and narrow pointer receipts,
            screenshots, overflow checks, and an independent verifier pass
Non-goals:  authored coordinates, a draggable tool mode, theme/settings infrastructure,
            new tool intents, a chat surface, or copying the supplied reference brand
```

The desktop shell follows a browser-workbench composition: the material outline
occupies the outer field and the canvas is inset on the right as one rounded
surface. The supplied leaf-shadow loop is the single ambient signature inside
that surface. Departure Mono carries interface text while material passages keep
their existing reading face. The editing island remains a closed projection in
its stable right-side position; this slice makes its visual groups portable but
does not let it compete with the canvas for drag ownership.

Receipt, 2026-08-04: the supplied poster/video and local interface faces load
through the configured base path; focused tree/layout tests passed 39/39;
Playwright passed the laptop, 390 px, and focused 320 px workbench matrix 5/5;
typecheck, lint, production build, and an independent verifier all passed.

### Workbench correction — guidance, index, and responsive loading

State: Proven.

```text
Outcome:    the canvas explains the next bodily action at its lower edge, the left
            outline reads as a manuscript index, and first paint does not wait on motion
Boundary:   MaterialFiles presentation state, canvas guidance copy, ambient asset loading,
            and the localhost development receipt; fixture domain helpers remain test-only
Invariants: no assistant/status panel; tree and intent authority stay unchanged; guidance
            owns no state; video is optional enhancement and reduced-motion safe
Proof:      request timing, asset byte comparison, type/lint/unit checks, laptop/390/320
            interaction receipts, repeated localhost health requests, independent review
Non-goals:  new AI tools, fixture controls in product chrome, persistence/protocol changes,
            generic animation infrastructure, virtualization, or authored coordinates
```

The left surface has two transient presentation modes in addition to browsing:
search reveals one input, while select reveals copy affordances. Revision,
successful persistence, file-type decoration, and fixture versions are not
product chrome. The leaf poster paints first; motion joins only after the main
thread yields and pauses with page visibility.

Receipt, 2026-08-04: Next 16 Turbopack reduced the measured cold development
page from about `2.704 s` to `0.896 s`; the manual server now owns port 3000
while Playwright owns isolated port 3100. Twenty consecutive localhost health
requests returned `200` with no timeout. The poster shrank from `323 KB` PNG to
`55 KB` JPEG and paints before the idle-mounted video. The full repository
check passed 372/372 unit tests and production build; the focused UI matrix
passed 13/13 Playwright tests, and an independent verifier returned pass.

### Guidance correction — one truthful next action

State: Proven.

```text
Outcome:    the paper's lower-left edge gives one honest next bodily action for
            every current material, lasso, stretch, and voice-admission state
Boundary:   pure guidance projection, its RootedMaterial adapter, lower-left type,
            and focused presentation tests; tool and server authority stay unchanged
Invariants: guidance owns no state, never promises an unavailable transformation,
            and does not duplicate the interaction-specific live announcements
Proof:      exhaustive projection and recovery matrix plus laptop/narrow pointer
            receipts for selection, lasso, stretch, voice progress, and one-line type
Non-goals:  generative direction voice, tool reordering, new tool intents, backend
            changes, copied reference branding, or another status surface
```

Research found that the existing lower-right sentence sometimes offered several
actions at once and, after stretch, instructed the person to speak a generative
direction even though the current voice control admits human material. The
replacement is a closed pure projection with explicit precedence and error
recovery copy. Its single visual line moves to the lower-left paper edge and
uses the already-licensed Departure Mono spacing observed in the supplied
reference; it does not copy the reference brand or its delayed decorative fade.
The V1 editing island remains research evidence only: this slice records the
fixed-slot recommendation but does not change tool order before product review.

Receipt, 2026-08-04: the pure projection matrix covers all admission phases and
11 recovery codes together with material, lasso and stretch precedence in
29/29 focused tests. All 401 repository unit tests, typecheck, lint, docs and
repository doctor passed. The focused browser matrix kept selection, lasso,
stretch and voice progress green at laptop and narrow widths; a corrected
Range-based receipt then proved one rendered, non-overflowing guidance line at
1280, 390 and 320 px in 3/3 checks. Desktop browser inspection confirmed the
24 px paper inset and Departure Mono treatment. An independent verifier first
rejected wrapping recovery copy, then passed the bounded-copy and proof revision
with no remaining gap.

### Tool island correction — stable primary controls, local structure handles

State: Proven.

```text
Outcome:    the right editing island stays physically and semantically stable while
            structure navigation appears at the selected material it changes
Boundary:   ToolRail presentation, a measured transient local-handle overlay,
            pure tool presentation helpers, responsive CSS, and focused browser proof
Invariants: Voice → Lasso → Branch → Move → Undo never reorder; local controls own
            no state; Move must express an actual return to canvas pan; no durable
            mutation, server, protocol, tree-layout, or history contract changes
Proof:      fixed-slot and local-tool unit tests plus laptop, 390 px, and 320 px
            pointer receipts covering selection, fold, focus, show-all, lasso, and undo
Non-goals:  tool drag/reorder, generated transformations, a settings surface, new
            ToolIntent variants, persistent camera modes, or revised backend behavior
```

The rail is a stable instrument, not a context menu: unavailable slots remain
visible but honest. Focus, Fold, Unfold, and Show all are local structural
handles positioned from the visible selected material without entering the
tree's measurement DOM. They yield to lasso and stretch interaction, so they
cannot silently change the geometry or steal a gesture.

Receipt, 2026-08-04: the independent reviewer first found narrow text overlap,
drawer collision, and a false Move state; each is now covered by the pure
positioner and interaction contracts. All 406 unit tests, typecheck, lint,
repository doctor, and documentation links pass. A fresh localhost restart
cleared the stale HMR client; Chromium then passed the rooted desktop/390/320
matrix 3/3 and the lasso/return-to-pan matrix 8/8.

### Workbench restoration — fixed Arc shell and one editing instrument

State: Proven.

```text
Outcome:    desktop always keeps a left material field beside one inset rounded
            canvas with the supplied leaf shadow, and only five editing controls show
Boundary:   desktop shell geometry, the NodeHandles presenter, workbench documentation,
            and focused browser proof; tree, navigation, and tool intents stay frozen
Invariants: Voice → Lasso → Branch → Move → Undo is the only visible editing island;
            hiding the file index cannot enlarge the desktop canvas; ambient media is
            decorative, silent, non-blocking, base-path safe, and still-backed
Proof:      source/ZIP hash and HTTP receipts; open/closed desktop geometry; selected-
            material control inventory; laptop and narrow pointer checks; independent review
Non-goals:  deleting fold/focus capability, changing the left outline's tree disclosure,
            tree layout, persistence, protocol, new AI tools, or a draggable tool palette
```

Implementation evidence reopens the earlier presentation freeze narrowly: a
selected passage currently creates a second two-button island for Focus/Fold,
and closing the file index expands the desktop canvas from the specified 262 px
inset to 64 px. Both states contradict the stable browser-workbench composition
even though the supplied tree-shadow media itself is present and healthy.

Receipt, 2026-08-05: the desktop canvas remains x=262/y=10/w=1008/r=18 at
1280 px with the file index both open and closed; the supplied video is playing
at readyState 4 with a still fallback and byte-identical ZIP sources. Selecting
material exposes no second action island, while the right instrument remains
Voice → Lasso → Branch → Move → Undo. The 390 px canvas remains x=8/y=66/r=16
with 48 px targets. All 463 unit tests, typecheck, lint, docs, build and five
focused browser cases passed; an independent verifier returned PASS with no
P0/P1 after repeating asset, localhost, desktop and narrow checks.

### Canvas chrome transplant — Matter utilities at the paper edge

State: Proven.

```text
Outcome:    the right paper adopts the supplied corner-chrome system: quiet top-right
            information/settings, lower-left action guidance, and lower-right
            help/language/leaf-FX/appearance controls with Matter-specific honest copy
Boundary:   one canvas-chrome presenter, validated transient preferences, the existing
            guidance presenter, ambient enablement, scoped canvas theme tokens, and UI proof
Invariants: every new surface stays inside the rounded paper; the left material field and
            five-slot editing island do not move; no prompt/chat/assistant or data transfer;
            preferences and overlay/feedback state never enter material or command history
Proof:      preference validation/storage-event tests; existing guidance-state matrix;
            menu/dialog keyboard and outside/Escape behavior; FX/reduced-motion/theme proof;
            desktop/390/320 screenshots, pointer flows, build, health, and independent review
Non-goals:  billing infrastructure, binding public legal terms, full-app localization, a live
            support agent, provider work, tree mutations, protocol changes, or sidebar theming
```

The source package is treated as interaction evidence, not an authority over
Matter: its 24 px corner grid, Departure Mono typography, popover focus behavior,
validated preferences, storage synchronization, cleanup, visibility pause and
media fallbacks are retained. The Herald composer is not: “Ask Matter” opens
static, task-oriented help because an assistant surface would violate the product.
Pricing, privacy and terms open honest pre-release information rather than link to
placeholder pages or imply unavailable billing and legal commitments. The existing
pure canvas-guidance state machine remains the only owner of lower-left prompts;
only its presenter takes on the manufacturer-mark typography and keyed state-change
entrance, so no second toast, timer, or announcement channel is introduced.

Corrected intent, 2026-08-07: the static-help substitution above was a historical
implementation decision, not the final product meaning. Ask Matter is restored as
one small, closed-by-default inquiry. It can submit only a bounded visible lineage,
persists no exchange, creates no command, and states when no answer adapter is
connected. This correction does not reopen permanent chat or assistant chrome.

Receipt, 2026-08-05: live reference inspection and the supplied package agree on
the 24 px desktop grid, 14/20 Departure Mono typography, 160×104 settings menu,
and mobile handoff below 768 px. Matter keeps that form inside the rounded paper
with localized, honest product copy and no Herald input. The settings and
information overlays share one state, trap and restore focus without scrolling
the paper, inert the paper and editing rail, and clean up at the breakpoint.
Validated v1 preferences survive reload and cross-tab storage events; FX pauses
the supplied video and appearance tokens remain paper-scoped. All 505 unit tests
pass; the two dedicated desktop/mobile browser receipts pass, and the complete
standard suite has 28 product cases passing with the production performance
receipt explicitly skipped.

The follow-up keeps the fixed lasso hint out of the left field entirely and
restores the original system mono stack for the top-left workbench mark. Dark
appearance uses the same ambient source with a scoped dark base and a lower
brightness/contrast treatment; the independent browser receipt asserts that
filter path as well as the FX off state.

### Instrument density and human admission correction

State: Frozen.

```text
Outcome:    the right instrument keeps five stable targets with legible icons;
            Delete removes a selected non-root thought pointer-undoably; voice
            admits first-level material below the root after the first admission
Boundary:   rail presenter/CSS/icons; a private human removal translator and
            store action; admission-anchor policy and its existing browser path
Invariants: only the tree engine mutates material; removal is exact-undoable;
            root deletion remains unavailable; browser text/form editing is not
            hijacked; first utterance still initializes the sole root; real STT
            remains deployment-configured rather than silently fixture-backed
Proof:      pure removal/admission tests; store exact-undo/rejection tests;
            laptop/narrow pointer and keyboard receipts; toolbar geometry and
            hover-state proof in light and dark appearance
Non-goals:  lasso-range deletion, multiple roots, AI tool changes, moving the
            rail, live-provider credentials, or left-field redesign
```

The first instrument used a complete return arrow and compact artwork. After a
larger candidate proved visually heavy, the desktop rail returned to its first
56 px outer width, 40 px visible targets, and 16 px artwork. A 44 px invisible
hit area preserves reach, while narrow layouts retain 48 px physical targets.
Only the internal black-and-white surface changes, so the rail never shifts.
Deep selections no longer retarget human
admission: nonempty full-view voice always appends under the sole root. The
fixture transcription remains explicit until a verified provider adapter is
configured; it is not presented as a real transcription result.

### Material index cold-start correction — derive only the visible window

State: Implemented; scoped index cold-start proven, full-page gate open.

```text
Outcome:    opening the 2,000-node production canvas no longer creates a >100 ms task
            by deriving labels and paths for every offscreen file before first paint
Boundary:   MaterialFiles projection/window derivation and its focused performance proof;
            tree, canvas layout, persistence, search results, and UI form stay frozen
Invariants: the complete tree remains the index/search authority; mounted rows remain a
            bounded overscanned window; focus, selection, copy, fold, and paths stay exact
Proof:      full projection identity tests; window/search/focus browser flows; three-round
            production receipt with cold max <100 ms and existing fold/focus gates
Non-goals:  hiding the index by default, prewarming work, weakening timing thresholds,
            canvas virtualization, protocol changes, or an approximate search inventory
```

Two repeated production A/B receipts isolate the regression: 2,000 canvas nodes
with the desktop index closed produce no long task, while the same build with the
index initially open produces a 308–323 ms first task. Reopening after the first
derivation is cheap. The current receipt now refuses to assign one causal stage
when several measurement marks fall inside the same browser task; exact marks and
raw timing remain intact.

Receipt, 2026-08-05: browse, fold and focus now build a cached unlabeled
structural projection; only mounted overscan rows derive cached titles and exact
lineage paths, while non-empty search still derives the complete labeled tree.
The same production diagnostic reduced the cold task from `310–323 ms` to
`67 ms`, layout-ready to `216.1 ms`, and measurement-window tasks to at most
`97 ms`; selection was `8.7 ms`, fold p95 `110.2 ms`, focus p95 `111.3 ms`,
with 4,289 elements. The unchanged raw `<100 ms` assertion still fails at
`139 ms` during the first warmup full 2,000-node canvas remount. Open/closed
index A/B after warmup measured `98/94 ms`, so the index cause is closed but the
whole-page release gate is not. No threshold was widened and the remaining
canvas architecture decision stays outside this slice.

### Development server correction — isolate manual work from browser proof

State: Proven.

```text
Outcome:    a person can keep Matter open on localhost:3000 while Playwright
            reliably starts and owns a separate localhost:3100 verification server
Boundary:   Next dev output directory selection, Playwright web-server environment,
            generated-cache ignore rules, and one concurrent-server receipt
Invariants: production output remains `.next`; public base path and health route
            remain unchanged; no product runtime, protocol, or provider behavior moves
Proof:      manual 3000 stays healthy while standard Playwright launches 3100 and
            completes a focused pointer flow; both health endpoints return no-store 200
Non-goals:  a custom dev proxy, HMR rewriting, deployment health semantics, CI hosting,
            or a new test runner
```

The failure was a shared Next development lock, not an unavailable health
surface: the existing manual server and Playwright's fixed server both claimed
`.next/dev`. An explicitly scoped test output directory isolates their locks and
Turbopack caches while leaving the production default untouched.

Receipt, 2026-08-04: the E2E server is the only development process allowed to
select `.next-e2e`; production phases always publish `.next`, and its base path
is fixed to the tested origin. The runner restores generated type references on
success, failure, and repeated interrupts. With a manual 3000 server alive,
`typecheck → standard E2E → typecheck` passed with 15/16 Chromium cases (one
explicit production receipt skipped); both 3000 and 3100 health paths returned
no-store 200. The signal cleanup has a real child-process receipt covering two
SIGINT events and a forced child termination.

### Layout publication correction — local handles do not remeasure the tree

State: Implemented; full production performance receipt pending.

```text
Outcome:    selecting a thought or lassoing language remains local even in a
            large document; only structure, text dimensions, or stretch damage
            republish the rooted layout
Boundary:   RootedMaterial's pure visible-layout input/key, layout measurement
            dependencies, the 2,000-node performance harness, and focused proof
Invariants: selection, lasso, guidance, rail, and local handles remain transient;
            focus/fold/tree text retain their exact geometry; no server, protocol,
            tree engine, virtualization, or authored-coordinate changes
Proof:      pure layout-key tests, existing pointer flows, and a production 2k
            receipt with cold layout, long-task, fold/focus, and selection samples
Non-goals:  altering ambient visuals before their measured receipt, performance
            thresholds without a baseline, or a generic rendering cache
```

The current renderer has no reason to remeasure every visible node when a person
only changes selection or a transient language address. Local handles already
follow screen geometry independently; the layout publisher must now share that
discipline while retaining stretch's explicit visual damage as a real geometry
input.

Production evidence reopened the second half of this freeze: selection now has
a `49.4 ms` p95, but full fold/focus rounds remain above `200 ms` and the page
contains about `14,940` elements. The authoritative cause is the desktop index
mounting and reprojection of its 2,000-row non-authoritative file view alongside
the canvas. The next bounded correction may defer that index projection by one
render priority after a structural canvas action, but must disable its stale rows
until its projection catches up; tree, canvas, persistence, selection, and tool
authority may not defer.

Receipt, 2026-08-04: after the deferred index correction, a complete wide
surface production round recorded FCP `160 ms`, layout-ready `535.5 ms`, fold
p95 `152.3 ms`, focus p95 `207.4 ms`, selection p95 `121.2 ms`, and 121 buffered
long tasks with a `407 ms` maximum across `14,940` elements. This proves the
selection-layout correction but fails the release gate for focus and long tasks.
The freeze is therefore reopened solely to research a bounded, index-only
on-demand rendering policy; the canvas remains fully material and no threshold
may be widened.

### Index rendering correction — the file view is a window, not a second tree

State: Implemented; full production performance receipt pending.

```text
Outcome:    a large desktop document keeps its entire authored file index
            available while only its visible fixed-height rows enter the DOM
Boundary:   MaterialFiles render edge, pure window geometry, row scroll/focus
            receipts, and the existing performance harness
Invariants: full file projection remains the source; tree, canvas, navigation,
            selection, search, copy, persistence, and tool authority do not
            become window state; stale index rows stay inert; 42/48 px rows hold
Proof:      pure range/pinning tests, laptop/narrow scroll/search/select/copy
            flows, bounded open-index DOM count, and unchanged 2k release gates
Non-goals:  canvas virtualization, generic virtual-list dependencies, progressive
            material loading, ARIA treeview semantics, or relaxed performance gates
```

Only the non-authoritative left index may window after its complete authored
projection is known. Above a modest size threshold it renders top/bottom spacers
and an overscanned range; a focused DOM row remains pinned until focus leaves.
Search, focus, fold and a settled active node reset the index scroll to a
truthful reachable location. The whole sidebar remains inert while its deferred
projection is stale.

Implementation receipt: the render edge now keeps the complete projected index
as its source, but windows only projections above 200 rows using a 12-row
overscan and fixed CSS-measured 42/48 px geometry. Spacer heights are explicit
pixels, not CSS typed arithmetic. The standard Chromium 2k proof keeps at most
64 `.material-file` rows and 4,700 page elements, reaches and selects authored
row 1,999, and copies it together with the root across the two windows. Pure
range, focus-pinning, and scroll proofs pass. The original production 2k receipt
is still required: the isolated production server could not be started because
its necessary permission escalation was rejected, so no new p95/long-task claim
has been made and its existing gates remain unchanged.

Production diagnostic, 2026-08-04: the controlled `build → start → Chromium`
receipt (one diagnostic round and sample; formal receipt retains 20 samples)
recorded FCP `276 ms`, layout-ready `601.1 ms`, fold p95 `138.5 ms`, focus p95
`134.4 ms`, selection p95 `8.1 ms`, 4,257 elements, and a `320 ms` maximum
long task. It correctly failed the unchanged `<100 ms` long-task gate. Cold
marks attribute only about `1 ms` to height collection and `3.2 ms` to pure
layout; the approximately `310 ms` gap before the published-canvas commit is
the next bounded investigation. No result from this diagnostic is treated as
the final three-round release receipt.

Follow-up diagnostics kept the original gate and progressively isolated that
gap. Moving geometry publication to the DOM edge preserved 4,257 elements and
sub-120 ms structural p95s, but a `309 ms` cold long task still crossed the
geometry and state marks. Empty-lasso and idle-admission work was then removed;
the controlled result remained `309 ms`. Finally, a cancellable double-rAF
receipt separated the stages: a `285 ms` long task occurred *before* layout
state dispatch, in the geometry-frame-yielded to state-dispatch interval. This
proves the remaining work is the browser applying complete 2,000-node geometry,
not pure layout, selection, or React's state receipt. The next work must either
prove a platform containment policy preserves full material/pointer geometry or
record the incompatibility between a fully published initial 2k canvas and the
`<100 ms` initial long-task gate; no threshold has been widened.

Experiment withdrawal, 2026-08-05: cancellable double-rAF and 100-node-per-frame
geometry publication were both removed. The former created a reachable stretch
handle whose delayed epoch publication cancelled a just-started drag; constraining
it to cold/no-selection publication still did not remove the browser task. The
latter delayed geometry completion to about `525 ms` while retaining a `279 ms`
long task and leaving the receipt without layout-ready evidence. Current code is
therefore back to one synchronous, all-or-nothing geometry publication followed
by `setPublished`; its controlled diagnostic is FCP `128 ms`, layout-ready
`444.1 ms`, fold p95 `117.1 ms`, focus p95 `138.3 ms`, selection p95 `12.8 ms`,
4,257 elements, and `309 ms` maximum long task. The full normal browser suite
passes; the production long-task gate does not.

### Cold canvas containment decision — preserve the whole material or record the limit

State: Decision proven; candidate withdrawn.

```text
Outcome:    determine whether browser containment can keep the complete 2,000-node
            canvas pointer-ready while bringing every cold long task below 100 ms
Boundary:   one rendering-edge containment rule on the already-sized matter canvas,
            production attribution marks, and geometry/pointer comparison receipts
Invariants: all 2,000 nodes publish synchronously; DOM order, text wrapping, canvas
            bounds, lasso targets, stretch handles and authored geometry stay exact
Proof:      baseline versus candidate screenshots and bounding boxes; deep-node select,
            lasso and stretch receipts; three production rounds of 20 fold/focus/
            selection samples; FCP/layout-ready/element count and max long task
Non-goals:  content-visibility, canvas virtualization, delayed/batched geometry,
            hidden nodes, worker rendering, threshold changes, or new UI
```

The sole initial hypothesis is containment on the full `.matter-canvas` boundary,
whose width and height are already synchronously published from complete layout.
Per-node paint containment is excluded because split-language and stretch projections
may intentionally cross a thought box. The candidate may proceed only after browser
proof shows no clipping or geometry change. If the unchanged three-round production
receipt still exceeds the gate, record that a fully published initial 2k DOM is
incompatible with the current `<100 ms` cold-task target and return to product/renderer
architecture; do not revive the withdrawn frame schedulers or enter Phase 4.

Receipt, 2026-08-05: root-level `contain: layout style paint` preserved all 15
focused desktop/narrow geometry, deep-index, lasso and stretch browser receipts,
so clipping was not the failure. The controlled production diagnostic recorded
FCP `184 ms`, layout-ready `549.2 ms`, fold p95 `115.6 ms`, focus p95 `136.9 ms`,
selection `13.3 ms`, 4,257 elements and a `330 ms` maximum cold long task. The
candidate therefore worsened the existing approximately `309 ms` result and was
removed. Browser containment cannot satisfy the current gate while retaining this
complete initial DOM. The next decision belongs to product/renderer architecture;
Phase 4 remains closed and the `<100 ms` gate remains unchanged.

### Recommended renderer fork — viewport DOM over the complete layout

State: Recommendation only; requires a product/architecture freeze before build.

```text
Outcome:    every node remains in the authoritative tree and pure complete layout,
            while the DOM mounts the viewport plus bounded spatial overscan
Boundary:   CanvasThoughtList render edge, pure visible-world range projection,
            viewport/deep-navigation handoff, and screen-geometry publication
Invariants: structure and authored order stay complete; every visible node is
            pointer-ready; focus/deep selection first brings its node into the window;
            offscreen absence never becomes document, history, or retrieval state
Proof:      pure spatial-window completeness; pan/focus to first, middle and deepest
            nodes; lasso/stretch at every window edge; screenshot/box equivalence;
            unchanged 3×20 production gate and full laptop/390/320 pointer suite
Non-goals:  progressive frame publication, a lower protocol bound, hidden retrieval,
            canvas/WebGL text, authored coordinates, or relaxed performance thresholds
```

This is the recommended next route because the file index already proves the same
authority pattern: complete projection, bounded DOM. Progressive full-DOM publication
has twice produced pointer races or delayed readiness and stays rejected. A custom
canvas renderer remains a possible later route, but it would reopen native text
selection, accessibility and exact lasso geometry before the first release. This
recommendation deliberately changes the earlier “all 2,000 nodes mounted” renderer
assumption, so implementation must not begin until that product boundary is accepted.

### Canvas node DOM economy — one material control owns one geometry box

State: Candidate withdrawn after browser geometry proof.

```text
Outcome:    keep the complete 2,000-node canvas pointer-ready while removing the
            redundant list-item wrapper around every native thought button
Boundary:   CanvasThoughtList markup, split-projection element semantics, dependent
            rendering-edge selectors, and the existing browser/performance receipts
Invariants: every thought remains a native button with its complete accessible name;
            DOM order, authored order, text wrapping, layout boxes, lasso targets,
            split projection, selection, and pointer geometry remain exact
Proof:      full laptop/390/320 pointer suite; lasso/stretch and selected-label proof;
            2,000-node DOM budget; unchanged three-round <100 ms production gate
Non-goals:  canvas virtualization, hidden nodes, progressive publication, authored
            coordinates, custom canvas text, relaxed thresholds, or new product UI
```

Evidence: two identical three-round receipts after the selected-label DOM correction
kept the page at 4,314 elements but repeatedly produced `110–114 ms` maximum tasks.
A disposable text-height cache reduced the measured rounds to `93–99 ms`; the first
full structural remount still reached `106–107 ms`. The remaining repeated cost is
therefore the browser mounting two geometry elements for each thought, not pure layout,
height measurement, the file index, selection, or receipt noise. This evidence
justified testing whether the ordered-list wrapper was redundant; the browser receipt
below determines that candidate rather than treating the hypothesis as fact.

Withdrawal receipt, 2026-08-06: the native-button-only candidate passed typecheck
and lint, but failed the existing laptop/narrow geometry and lasso receipts. The
button's form-control box did not preserve the former positioning container: narrow
root material crossed the rail boundary, canvas drag could not find a visible text
target, and lasso selection lost its measured fragments and stretch handles. The
candidate and its selector changes were removed. The proven two-element geometry
owner remains; the viewport-DOM recommendation above is still the only open renderer
route, and it still requires a separate product/architecture freeze.

Preview audit receipt, 2026-08-07: list-level click delegation, structural root
styling, and direct fail-closed publication from validated layout boxes removed
per-node handlers and the redundant frozen publication model without changing
the two-element geometry owner. The full browser suite passed. The three-round
production receipt kept 4,349 elements, reduced most complete-tree tasks to
`88–96 ms`, and recorded an `83 ms` cold task, but isolated `113–115 ms` remount
spikes still failed the unchanged max gate. This is useful local economy, not
evidence to reopen the withdrawn markup candidate or bypass the viewport-DOM
freeze.

## Phase 4 — First release

### Fixture lineage and selected material affordance

State: Proven.

```text
Outcome:    the seeded thought opens as a three-level lineage, and selecting it is unmistakable in both the file index and canvas
Boundary:   deterministic fixture nodes, selected-state presentation, focused fixture and browser receipts
Invariants: fixture bootstrap still uses tree commands; lineage remains the only model context; selection stays transient and does not alter geometry ownership
Proof:      fixture shape assertions; wide and narrow sidebar selection receipts; existing full check and browser suite
Non-goals:  hidden retrieval, generated fixture content, a prompt surface, new node types, or persisted selection styling
```

State: Integration in progress after Phase 3 proof.

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

### Public discovery boundary — one canonical Matter identity

State: Proven.

```text
Outcome:    search engines, link unfurlers, and machine readers receive one
            canonical Matter identity: "A brain-computer interface for thoughts
            shaping," with complete discovery and structured metadata
Boundary:   centralized public URL and product metadata, root page metadata and
            JSON-LD, robots, sitemap, manifest, social image, and LLM text maps
Invariants: one resolver owns mount-versus-dedicated-domain URLs; internal preview
            and performance routes are noindex; metadata never exposes material,
            provider configuration, transcripts, or user state
Proof:      pure URL/config tests; typecheck and lint; production build; direct
            inspection of HTML, robots.txt, sitemap.xml, manifest.webmanifest,
            Open Graph image, llms.txt, and noindex routes under the default mount
Non-goals:  a marketing page, analytics, cookies, paid SEO tooling, external
            verification tokens, IndexNow submission, or claiming gated AI turns
```

## Current risks

- Phase 2 introduces the first browser-resource and network lifecycles. Voice,
  selection geometry, and late model results must remain transient until one
  revalidated tree command commits.
- Text addressing can be correct in pure tests and still fail after browser
  wrapping or font changes; Phase 2 requires browser proofs.
- Durability makes protocol mistakes survive reload; Phase 3 ships version
  rejection with its first writer, never afterwards.
