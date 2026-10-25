# Material connections — design proposal

Status: connection design proposal, 2026-10-16. The structural T0-D candidate
is built for review; authored associations remain design only. This note is
not a build freeze or a new document contract. Current code has a transient
hierarchy trail, not authored cross-links.
[`../material.md`](../material.md) still excludes cross-branch links. The owner
asked to work out the whole interaction before implementation, not to reproduce
every suggested hover or icon. The active plan owns promotion.

## Position: quiet material, callable relationships

Matter is material to think with, not a permanently displayed graph editor.
Relationships become legible when the person addresses material; editing a
relationship requires a further deliberate act. A visible line is not permission
to change structure, selection, or AI context.

Keep two meanings distinct:

| Relationship | Meaning | Proposed presentation and authority |
| --- | --- | --- |
| Parent → child | Authored growth, order and lineage; one parent per non-root node | Adjacent structural bridges, derived from the existing tree/layout; no new stored edge |
| Manual association | The person explicitly relates two existing passages; neither becomes the other's parent | A restrained dashed curve, stored with material only after a future protocol/tree-engine change; no arrow by default |

An association would belong to the same person's document and travel with it,
not live in a canvas-only store. That is the proposed meaning of “part of the
family tree.” It would not create a second parent, move a passage, imply a
causal/session sequence, or authorize the model to follow it. Making a passage
someone else's child remains the existing explicit reparent action. Confirm
this meaning before promoting manual links; if adoption was intended, do not
implement association as a substitute.

“Source” and “target” below are gesture roles only. The proposed saved
association is symmetric; those names do not supply direction or causality.

## Reveal and dismissal

The current `trailPresentation` owns hierarchy visibility: operation target,
then addressed open Inquiry, then selected passage; hover/focus alone does not
name a trail. Retain that precedence for T0. Proposed association interaction
adds a deliberate local action, not another global mode bar or permanent panel.
Its exact label/position must fit the real passage lens before it earns a control.

| Situation | What appears | What does not happen |
| --- | --- | --- |
| Reading; nothing addressed | Material and existing quiet index grammar | No full graph, persistent ports, invisible full-canvas line hit targets or network work |
| Fine-pointer hover / direct keyboard focus | Existing local action affordance; a future relation entry may live there | No ancestor/association fan-out, no selection or history change; another hover never steals an already selected trail |
| Click/tap selects a passage | Light structural trail under current rules; local actions remain reachable after pointer departure | No automatic relation-edit mode or connection handles on every node |
| Point and Talk / submitted material operation | Its existing addressed trail and target emphasis | Hover cannot replace its owner; dismissing a surface does not cancel submitted work |
| Deliberate “relations” action on a selected passage | Only its incident associations whose two endpoints belong to the current presentable address, plus the current root-to-source reference path | No graph-wide traversal, hidden-edge counts, automatic restoration of held branches, or AI scope expansion |
| Deliberate “connect” within that local relation action | One source port, eligible target cues on approach, one preview curve, and a pointer-reachable Cancel | No durable edge until a valid target is explicitly accepted |
| Select an already visible association | Its endpoints and one small contextual Remove action; no automatic endpoint jump | No bend-point palette, inline chat, or delete from mere line hover |

Mouse hover is a discovery aid, never the required path. On touch, select the
passage, then invoke the same local action. Keyboard focus exposes the same
available action with normal labels/focus rings. Connection supports both taps
and dragging; it does not require a long press, a modifier key, precise hovering,
or a 4-pixel hit target.

The proposed tap sequence is `inspect(source) → Connect → armed(source)`.
Connect arms the already addressed source; no second source tap is required.
One valid target tap commits once and returns to source inspection. A repeated
source tap, invalid target tap, blank press or Cancel ends the arm with no
commit, returning to inspection only if the source remains eligible. A drag
starts from that source's revealed port and uses the same accept/cancel rules.

Dismissal must follow ownership, not one universal “outside click” handler:

- Leaving a hover affordance removes only that affordance, with a small stable
  crossing region to reach it; it never clears selection or a submitted turn.
- Once relations were deliberately opened, moving the pointer away does not
  close them. Selecting other material closes that relation view before the
  normal selection action; ordinary background dismissal returns to the
  existing selection/reading state, not a newly invented canvas behavior.
- While connecting, a target tap or a valid drag release is the only commit.
  Releasing on blank/invalid space ends a drag without a commit; in tap-to-link,
  a blank press cancels. The explicit Cancel action always works without a key.
- Cancel, tool takeover, document replacement, lost pointer capture, or a real
  `pointercancel` removes the preview and target highlight and releases gesture
  ownership. They do not insert an edge or an Undo step. Escape cancels at most
  this layer, never also the underlying selection. Page hiding cancels this
  unsubmitted gesture, not an unrelated submitted AI turn.
- Consume the cancelled gesture's remaining release/click events: they cannot
  also select, pan, dismiss an underlying surface or activate a tool. Tool
  takeover is an explicit atomic ownership transfer or starts on a fresh
  gesture; it never leaves two owners processing the same pointer sequence.
  End/cancel is idempotent and owner-token checked: a late capture-loss event
  cannot undo a link already accepted or close a newer gesture.
- Relation controls yield to an active Lasso, Elastic or reparent gesture, voice
  capture, modal chrome and an owning AI presentation/delivery. A detached
  submitted background job alone is not a global ban on read-only relationship
  inspection. Editing still uses the existing target-conflict gates; material
  delivery must wait for pointer idle and revalidate its basis. Starting one
  gesture cannot acquire a second pointer owner.

If the source is deleted, held aside, folded out of presentation, outside the
active focus address, or belongs to a replaced document owner/epoch, close both
the arm and its inspection. If the current candidate becomes ineligible, cancel
the arm rather than retaining a sticky invisible target; retain source
inspection only if still valid. A changed layout alone triggers remeasurement,
not document mutation. Saved associations stay in the document, but are derived
again only when both endpoints are presentable; restoring a view never re-arms
a cancelled gesture.

The cancel affordance must remain reachable if the source leaves the viewport.
Far-target navigation must explicitly retain the source while using bounded pan
or an explicitly addressed index target; an ordinary index click must not
silently acquire new connection semantics. Verify this on the real page before
freezing either path. Do not solve distance with a permanent minimap/panel.

## Points, bridges and distance

Structural bridges join each actual parent-child pair at the passage boundary,
using `ColumnarLayout.edges` rather than the old above-passage anchor geometry.
A root → A → B chain is two bridges, never a shortcut root → B. Merge shared
segments only when they represent the same relationship, not because passages
happen to line up. Siblings have a common parent, not an invented sibling edge.

Manual links may join distant passages without walking through intermediate
ones. Geometry may travel through free inter-column/outer corridors, but a
crossing is not a junction or another relationship. No point is placed at an
arbitrary bend, crossing, viewport cut or suspended top anchor.

| Mark | Meaning and action |
| --- | --- |
| Index `› / ⌄` | Existing index-local disclosure; never canvas fold or link creation |
| Index terminal dot | Existing non-interactive local terminal; not a universal port |
| Structural canvas endpoint | Actual passage attachment, not a new generic button; the A/B visual hypotheses remain open |
| Manual source/target port | Small visible attachment only in relation/connection interaction, with a larger non-overlapping hit area and an accessible name |
| Curve body | Passive except when visible in explicit relation inspection; a separate invisible hit path may ease selection without obscuring text |
| Clip/occlusion boundary | A continuation, not a fake node or an invitation to reveal excluded content |

Do not add plus/minus to this vocabulary: they already mean working-context
hold/return. Do not rotate a canvas arrow as an apparent disclosure unless it
actually owns a declared fold action. Sharing the sidebar's stroke family is
not sharing the sidebar's behavior.

With an endpoint merely offscreen, clip the genuine route; offer deliberate
navigation only in relation inspection, with a return path. With an endpoint
held aside, hidden by structural fold, or outside the active focus projection,
do not expose its label/id/count or draw through it; recovery remains the
existing index action. A fold must not retarget
an association to the folded ancestor. On dense overlaps, prefer fewer addressed
edges and a usable local choice over drawing an illegible all-document web.

### Current structural marker candidate — T0-D

The owner authorized implementing the endpoint review as a narrow current
candidate, not the manual-association proposal. Use one solid round attachment
point (5px diameter) and the same point at 7px for the addressed target. A point
means attachment, not a terminal leaf or a connection-edit handle. Keep the
2.5px line, orthogonal route with bounded 4px corners, existing three 2.5px
omission dots and the genuine viewport continuation chevron. The ordinary
round line cap is line finishing, not another point symbol. Comparison arrows
and points are mutually exclusive visual hypotheses, never stacked glyphs.

The existing `OPERATION_TRAIL_PX` owns dimensions for geometry and rendering;
its screen stroke sizes reach CSS only as custom properties on the passive
trail host. Derive target and cue coordinates with inverse zoom, not stroke
widths. This keeps a later optical adjustment local without adding a theme
registry, another graph, measurement lifecycle or persisted preference. Palette,
entry/exit and addressing remain unchanged. No passive mark gains a click,
hover enlargement, rotating disclosure or animated flow. Future connection
handles still require their own declared action and accessible hit geometry.

The 4.5/6px T0-C frames remain the comparison baseline. Current light/dark,
compact/coarse and zoom/DPR automation is recorded in the
[`current handoff`](../handoff-post-preview-direction.md). Dense/device and
cross-browser visual qualification and the owner's acceptance remain distinct
from those local receipts; code or tests cannot settle the final vocabulary.

## Curve quality: stable, bounded, not noisy

Start with a cubic Bézier between measured ports. Choose the port side and exit
tangent from passage boundaries; clamp handle lengths against endpoint distance
and available clearance. Nearby links use one calm bend. Far links may use a
small number of obstacle-clearing corridor waypoints with continuous tangents.
Inflate passage and chrome rectangles by stroke/hit clearance: a route must not
cross readable text, images, controls, or its own endpoint passage.

Native SVG renders curves and dashes; a fixed “segment resolution” is not the
quality control. If routing/hit-testing needs a polyline approximation, use an
adaptive screen-space error bound (initial research range 0.5–1 CSS pixel),
with an explicit segment/work cap and zoom-aware conversion. Reject invalid
coordinates and refuse an unsafe route instead of drawing through content.
Measure routing work during pointer motion; update at most once per frame and
reuse the current layout epoch/obstacle geometry.

Beauty here comes from tangent continuity, spacing and stable routing, not
random wobble. Start without irregularity. If real-page comparison justifies a
hand-drawn softness, use a tiny deterministic offset keyed by relation identity,
never fresh randomness each frame. It cannot compromise endpoint accuracy,
clearance or repeatability. Manual control points and authored coordinates are
not part of the first proposal.

Round caps and restrained dash/gap lengths are candidates, not frozen tokens.
Keep perceived stroke, dash and hit widths usable across zoom and DPR; choose
non-scaling stroke versus explicit screen-space conversion with browser proof,
not both blindly. Test dark/light, forced colors and reduced motion. A dashed
cross-canvas link must not resemble Wiki's dotted word-underline. No marching
dashes, animated flow, glow or idle pulse.

During a drag, derive one preview from the fixed source and current pointer.
Snap to a candidate only after it becomes a valid target; show which passage
will receive the link. An invalid target changes neither material nor selection.
Port-side hysteresis prevents left/right flips at tiny pointer changes. When
layout/text/image size changes, recompute attachment from current geometry;
never persist screen coordinates or connect stale measured boxes.

## Proposed ownership and future promotion gate

Unify the *projection pipeline*, not the meanings. One render-edge connection
layer can share endpoint measurement, clipping, zoom, stroke and hit geometry.
Tree-derived hierarchy and authored associations remain distinct inputs; only
the latter needs new durable data. Keep pure geometry outside DOM measurement,
gesture state outside material, and durable validation inside the tree engine.
Interaction/presentation validates document ownership, current view, held/focus
eligibility and pointer lifecycle; the engine never reads those transient facts.
Do not create a generic graph store/router/plugin framework to anticipate this
second consumer; extract only the mechanics both real consumers need.

Before a builder starts, freeze the association meaning and then prove:

1. **Document life.** Strict versioned relation identity and existing endpoint
   ids; no self-link or duplicate unordered pair. Direct parent-child already
   has a structural bridge, not a second dashed one. Association cycles do not
   create parent cycles or change depth/order. Set finite edge/degree/byte
   limits from a measured fixture, with explicit refusal, not silent dropping.
2. **Atomic edits.** One accepted link/remove is one pointer-undoable command.
   Deleting a subtree removes incident links atomically; Undo restores both.
   Reparenting keeps node identities and reroutes associations. The interaction
   owner rejects held, out-of-address or stale-document-owner targets before
   submitting; the engine validates current durable endpoints, command basis,
   self/duplicate policy and limits. Remeasure a changed layout without treating
   an unrelated text edit as permission to misaddress.
3. **Durability and recovery.** Snapshot/journal/Archive validation, integrity,
   bounded history accounting and import/older-reader behavior evolve together.
   Archive must carry every durable association for exact long-term recovery;
   versioned representation and older-reader refusal remain to be designed.
   A missing endpoint is invalid data, not a line guessed at import. No new
   schema or migration is authorized by this proposal.
4. **Context and portability.** Associations never widen the current AI lineage
   window, reveal excluded endpoints or trigger recursive traversal. If a future
   receipt carries edges, it uses a new frozen grammar with only explicitly
   included endpoints. Copy and AI each need an explicit scope decision;
   do not bolt a links array onto every existing envelope or Receipt v1.
5. **Interaction proof.** Mouse drag, tap-to-link, keyboard equivalence,
   offscreen navigation/Cancel, pointer loss, tool/modal takeover, undo/deletion,
   view/fold/hold changes, restored documents and cross-tab replacement.
6. **Visual and cost proof.** Adjacent/deep/sibling/far/crossing/dense fixtures,
   narrow/laptop, light/dark, extreme permitted zoom/DPR, line/text hit priority,
   clipping and layout changes. Record actual-page screenshots and bounded frame
   cost, then independent review. A sketch or geometry test is not acceptance.

T0-A has now corrected the existing structural endpoint geometry, without
adding association data or new fold controls. Test-only A/B overlays on the
real page provide an initial endpoint receipt, not approval of marker sizes,
the broad visual/device matrix, or this interaction proposal. T1 resolves this
design against real-page prototypes. A later separately authorized slice may promote manual links only
after the gates above. Both lighter no-arrow bridges and sidebar-family open
arrows remain candidates until the owner sees the real product.

## Research boundary

The endpoint/geometry research and pinned XYFlow/tldraw/SVG sources are recorded
in [`integration-evidence.md`](integration-evidence.md). Borrow explicit binding,
separate hit geometry and native curve rendering, not their free-position
documents or whole editor infrastructure. Further relation-editing and curve
references should be appended there with what they do and do not establish.
No dependency or third-party source implementation is introduced by this note.
