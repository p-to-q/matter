# Selected material flow interval

Status: implementation contract for the selected-material geometry slice. It
supersedes only the use of hidden suffix layout as the moving-partition
authority, plus fragment-connector and neck/body geometry in
`text-material.md` and `selected-material-freeze.md`. Product lifecycles,
palette, grip shape, grip count, commit threshold, protocol, context policy,
tree mutation, and pointer Undo remain unchanged.

## Evidence that reopened the prior freeze

The previous composite renderer produced three repeatable defects:

- a wrapped selection omitted the continuation to the text column's logical
  inline end, the next line's logical inline start, and the shoulder from the
  selected range into the opened slot;
- the slot could cover the first line or leave a detached narrow bridge because
  fragments, connectors, neck, and body were generated independently;
- the suffix retained the old partition's wrapping instead of reflowing in the
  complete text column before the surface was redrawn.

These are topology and layout-authority failures. Opacity, radius, overlap, and
extra connector rules cannot repair missing semantic regions.

## One object

The visible object is one continuous interval in reading order over the final
projected line grid. It is not a union of glyph rectangles plus a separate
pocket.

Every glyph row is bounded by the language it contains. Only the interval's two
real endpoints clip the boundary rows:

```text
only row     [startInline, endInline]
first row    [startInline, row.end]
middle rows  [row.start, row.end]
last row     [row.start, endInline]
```

An earlier version filled each row out to the column's logical edges. That is
honest reading order for text set flush to those edges, which is how a browser
paints multi-line selection. This material is centred: a row's glyphs are inset
from both sides, so the region between a column edge and the glyphs belongs to
no line. Claiming it produced a wide first row above a narrow band pinned to
the far side of the column, and the shape a node received depended on how its
text happened to wrap.

Centring also makes that fill unnecessary. Every row shares one centre axis, so
any two rows overlap and the outline stays one connected shape on its own.

The opened slot is not a glyph row. It is inserted column space, so it does
reach both edges and meets its neighbour in a symmetric step. The lower grip
makes the interval `selection start -> slot end` and the upper grip mirrors it.
At amount zero there is no slot and the formula reduces to the neutral selected
range. RTL mirrors the logical axes; an unsupported writing mode fails closed
until it has a proven projection.

Every variant traces the language it addresses, whole-node included. Following
the glyphs is what the mark is for, so a whole-node address may not collapse
into a plain column rectangle because its rows happen to be ragged. The grips
already depend on this: each one centres on its own line's real glyph midpoint,
so a band that ignored the glyphs would leave its grip floating beside it.

A whole-node address also reads line by line. The label it replaced cloned its
decoration per line box, so the leading between two lines was never filled, and
joining the rows into one region turned a stack of lines into a slab. Its rows
stay separate capsules; a precise address, which marks one continuous run of
language, still resolves to a single region.

The contact impression follows one glyph-relative optical family. Top and
bottom outset are the same measured value; inline outset remains wider at a
`.245 / .36` glyph-box proportion. The precise address uses a fixed `3px`
client-space corner, while structural whole-node material keeps its independent
`.08` block outset and `.44` row-height corner so the older whole-node state
does not become a full-line marker; those two structural proportions are one
optical pair and must be retuned together. Known inter-row leading is a safety
ceiling and may reduce either block outset below its nominal `2px` minimum; it
never makes the mark expand into a full-line marker. No endpoint is snapped
outward to a column edge. That rule read a small gap as a missing paper cell,
which is a fair reading for text set flush to the edge; centred rows are inset
by the alignment instead, so snapping claimed the gutter on one side while the
opposite edge stayed on the glyphs and left the first row visibly lopsided.

One rounded orthogonal outline paints these bands exactly once. There are no
fragment connectors, neck, body, seam overlap, or density-compounding children.

## Measurement and projection boundary

The sequence is fixed:

1. determine the semantic range, its protected outer seam, and the top/bottom
   flow partition. Request and commit continue to own only `selectedText`; the
   painted address additionally covers the visible punctuation and closing
   marks that travel with the material. Trailing seam whitespace remains in
   layout but never widens the painted address;
2. write the projection DOM;
3. let the moving partition reflow in the complete text column; an invisible
   source witness may preserve the fixed partition but cannot supply the moving
   partition's line boxes;
4. measure one post-layout `ProjectedLayoutReceipt` in client CSS pixels;
5. project degree, direction, slot depth, and attachment with pure arithmetic;
6. paint one outline.

The receipt is disposable and keyed by address, document, layout, viewport, and
partition. Font readiness, width, zoom, scroll, visual viewport, text, selection,
or writing-mode change revokes it before remeasurement. A stale receipt never
paints and never keeps grips interactive.

Pointer movement reads no Range, `offsetHeight`, or bounding box and publishes
no React state. A partition or layout epoch performs at most one forced-layout
measurement; release may remeasure once before pending handoff.

## Input continuity

The pointer deadzone is fixed in client pixels and completely quiet. Effective
travel is `max(0, abs(rawTravel) - deadzonePx)` with the original sign. Degree
begins only after that boundary.

Attachment is a pure function of amount, never of input mode. It completes by
amount `0.1`, below the `0.15` commit threshold, so the first keyboard step and
an equal pointer/touch amount produce the same outline. Attachment is transient
presentation and never enters the material document, command history, request,
or model context.

## Whole-node selection and native copy

The whole-node structural state reached by pointer selection uses the same
neutral outline instead of per-line cloned capsules. It keeps its current
light/dark density and does not acquire Elastic grips merely because it shares
geometry. The old label paint remains a fallback until the single outline is
confirmed painted, preventing a handles-only or focus-ring-only frame.

A non-collapsed, single browser Range inside one material text node uses the
same neutral outline authority without grips or slot. The browser Selection
remains the copy and accessibility authority. Native range ownership
synchronously supersedes a structural outline during a real double-click, then
restores the cached structural address only after the range collapses; the two
states never paint together.

Custom paint suppresses the native background only while a current receipt is
already paintable. Measurement failure, more than 64 visual rows, a cross-node
range, multiple ranges, input/composer text, lasso entry, or unsupported writing
mode fails open to the browser highlight. Forced colors always retain the
system `Highlight` contract.

## Preserved boundaries

- the two existing 22x2 grips and their hit areas, colors, and mirrored physical
  rules do not change;
- actionable and structural light/dark densities remain their current visual
  baselines; native copy remains its own quieter browser-selection state;
- the server still receives a strict serializable amount in `[0,1]`, never DOM
  pixels; grapheme expansion policy remains server-owned;
- Elastic, Point and Talk, native copy, and structural selection keep separate
  lifecycles and protocols. They may share address, receipt, outline, anchors,
  palette, and handoff primitives without becoming one reducer.
