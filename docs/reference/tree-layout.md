# Tree Layout

Module: `features/matter/layout/`

## Problem

Turn a tree into a stable rooted presentation, given that:

- nodes are variable-height passages of text, not uniform boxes;
- the intended look is top- or left-aligned with right-angle connectors — an
  outline made spatial, not a centered dendrogram;
- folding must change layout without a special case;
- no person ever authors a coordinate;
- layout must be a pure function so it can be tested without a DOM.

## Prior art

**Reingold–Tilford tidy trees**, and Buchheim, Jünger and Leipert's linear-time
version. The canonical answer to "lay out a tree neatly", implemented in
`d3-hierarchy`'s `tree()`. Gets right: sibling subtrees never overlap, and the
result is stable under small changes. Assumes uniform node size and centers
parents over their children — a dendrogram aesthetic.

**Outliner layout** (Workflowy, Logseq, any file tree). Depth-first flow: `x`
comes from depth, `y` accumulates down the document. Gets right: variable-height
rows are free, folding is subtraction, and the result reads as sequence rather
than as a diagram. This is much closer to what Matter wants.

**Orthogonal lineage guides.** Pseudo-elements or borders can draw the familiar
vertical-and-horizontal outliner elbows without a graph-routing model.

**IDE file trees.** Confirm that indentation plus a vertical guide line is
enough to read depth without drawing every edge — worth knowing before adding
connector styling.

## Earlier proof: nested semantic flow

The layout core is a deterministic depth-first projection:

```text
tree + fold/focus  →  visible preorder rows  →  renderer
      pure                  pure                 DOM edge
```

- A collapsed node contributes only its own height; its subtree is not visited.
  Focus is the same root-to-node selector used by context construction.
- Output order is semantic DOM order and never changes to satisfy a drawing.
- A renderer may not read coordinates back into the document or make them
  authorable.

The first `0.2` proof used semantic nested flow. Ordered nested DOM performs vertical
layout; depth establishes horizontal indentation; pseudo-elements or borders
draw quiet right-angle lineage guides. DOM preorder and visual preorder remain
identical. Text, selection, responsiveness, and accessibility therefore stay
native to the browser.

Measured explicit positions are an upgrade path, not a parallel implementation.
A bounded 20–50 node prototype may promote them only when it proves that nested
flow cannot express one named experience requirement, such as a required branch
alignment or fold transition. "More like a canvas" is not sufficient evidence.
Promotion deletes the nested renderer in the same change and adds no graph or
layout dependency.

That proof remains useful for semantics, narrow-width wrapping, and a fallback
projection, but product review found that it reads like one long conversation.
The final layout freeze is reopened: children must advance one derived column to
the right, first child and parent share a top edge, and siblings share a left
edge while packing downward. This remains a rooted, constrained canvas rather
than free placement. No code may treat the semantic prototype as the final
visual model while the measured columnar layout is being researched.

## Current choice: a top-anchored columnar tree

Matter presents a **spatial outline**, not a chat, mind map, or free canvas.
Structure produces one constrained two-dimensional arrangement:

- depth chooses a column, so nodes at the same depth share a left edge;
- every child column is to the right of its parent column;
- the first visible child shares its parent's top edge;
- later siblings begin below the complete visible subtree of the previous
  sibling;
- fold removes a descendant subtree from packing, while focus lays out only the
  exact lineage;
- dragging a selected non-root node may change its structural parent, but never
  authors or persists a coordinate; layout still derives every box from the
  resulting tree.

The restored hackathon surface renders this geometry as frameless text with no
persistent lineage connectors. The one exception is the **canvas trail**, drawn
only for a passage that is being addressed and never stored. The integration
candidate filters exact published parent-child edges; their existing gap
corridor remains authoritative. T0-A attached their container midpoints, but
owner screenshots exposed the empty space beside centred short text. The
reopened T0-B candidate measures visible canonical text at the rendering edge:
outgoing and incoming ports sit eight screen pixels outside the first real
text row's right and left edges. Row centres remain the default. T0-C removes
the typographic dogleg only for the actual top-aligned first child when both
measured first-row interiors admit one shared horizontal ordinate; pixel
snapping must keep it inside that intersection. All drawn siblings share that
parent's one outgoing port, and a target bead uses its resolved incoming port.
Without that measured compatible pair, retain actual centres and genuine turns,
never infer an unmeasured sibling. A different current projection may therefore
resolve a different in-row source ordinate; it is not another stored anchor.
Text/picture envelopes
bound the measurement; picture height never chooses a text port. Two small
four-pixel soft corners join orthogonal legs only when the rows actually
differ in height. Each adjacent step is its own bridge; no line crosses through
the passage between steps. A missing, stale, duplicate or inconsistent edge
or measured owner refuses the drawing rather than guessing by distance.
A single selected passage
also shows its children, and theirs while they fit, a little lighter; a branch
with more than six children, anything deeper than two levels below, or more
than eight grandchildren is cut at the first level with three dots on the last
child drawn. Siblings of the path are never drawn. It is derived every render
from the published layout by `trailPresentation` and drawn as one SVG beneath the
passages; its sizes are screen sizes at every zoom, it fades to nothing at the
paper's edge with one cue only where a real bridge continues, not where the
viewport cuts through a passage. An offscreen passage does not become a fake
point pinned to that edge. It is never a map. The local candidate uses a
2.5 CSS-pixel paper-mixed line, 5px ordinary points and a 7px target, with no halo or solid
triangle. Selected and operating differ in ink strength, not point size.
The existing downward omission keeps three 2.5px dots; actual viewport
continuation keeps the open chevron. Neither cue is a clickable fold or link.
`OPERATION_TRAIL_PX` owns screen dimensions: geometry reads it, the render edge
derives circle/cue coordinates with inverse zoom, and the existing passive host
projects stroke/ordinary-point/omission-point sizes into CSS. Non-scaling
strokes do not take inverse zoom again. The eight-pixel clearance is measured
from text to point centre, leaving 5.5px / 4.5px nominal ink clearance before
pixel snapping for ordinary / target points. These are current T0-D candidate
dimensions, not owner visual acceptance. Keep attachment centres and truthful
viewport clipping rather than moving a larger point to keep it visible.
No-arrow and sidebar-family open-arrow hypotheses remain real-page test-only
comparisons, not accepted final vocabulary. The
[`connection design proposal`](material-connections-design.md) owns their open
questions and the separate, unimplemented manual-association proposal.

| Situation | Trail |
| --- | --- |
| nothing selected, no operation | none |
| hover or focus alone | none |
| a passage selected (pointer, index, keyboard) | root → passage and its children, light |
| an AI operation addressed at a passage (Point and Talk, Elastic, text swap, picture) | the same trail at full strength; the endpoint keeps its size |
| the operation ends on a still-selected passage | back to light, no remount |
| selection moves from one passage to another | the drawing is replaced in place, no fade, shared ancestors do not blink |
| a top-level passage | its own bead only |
| Ask Matter open over lassoed passages | root → each passage, shared ancestors once, light, no children |
| Ask Matter over the whole working tree | none |
| a lasso nothing has asked about | none |
| focus view | none (the column already is the lineage) |
| selection cleared, a passage removed, Undo/redo that removes it | fades 100 ms |
| a result landed and nothing is selected | fades 160 ms |
| layout republished, or another epoch than the published one | cut at once, never stale |
| document switch, import, hydrate | cut at once (the layer is keyed by the document epoch) |
| node dragging or invalid visible text owner | no stale attachments; wait for current render geometry |
| reduced motion | no fade |

Only the bounded addressed set is measured. During Elastic expansion the
canonical button is transparent: its visible split text is measured instead,
with an exact canonical partition and clipped witness, excluding the hidden
tail and blank pocket. The measured flow already includes that pocket; its
finite expansion extent must never be added twice. Font/source replacement
invalidates an old receipt, while ordinary camera movement projects the same
world values rather than becoming material or a new layout owner. These
render-edge cases are part of T0-B's build/proof boundary, not proof of visual
acceptance or other browsers.
CSSOM containment permits at most one unzoomed canvas unit of rectangle
rounding, including the published bottom and source bottom plus expansion.
It does not relax exact parent-child edges, canonical text or first-row identity.

The root column is the viewport anchor: adding
material to the right or downward does not recenter the root. A transient camera
may pan or zoom the complete derived world, but it never changes node boxes
relative to one another. Thus every new child still appears to the parent's
right, first-child top alignment and sibling left alignment remain exact, and a
viewport gesture cannot author a coordinate.

When leaf atmosphere is disabled, one render-only structural ruling may echo the
existing column step as an orientation aid. Its world origin and cell topology
are projected through the same transient Pan/zoom camera as material; visible
dash, gap, and transparent crossing clearance scale with that topology, while a
fixed `1.4px` filled thickness and custom softened Bézier ends preserve quiet
readability. The ruling remains outside
this layout result: no node reads it, no line is a hit target, and camera motion
never converts it into authored coordinates. Material widths, gaps, packing,
and root anchoring stay authoritative; the ruling derives from their rest
geometry rather than changing it.

The DOM edge measures fixed-width text boxes in CSS pixels. A pure `layout/`
function computes subtree heights bottom-up and node positions top-down in
`O(visible nodes)`. It receives serializable projected nodes, measurements,
column width and gaps, and returns boxes, lineage edges, content bounds, and the
same `layoutEpoch`. Measurement is not document state.

Publish geometry only for a complete epoch. Until every visible node has a
valid measurement, keep the previous complete geometry instead of mixing old
and new boxes. Width, font, text, visibility, or zoom invalidates the relevant
measurement epoch; a text-size cache may remain disposable and derived.

At narrow widths, reduce column width and gaps only to their defined lower
bounds. Preserve horizontal lineage and allow bounded horizontal viewport
movement or scrolling rather than folding children back underneath their
parents. Viewport offset and zoom are transient presentation state, never tree
material.

Keeping measurement out of durable structure is the whole design. It makes
visibility and order pure and the no-authored-coordinate rule checkable rather
than aspirational.

## Rejected

**`d3-hierarchy`'s `tree()`.** Rejected on aesthetics and on fit: it centers
parents over children and assumes uniform node size, and Matter's nodes are
paragraphs of wildly differing height. Using it would mean fighting it on both
counts to arrive at an outline.

**Force-directed layout.** Rejected outright. It is non-deterministic, it
animates toward a result rather than having one, and it produces exactly the
drifting cloud that the rooted tree exists to avoid.

**Any layout requiring a physics tick or a settling animation.** Rejected for
the same reason: a person must be able to point at a thing that is not moving.

**Using DOM readback as layout truth.** Rejected. The browser may measure text
boxes, but the pure engine owns packing and alignment. Post-layout coordinates
remain transient and may never enter material.

**Storing computed positions in the document.** Rejected — they are derived
state. Writing them into the tree would make position durable, which is the
first step back toward an infinite canvas.

## Performance gate

A pure 2,000-node traversal is not the risk; local probes complete well below a
millisecond. Before virtualization, profile the actual renderer at 2,000 nodes
and record DOM count, long tasks, fold cost, wrapped CJK selection latency, and
narrow-width behavior. Render only visible nodes. Add virtualization only after
that evidence, because unmounting text changes lasso, focus, and accessibility
semantics.

Required tests cover authored child order, fold exclusion, exact focus lineage,
DOM/visual preorder agreement, variable-height non-overlap, font/width
invalidation, and laptop/narrow viewport Playwright walks. Focus view ignores
folds on its exact root-to-focus path; full view omits folded descendants.
Pointer-primary never means keyboard or screen readers are deliberately broken.
