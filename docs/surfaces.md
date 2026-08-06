# Surfaces

This is the honest inventory. `implemented` runs today; `measured` has a current
performance receipt; `specified` is designed but not implemented; `unsupported`
is deliberately absent.

## Running rooted `0.2` slice

| Surface | Status | Evidence |
| --- | --- | --- |
| ThoughtTree kernel and exact inverse history | implemented | focused atomicity, ownership, bounds, and undo tests |
| Full/focus/fold navigation | implemented | pure runtime tests and exact-lineage selectors |
| Rooted fixture renderer | implemented | pointer receipt at laptop and narrow widths |
| 2,000-node spatial renderer | measured | full canvas DOM and windowed file index; strict full-remount long-task gate remains open |
| Voice admission | browser-native in the public preview; fixture is local-only | Web Speech partials stay transient; MediaRecorder/multipart is an explicit non-fixture fallback |
| Punctuation lasso + shared stretch degree | implemented | pure segment/geometry tests and laptop/narrow browser receipts |
| Split-language projection | implemented | original text remains DOM owner; projection is aria-hidden/inert |
| Material files + IndexedDB durability | implemented | deterministic snapshot codec, generation conflict, reload/copy e2e |
| Derived thought labels | implemented | deterministic derivation, adjudication, staleness and cancellation tests; ordered relay pool with corpus evaluation; durable per-node store and manual rename proven by reload e2e |
| Deployment health probe | implemented | `/matter/api/health` reports protocol, base path, app version, and gated surface status |
| Fixed workbench shell + leaf atmosphere | implemented | 304 px desktop field, inset rounded paper, supplied silent loop/still, and five-slot editing island |
| Canvas-scoped corner utilities | implemented | 24 px desktop grid, existing lower-left guidance, static information, validated language/FX/appearance preferences, and desktop/mobile browser proof |
| Lightweight Matter inquiry | route implemented; model gated | the one AI entry point: `/api/inquiry` accepts a question plus the root-to-focus lineage, answers with a stated reason and a receipt, and stores nothing; context projection, contract, route and client are all covered |

## Specified for `0.2`

| Surface | Status |
| --- | --- |
| Single-root ThoughtTree and tree engine | implemented |
| Human material admission without generative rewrite | implemented with browser-native public speech; fixture HTTP path remains local-only |
| Punctuation segment addressing | implemented |
| Root-to-focus lineage context | implemented locally; agent envelope pending |
| Derived rooted layout with transient focus and fold | implemented |
| Markdown snapshot and local durability | implemented |
| Explicit ZIP export/import; directory export | ZIP implemented; directory export specified |

`0.2` uses a Matter-native pure kernel and a measured top-anchored columnar
renderer. No editor, canvas SDK, layout framework, or CRDT is part of the
foundation.

The desktop presentation boundary is fixed: the left material field is 304 px,
and the paper begins at that boundary with a 10 px outer gutter and 18 px radius.
At desk widths the file index is permanently docked in that field and carries no
open/close control; below 960 px it becomes a drawer with one. Either way the
paper never enlarges. The root names the outline, descendant rows step right by
structural depth, and each branch expands or closes in place without changing
canvas fold state. Search is a flat result view whose rows carry ancestry paths.
The tree shadow is the supplied decorative asset inside the paper, never document state.
`app/icon.svg` is explicitly provisional and is not the product mark: it draws
the same rooted figure the material index draws, on ink and paper only, sized so
it survives 16 px. `app/apple-icon.tsx` renders that same figure full-bleed at
180 px because iOS masks its own corners, and `/icon-192.png` and `/icon-512.png`
render it again for installation. All of them come from
[`../features/matter/brand/icon-mark.ts`](../features/matter/brand/icon-mark.ts)
so they cannot drift; `app/icon.svg` is the one hand-kept copy, because a static
file cannot import. All may be replaced without a product-contract revision. The
manifest keeps `theme_color` on the field grey rather than the icon's ink: it
colours the mobile address bar, which must meet the top of the page, not the tab
strip.

Browser installation is claimed at the manifest layer only: `standalone` display
with 192, 512 and maskable icons is what Chrome reads to offer "Install app".
**No service worker is registered**, so an installed window is this same online
surface in its own frame — it is not an offline copy, and it must not be
described as one. Durability is already IndexedDB's job; a cache layer would add
its own versioning and update story. Whether Matter ends up on mobile, on the
web, or on both — and whether those need separate builds — is undecided, so
installation stays this thin until that is settled.
The right editing island exposes exactly Voice → Lasso → Branch → Move → Undo.
Focus and fold remain navigation capabilities but have no first-release canvas
presenter; the disclosure control in the left material outline is a separate
file-tree affordance.

The paper corner system is presentation state only. About, pre-release pricing,
privacy and terms are static information rather than a support agent; the help
control contains no prompt, form or transcript. Language changes canvas guidance
and corner copy, leaf FX pauses and hides only decorative media, and appearance
scopes theme tokens to the paper. Desktop controls follow a 24 px edge grid;
below 768 px they collapse into one paper-contained menu with inert background,
bounded focus and focus return. The left material field is outside this system.

The right-side canvas composition is frozen in
[`reference/ambient-workbench-ui.md`](reference/ambient-workbench-ui.md): the
rounded paper owns the atmosphere, the right editing rail, and every corner
utility. The left material field now has its own first-release freeze: a quiet
304 px manuscript index with local branch disclosure, flat search, copy selection,
archive access, and a non-account local identity. It remains outside the
paper-only tool vocabulary.

The lightweight inquiry is now mounted, and this paragraph is the
product-contract revision that permits it. **It is the only AI entry point in
the product**, and it is deliberately the smallest one: one question, one
context, one answer.

It has no panel. It appears only when the "Ask Matter" control is pressed —
pressing again dismisses it — and then sits directly on the paper, dismissed
like a menu rather than trapped like a dialog. A question about the material
must not hide the material. It opens as a single line and grows as an exchange
accumulates, showing one exchange at a time with the rest a scroll away. A
question leaves from the right and is answered from the left, and the two sides
never share a fill.

**The context is the boundary.** A question carries the root-to-focus lineage
that is already on screen and nothing else — the same promise the privacy copy
makes, projected once in
[`../features/matter/material/inquiry-context.ts`](../features/matter/material/inquiry-context.ts)
so the promise and the payload cannot drift. Each passage is bounded, the whole
context is bounded, and when the budget bites it is the middle ancestors that go
— the root states the document and the focus states the subject. A clipped
context says that it was clipped.

`/api/inquiry` is a real route, built on the same bounded-JSON boundary as the
label route: a declared size is not trusted, the stream is bounded while read,
malformed UTF-8 is refused, and a deadline or disconnect is attributable. It
parses, answers, and drops the question — **nothing writes it to a log, a store,
or a third party**, and the response never echoes it back. **No provider is
configured in any deployment**, so every question resolves to `NO_PROVIDER`
alongside a receipt of what the request actually carried. That receipt is the
difference between "nothing happened" and "nothing was ever going to happen".
Wiring a provider replaces one branch in `answerInquiry` and nothing else has to
move.

The exchange is session memory only: capped at 40 turns, never written to
material, never persisted, gone on reload. The remaining constraints are
unchanged and still binding: it cannot mutate material, invoke tools, or become
the primary path. Its states are covered by `inquiry-composer.test.ts`,
`inquiry-context.test.ts`, `inquiry-route.test.ts` and `inquiry-client.test.ts`,
and `CanvasChrome.test.ts` guards that the chrome exposes exactly one closed
composer.test.ts`](../features/matter/components/inquiry-composer.test.ts),
and `CanvasChrome.test.ts` guards that the chrome exposes exactly one closed
composer.

## Gated in this migration

Accounts, sync, collaboration, live streaming transcription, touch parity,
cross-branch links, split/merge, memory retrieval, assistant UI, and a public SDK.

The public interface is a root-seeded preview. Its browser-native voice path is
enabled on `matter.ptoq.io` when the browser exposes Web Speech recognition; no
fixture transcript is used there. `/api/turn`, account/sync, and the strict
large-tree performance receipt remain gated. ZIP export/import is available;
directory export remains absent.
`/matter/api/health` is the machine-readable deployment probe; it must not be
read as a product capability claim. The exact implementation sequence is
[`../plans/active-tree-material.md`](../plans/active-tree-material.md).
Its current phase is the visible/durable Matter slice; its endpoint is the first
publicly usable release, not a speculative platform roadmap.
