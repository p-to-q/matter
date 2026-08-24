# Surfaces

This is the honest inventory. `implemented` runs today; `measured` has a current
performance receipt; `specified` is designed but not implemented; `unsupported`
is deliberately absent.

## Running rooted `0.2` slice

| Surface | Status | Evidence |
| --- | --- | --- |
| ThoughtTree kernel and exact reversible history | implemented | focused atomicity, ownership, pointer undo, keyboard redo, and reload tests |
| Full/focus/fold navigation | implemented | pure runtime tests and exact-lineage selectors |
| Rooted fixture renderer | implemented | pointer receipt at laptop and narrow widths |
| 2,000-node spatial renderer | measured | full canvas DOM and windowed file index; strict full-remount long-task gate remains open |
| Voice admission | browser-native in the public preview; fixture is local-only | Web Speech partials stay transient; MediaRecorder/multipart is an explicit non-fixture fallback |
| Punctuation lasso + shared stretch degree | implemented | pure segment/geometry tests and laptop/narrow browser receipts |
| Split-language projection | implemented | original text remains DOM owner; projection is aria-hidden/inert |
| Material files + IndexedDB durability | implemented | deterministic snapshot codec, generation conflict, reload/copy e2e |
| Transcript repair after admission | ordered local rules plus one managed proposal implemented; browser model remains gated | baseline paints immediately; one opaque 12-second lease may commit a separately undoable correction after a 650 ms visibility floor and exact document/node/semantic checks |
| Derived thought labels | implemented | deterministic derivation, adjudication, staleness and cancellation tests; ordered relay pool with corpus evaluation; durable per-node store and manual rename proven by reload e2e |
| Lightweight Matter inquiry | local bounded record and independently gated live adapter implemented | paper-contained questions, per-tree local completed-record behind the existing surface, no record-management control, material mutation, or model-memory retrieval |
| Fixture-gated transform turn | implemented | strict `/api/turn`, server-built plan, client revalidation, tree-engine commit, and exact undo/redo; live provider remains separately gated |
| Deployment health probe | implemented | `/matter/api/health` reports protocol, base path, app version, and per-surface gate status for voice, label, repair, inquiry, and transform |
| Fixed workbench shell + leaf atmosphere | implemented | 304 px desktop field, inset rounded paper, supplied silent loop/still, and five-slot editing island |
| Canvas-scoped corner utilities | implemented | 24 px desktop grid, existing lower-left guidance, static information, validated language/FX/appearance preferences, and desktop/mobile browser proof |
| Transient working context | implemented | held branches stay legible while selection, lasso, and bounded inquiry omit them; disclosure remains independent |
| Structural paper ruling + local node actions | implemented | FX-off-only one-layer ruling and one measured Branch/Focus lens; no document coordinates or per-node control mount |

## Specified for `0.2`

| Surface | Status |
| --- | --- |
| Single-root ThoughtTree and tree engine | implemented |
| Human material admission without generative rewrite | implemented with browser-native public speech; fixture HTTP path remains local-only |
| Punctuation segment addressing | implemented |
| Root-to-focus lineage context | implemented locally and in the fixture-gated transform envelope |
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
Turning that atmosphere off reveals the paper's structural ruling rather than a
blank canvas. The ruling follows the current derived column rhythm only as a
visual orientation aid: Pan and zoom project its cells, custom softened dash
rhythm, and open intersections through the same transient camera as material. The actual
material widths, gaps, and derived boxes remain unchanged. It cannot become a
coordinate, snap target, or second layout authority.
Matter's product icon is one Slate / Bone negative stone. The frozen 1024 px
master in [`../features/matter/brand/assets/`](../features/matter/brand/assets/)
owns the silhouette, 68% scale, palette, mineral background, and quiet internal
relief. Numbered static PNGs under `app/` publish exact 16, 32, 192, and 512 px
browser and installation sizes; `app/apple-icon.png` publishes the exact 180 px
Apple size. The browser-only 16 and 32 px outputs use the same silhouette at a
target-specific 60% composition; larger Apple and installation assets retain
the master's 68%. A smaller output may receive bounded raster-only treatment
for its declared pixel grid, but it cannot redraw or recolour the mark, become
a second master, or change any larger platform asset. The `p → q / matter`
footer lockup remains the separate parent identity. The manifest keeps
`theme_color` on the field grey
rather than the icon's ink: it colours the mobile address bar, which must meet
the top of the page, not the tab strip.

Browser installation is claimed at the manifest layer only: `standalone` display
with 192, 512 and maskable icons is what Chrome reads to offer "Install app".
**No service worker is registered**, so an installed window is this same online
surface in its own frame — it is not an offline copy, and it must not be
described as one. Durability is already IndexedDB's job; a cache layer would add
its own versioning and update story. Whether Matter ends up on mobile, on the
web, or on both — and whether those need separate builds — is undecided, so
installation stays this thin until that is settled.
The right editing island exposes exactly Voice → Lasso → Branch → Move → Undo.
Redo remains available through the platform keyboard conventions
`Cmd/Ctrl+Shift+Z` and `Ctrl+Y`; it is not a second visible rail tool.
Focus and fold remain navigation capabilities but have no first-release fixed-rail
presenter. One frosted local action field prefers the passage's upper-left edge
and may expose Branch and Focus
for the precise hovered or keyboard-focused passage, or Show all in focus view.
Its field and actions arrive in the same reveal. The disclosure control in the
left material outline remains a separate file-tree affordance. The field is
transient rendering state and never mounts one control set per node.

The paper corner system is presentation state only. About, pre-release pricing,
privacy and terms are static information rather than a support agent. Ask Matter
is the one secondary-input exception: it stays closed until requested, submits
one bounded question with lassoed passages or the bounded virtual-tree context,
keeps only a bounded local completed record, and cannot mutate material. Language changes canvas guidance and corner
copy, leaf FX pauses and hides only decorative media, and appearance scopes theme
tokens to the paper. Desktop controls follow a 24 px edge grid; below 768 px they
collapse into one paper-contained menu with inert background, bounded focus and
focus return. The left material field is outside this system.

The right-side canvas composition is frozen in
[`reference/ambient-workbench-ui.md`](reference/ambient-workbench-ui.md): the
rounded paper owns the atmosphere or structural ruling, the local action lens,
the right editing rail, and every corner utility. The left material field now
has its own first-release freeze: a quiet 304 px manuscript index with local
branch disclosure, transient working-context controls, flat search, copy
selection, archive access, and a non-account local identity. It remains outside
the paper-only tool vocabulary.

## Gated in this migration

Accounts, sync, collaboration, touch parity, cross-branch links, split/merge, a
durable memory service, permanent assistant UI, and a public SDK.

The public interface is a root-seeded preview. Its browser-native voice path is
enabled on `matter.ptoq.io` when the browser exposes Web Speech recognition; no
fixture transcript is used there. The transform route exists but a live provider,
account/sync, and the strict large-tree performance receipt remain gated. The
fixture path proves the prompt, degree bound, plan, revalidation, and command
translation without impersonating live generation. ZIP export/import is
available; directory export remains absent.
`/matter/api/health` is the machine-readable deployment probe; it must not be
read as a product capability claim. The exact implementation sequence is
[`../plans/active-tree-material.md`](../plans/active-tree-material.md).
Its current phase is release convergence: make the existing admission, repair,
label, transform-fixture, Undo/Redo, and reload paths truthful together. Its
endpoint is the first publicly usable release, not a speculative platform roadmap.
