# Integration evidence — 2026-10-16

This is a bounded research and verification record for the active integration,
not a replacement roadmap. The active plan freezes builds; workflow.md owns
the six review questions. No external implementation was copied and no
dependency was added.

## Trail: use the existing relationship geometry

At baseline `c3b96c2`, `operationTrailNodes` selects real lineage nodes, but
`placeAnchors` puts their marks 36 screen pixels left of the passage and up to
24 pixels above it. Consecutive first children share the parent's top edge.
In the focused 200-pixel box / 40-pixel gap example, three anchors therefore
sit at x = -36, 204, 444 and y = -24. Adjacent logical edges look like one
uninterrupted line suspended above three columns.

`ColumnarLayout.edges` already publishes adjacent parent-right-middle to
child-left-middle bridges. T0-A now filters and validates
those exact edges for the existing resolved lineage, refusing a missing or
inconsistent relationship. Keep operation/selection ownership, limits, current
layout epoch, camera and presence unchanged. This removes a second geometry
authority rather than adding a router or graph package.

Prior art inspected by the trail researcher:

- [XYFlow routing from explicit handles](https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/edges/smoothstep-edge.ts)
  and [separate path/marker presentation](https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/Edges/BaseEdge.tsx).
- [tldraw terminal geometry](https://github.com/tldraw/tldraw/blob/9bbecbe7973d0b6103adc441410662f04d2658e9/packages/tldraw/src/lib/shapes/arrow/shared.ts)
  and [route/arrow interpretation](https://github.com/tldraw/tldraw/blob/9bbecbe7973d0b6103adc441410662f04d2658e9/packages/tldraw/src/lib/shapes/arrow/getArrowInfo.ts).
- [SVG 2 painting](https://www.w3.org/TR/SVG/latest/painting.html) for non-scaling
  strokes and marker behavior.

Borrow endpoint ownership and the separation of geometry from visual markers.
Do not borrow another editor's free-position document, general router,
dependency, or visual style. Reopen if actual layout edges cannot clear text
under a proven layout/occlusion case. Do not restore gutter routing by default.

Visual hypotheses remain unaccepted: A uses 2.25-pixel bridges, no per-edge
arrow and lighter ink; B uses 2.5-pixel bridges and an open sidebar-related
right arrow at each child. Optional circles are a separate choice. Remove the
first version's filled triangles, per-ancestor beads and ellipses from those
candidates. Review real-page selected/operating/Inquiry, light/dark,
laptop/narrow, deep first-child chains, siblings, shared ancestors, zoom and
clipping before selecting the final vocabulary. Pure geometry tests are not a
visual acceptance receipt.

The owner's subsequent feedback is captured in the design-only
[`material connections proposal`](material-connections-design.md): quiet
reading, deliberate relationship disclosure, exact dismissal/gesture ownership,
semantic points, and later manual dashed associations. It does not promote
cross-branch links into the current tree/protocol. Independent review tightened
transient-versus-durable validation, hidden-edge exclusion, Archive recovery,
and cancellation event consumption. The two structural styles remain open;
neither was accepted by this research. The later execution pass implemented
only structural geometry and captured both styles through test-only overlays
on the real page; it did not select a production style or add manual links.

### Relationship interaction references

The T1 reviewer and a separate reference reader checked the following primary
sources. These resolve interaction/lifecycle mechanisms, not Matter's visual
acceptance or permission to change its document model:

- [WAI-ARIA Treeview](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): branch
  disclosure is a real expand/collapse action; end nodes do not carry
  `aria-expanded`. Borrow the branch/leaf and focus/selection distinctions,
  not a whole-row toggle or a new canvas fold control.
- [React Flow handles](https://reactflow.dev/learn/customization/handles),
  [connection events](https://reactflow.dev/examples/interaction/connection-events),
  and [connection end](https://reactflow.dev/api-reference/types/on-connect-end):
  explicit ports, valid connection versus end/cancel, and a click/tap path
  distinct from dragging. Borrow transient preview, validity and complete
  cleanup; do not introduce persistent handles, its graph store or auto-pan.
- [tldraw bindings](https://tldraw.dev/sdk-features/bindings): stable endpoint
  identity and endpoint move/delete/copy lifecycle. It is a checklist, not
  authorization for a binding registry. Its directional from/to fields do not
  define Matter's proposed symmetric association. Do not borrow temporary
  shapes written to history and rolled back: Matter's gesture stays transient.
- [Pointer Events capture](https://www.w3.org/TR/pointerevents3/#pointer-capture)
  and [cancellation](https://www.w3.org/TR/pointerevents3/#the-pointercancel-event):
  one captured gesture and explicit cleanup. The standard does not decide
  whether an invalid tap keeps a product armed; Matter's proposal cancels it.
- [SVG cubic paths](https://www.w3.org/TR/SVG2/paths.html#PathDataCubicBezierCommands),
  [dashes](https://www.w3.org/TR/SVG2/painting.html#StrokeDashing), and
  [hit testing](https://www.w3.org/TR/SVG2/interact.html#PointerEventsProp): native
  curve/dash rendering and a distinct stroke hit path. Preview and structural
  lines stay passive. A wider hit path exists only beside an explicitly visible
  inspected association, never as invisible canvas-wide interception. Native
  SVG/non-scaling stroke does not prove tasteful dash rhythm at every zoom/DPR.

The design now resolves tap arming and invalid/source/blank cancellation,
fold/hold/owner changes, and gesture roles versus undirected saved meaning.
The far-target navigation path remains a build blocker pending real-page
prototype evidence. No source inspection proves the proposed routing cost,
device accessibility or visual craft; those remain measured promotion gates.

## Web Locks: failure is not acquisition

The [Web Locks specification](https://w3c.github.io/web-locks/) distinguishes a
normal `ifAvailable` callback receiving `null` from failure of the lock request.
At baseline, a present lock manager's synchronous throw or asynchronous reject
resolved `shareAcrossTabs()` to true. Two tabs could both proceed without
proving ownership of the paid lane, and the tests required that fallback.

The lock-1 slice changes those two failures to denial. A completely absent API
retains the explicit per-page fallback. Driver counterexamples require zero
request, no pending work and complete local cleanup after either failure.
Ordinary acquisition, contention and release keep their owner and lifecycle.

This is browser coordination, not provider idempotency or a distributed spend
budget. An unload may release the lock while upstream work still costs money.
Edge admission, durable spend control and a real provider receipt remain gates
before production drawing opens. No browser-only change can close them.

## Identity: entropy failure must preserve the action

The ID-1 slice shares one interaction-layer entropy owner between existing
Inquiry and Text Swap consumers. Secure UUID and secure random bytes are valid
sources; time, counters and Math.random are not a fallback. Domain code keeps
receiving identity as a value. Reference:
[Web Cryptography random values](https://w3c.github.io/webcrypto/#Crypto-method-getRandomValues).

The important counterexample is the caller: if entropy is unavailable or throws,
preserve the draft/direction and original material, make no request and expose
the existing retryable/unavailable behavior. A secure helper with an uncaught
exception at the gesture would not complete this slice. Other identity sites,
picture Keep attribution and receipt naming remain separately scoped work.

## Independent review and remaining evidence

The trail researcher checked the existing three pure state/geometry/presence
suites (77 tests), found the geometry mismatch and left source unchanged. The
robustness auditor independently found lock-1 and then built only its frozen
correction; the integrator separately inspected the diff and reran its four
error counterexamples. A different verifier reviews R0 and ID-1.

This research record is not a deployment receipt. The earlier integration
receipt recorded 320 passed, 16 skipped and 2 failed browser cases, including a
repeated completion/presence failure. The later execution pass has built P0's
first-paint/pending delivery boundary, T0-A's structural geometry and C3-A's
14-case characterization, with independent reviews. Its first complete browser
run passed 323, skipped 16 and failed the focus-ring journey. Waiting for
Rewrite enablement did not solve that race.

P0-F added a deterministic placement observer that chooses Voice before the
opening rAF; the unmodified autofocus took focus back and failed the new test.
The correction remains in that existing callback: preserve an already chosen
field control or a newer outside focus target. Independent lifecycle review
also reproduced a spoken-direction return to ready after request-ID refusal.
The first opening is consumed only inside the actual rAF; subsequent ready
returns cannot inherit an outside target as an opener. The ordinary ring journey now
starts from actual input focus, retaining every Tab order and ring assertion.
The handoff owns the final full/repeated browser result; a passing narrow run
does not erase a complete-run failure or prove visual/release acceptance.

## Owner correction: sample Branch is not Voice admission

Local source history resolves the removed affordance: `01c631a` introduced
hover Branch, `c25712b` removed it from that lens, and `7058a51` later hid the
rail Branch while introducing Under. The retained Branch path still composes
closed local samples through `insert-child` → `extendMaterial` → the tree
engine/history. Restoring only a glyph would therefore be incomplete.

B0 restores both entries in the explicit local Preview Branch build. The hover
port revalidates its exact node rather than borrowing a different rail
selection; the default build retains Under. Known seed parents have sample
continuations, but the arbitrary-node fallback does not inspect source text.
No contextual generation, prompt, provider or deployment capability is inferred
from this restoration. The handoff owns its current browser receipt.

## T0-B: visible rows and invalidation belong at the rendering edge

Owner screenshots exposed the distinction between a true parent-child edge and
a visibly attached one: centred text may occupy only a fraction of its column,
and a wrapped paragraph's whole-envelope midpoint is not its first row. T0-B
retains the published adjacent topology/gap corridor but attaches measured first
row ports. A real row-centre difference remains a small orthogonal step; code
never flattens mismatched coordinates merely to look parallel. Complete
text/picture envelopes bound the receipt and continuation cue, not text ports.

Reuse canonical Range construction and rectangle normalization. Active Elastic
measures only its exact visible partition, not the transparent original button,
hidden witness tail or blank pocket. Its actual flow already includes the slot;
adding slot depth again would double displacement. A legitimately shorter flow
keeps the existing non-negative growth policy in `interaction/language-flow.ts`,
not an invented failure threshold. The one-canvas-unit CSSOM containment budget
is explicit and tested at 1 versus 1.01, including the published bottom.

Independent review found two more concrete boundaries: an active invalid
multi-target lineage must preempt old ink rather than fade it, and a disposed
observer/font callback must return before clearing a newer owner's receipt.
The fixed lexical disposal guard is source/ownership proof, not a simulation of
native callback scheduling. Real Chromium additionally exercises a pending
repository font load, drag cancellation, and visible ports for both Elastic
grips. Source/pure review and screenshot review remain separate.

The final A/B stills support this selected lineage's real attachments and quiet
orthogonal geometry. B is a test-only open-arrow overlay, not a shipped option.
Fixed-rail occlusion, exact intermediate camera frames and a painted leaf-video
frame are not proven merely by paper bounds or the enabled FX preference. The
smallest remaining visual proof is a real narrow rail-adversarial frame and
endpoint/rail rectangle readback, not a new router or a broader gallery.

## Later owner correction: quiet contact and the typographic dogleg

The latest owner decision supersedes B0's three-mark hover and B0-G's detached
14px experiment above. `6b70e794` is the stable pre-Under two-action reference;
Preview now shows AI and `−` / restore `+`, with rail sample Branch retained.
Original 6px button-box corner contact is intentional. Fixed 44/48px sizing
and behind-material background fog remain explicit current overrides; neither
is falsely described as a whole historical pixel restoration. Existing entry,
close, selection, focus, pending and pointer guards remain owned by the lens.

The new screenshot's little stair is not an animation artifact. A current
1440px review DOM read measured the root at 31.68px font with a 32px first-row
rectangle and its child at 17px with a 17px rectangle. Their centres differed
by 11 CSS pixels even though the layout boxes share the same top. Their actual
row interiors overlap, so independently centred ports manufacture a needless
dogleg. Screenshot-image pixels alone did not establish those CSS dimensions.

T0-C preserves the exact adjacent topology and measured receipt, but resolves
one shared ordinate for the actual top-aligned first child only while it
remains inside both measured rows after pixel snapping. All drawn siblings use
one outgoing parent port, and target beads use the resolved incoming endpoint.
Disjoint/Elastic rows, tiny intersections lost to snapping and unmeasured first
children retain real fallback geometry; nothing reads or invents a hidden
sibling. The pure suite includes these counterexamples and zoom/DPR cases.
The source port belongs to the exact resolved projection, not an extra stored
cross-selection anchor. Point diameters are 4.5 / 6px; the existing downward
three-dot cue is 2.5px and viewport continuation keeps its open chevron.

The native departure probe also exposed a lifecycle counterexample: after a
selected passage's toolbar is entered and left, the 200ms timer hard-closed its
placement while the memoized selected target did not change. A visibility check
before grace expired incorrectly passed. Departure now releases only transient
hover/focus; exact-owner placement checks retain the selection or require the
new target to measure again. Explicit dismissal, actions, modal/chrome and
pending guards keep their existing closing authority. The strengthened preview
journey waits 350ms after material and repeated toolbar departures, checks
another hover returning to the selected passage and timer-cancelling reentry,
then proves Escape and Point and Talk remove both paint planes. The original
failed probe is retained separately from its passing corrected rerun.

Source review, real-page tests and final owner acceptance remain separate.
The current handoff owns the final command receipts and retained check limits.

## T0-D: one screen-metric owner and the 5/7px endpoint candidate

The owner delegated implementation after the marker review. Reuse the existing
measured attachment geometry, not another graph or router. Ordinary points now
have 5px diameter and the addressed target 7px, superseding only T0-C's earlier
4.5/6px candidate sizes. `OPERATION_TRAIL_PX` remains authoritative: the passive
host projects stroke/bead/more-dot values to CSS, while SVG target/cue geometry
uses inverse zoom. No numeric CSS fallback, duplicate chevron half-size, new
export, dependency, measurement or interaction owner was added. The unchanged
8px text-to-centre gap leaves nominal 5.5/4.5px visible air before snapping.

Native DPR 1/2 journeys reach the actual 0.6/1.8 camera clamps and approximately
1 via the existing wheel helper, then frame ports through Pan without changing
zoom. They measure the target circle's real 7px width/height, actual inherited
5px round non-scaling dot stroke, same line/point endpoints, no ordinary dot
under a target and remaining text clearance. Ordinary zero-length `h0` stroke
paths do not have a useful painted-diameter bounding box; computed stroke and
actual raster gallery evidence are not misreported as a nonzero geometric box.
Existing omission/viewport cue geometry and forced-color CSS proof remain;
not every cue is visible in every native scenario. The independent verifier
reran 89 focused tests and inspected the passing two-DPR probe. The handoff
records the later whole-trail/preview and build receipts, not visual approval.
