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

For a horizontal text column with logical inline edges `S` and `E`, an interval
starts at `(startRow, startInline)` and ends at `(endRow, endInline)`. Its row
bands are:

```text
only row     [startInline, endInline]
first row    [startInline, E]
middle rows  [S, E]
last row     [S, endInline]
```

The lower grip makes the interval `selection start -> slot end`, so the first
row continues to `E` and every later row through the slot is full-column. The
upper grip mirrors it as `slot start -> selection end`. At amount zero there is
no slot and the formula reduces to the neutral selected range. RTL mirrors the
logical axes; an unsupported writing mode fails closed until it has a proven
projection.

The contact impression follows one glyph-relative optical family. Top and
bottom outset are the same measured value; inline outset remains wider at a
`.245 / .36` glyph-box proportion. The precise address uses a fixed `3px`
client-space corner, while structural whole-node material keeps its independent
`.08` block outset and `.44` row-height corner so the older whole-node state
does not become a full-line marker; those two structural proportions are one
optical pair and must be retuned together. Known inter-row leading is a safety
ceiling and may reduce either block outset below its nominal `2px` minimum; it
never makes the mark expand into a full-line marker. On a wrapped actionable or structural
interval, a real first/last endpoint within the existing type-relative optical
threshold of its logical column edge snaps outward to that edge. The snap
threshold is independent of the painted corner, so an optical radius adjustment
cannot silently change topology. A single-row interval, native copy range, or
wider gap keeps its exact endpoint. RTL mirrors the rule.

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
