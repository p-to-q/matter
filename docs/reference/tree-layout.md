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

The restored hackathon surface renders this geometry as frameless text without
visible lineage connectors. The root column is the viewport anchor: adding
material to the right or downward does not recenter the root. A transient camera
may pan or zoom the complete derived world, but it never changes node boxes
relative to one another. Thus every new child still appears to the parent's
right, first-child top alignment and sibling left alignment remain exact, and a
viewport gesture cannot author a coordinate.

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
