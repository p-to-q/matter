# Selected material freeze

Module: `features/matter/components/`, `app/globals.css`

Joint freeze between the foundation owner (address identity, geometry receipt,
operation lease, backend closure) and the UI owner (contact impression, grips,
density, optical continuity). Signed before implementation. This file records
what both sides agreed, what each side may not decide alone, and what the first
slice deliberately does not touch.

## Outcome

One material address stays identifiable from the moment it is taken to the
moment its result settles. Today the same address changes visual owner three
times: a Lasso fragment overlay paints it, Elastic hides that overlay and
repaints the language through a split projection, and Point Talk drops the
material mark entirely. The address never disappears again.

## What was already specified

[`text-material.md`](text-material.md) already froze the Degree preview
contract. Three of its rules are currently violated in `main`:

- "At degree zero, the highlight and two grips remain on the source."
- "Fragment tint preserves the stepped shape at rest."
- "the two handles never use the complete selection's horizontal center."

So Lasso to Elastic continuity is a **restoration of an existing contract**, not
a new presentation layer. This distinction sets the slice order.

## Classification

| class | meaning | needs a decision? |
| --- | --- | --- |
| A | violates the frozen Degree preview contract | no |
| B | neutral-palette calibration | no |
| C | genuinely new architecture | agreed below |
| D | product decision | blocked, see Point Talk |

**A.** Degree-zero grip press hides the reference; expand hides it entirely;
first paint uses the whole-column centre; no appearance proof exists;
forced-colors loses the reference during expand; the spec text still says
"pink fragments" from a rejected palette.

**B.** No `::selection` rule exists anywhere, so native double-click selection
falls back to the browser's default blue inside a strictly neutral canvas.

**C.** Shared geometry receipt; operation-slot lease; address-to-result handoff
identity; a displacement input on the existing fragment renderer.

**C3 carries one spatial constraint.** The handoff identity is not only logical.
The rectangle the pocket occupies while a turn is pending is the rectangle the
result occupies when it settles. The pocket is the vessel the result arrives
in, not an empty lane beside where the result will appear. Today there is no
coupling at all: the pocket now shares the address surface's colour and
density, but the settle still runs as a separate `transform-text` animation
with its own cue, so pending and result remain two different objects in two
different places. That is the remaining
structural discontinuity after Slice 0.5, and it belongs to the handoff design
rather than to a later visual pass.

**D.** Exact-segment Point Talk.

## Boundary

### Owned by the foundation owner

Semantic address identity and exact validation; geometry receipt and its
invalidation; operation lease and synchronous revocation; lifecycle adapters;
address-to-result handoff; harness/context assembly; protocol; tree engine;
history and pointer undo.

### Owned by the UI owner

Contact impression outset, radius, joins, and density; the seam between
impression and grips; phase-specific edge energy and bounded motion; native /
structural / actionable calibration; perceptual review across themes, pointer
types, and motion preferences.

### Neither side decides alone

Whether a visual idea requires new geometry or lifecycle state; the state
matrix and visible-owner priority; continuity tolerance at owner handoffs;
whether pending and failure retain enough reference identity; accessibility
fallbacks that materially alter visual form; removal of any existing renderer,
measurement path, or proof.

### Stays separate

The Lasso address reducer, the Stretch degree reducer, and the Text Swap turn
lifecycle keep independent state machines. `text-swap/2` is unchanged. No
reducer merge, and no general AI reducer.

## Invariants

1. **One address surface.** Selected fragments, their connectors, and the
   expanded pocket are parts of a single material address surface. The parent
   holds the only opacity; children paint at full alpha and may overlap freely
   without compounding density. No part of an actionable address is painted by
   a second renderer or carries its own transparency.
2. **The pocket and the fragments share one effective colour and density.**
   This is the user's explicit decision: the expansion must read as one block
   with the selection above it. A large area at the same alpha carries more
   optical weight than thin bands behind glyphs, and that cost is accepted. It
   may not be "optimised" back to a quieter pocket, because a separate density
   is exactly what produced the visible colour difference between the two
   halves.
3. **The address never blanks.** There is no paint in which the address is
   neither visible nor already replaced by its result.
4. **Degree is expressed by position, not by animation.** Real displacement,
   pocket depth, and grip position carry degree. `prefers-reduced-motion`
   therefore needs no special-casing.
5. **Per-line anchors.** Grips derive from the first and last visual line.
   Neither grip may use the whole selection's horizontal centre, at any point
   in the lifecycle including first paint.
6. **Seams are zero-gap.** Wherever two parts of the surface meet, they meet
   exactly. A measured gap between the pocket and the first fragment, or
   between a connector and the rows it bridges, is a defect.
7. **No written-but-unconsumed presentation values.** A custom property that
   JS writes and no rule reads is a defect, and is proven against.
8. **Theme-resolved densities live in CSS.** Opacity constants may not live in
   TypeScript, because a single numeric ramp cannot be correct for both themes.

## Two scope tightenings

Both requested by the foundation owner and accepted.

**A — no density ramp in this slice.** The `held` density stays at the current
`.18` light / `.10` dark. Degree is already expressed by real displacement,
pocket depth, and grip position; adding an opacity ramp on top is redundant and
changes the overall feel the user asked to preserve. The same `held` fragment
keeps its current theme density through neutral, press-at-zero, dragging,
adjusted, and pending. A minimal ramp may be proposed later only with A/B
screenshots, as its own change.

This also resolves the `--elastic-opacity` question: it is **not** wired up.
The formula `0.08 + amount * (0.18 - 0.08)` is anchored at both ends to
fragment densities, is theme-blind, and belongs to a renderer that was hidden.
The dead metric and the dead custom property are deleted rather than
connected. The pocket has no separate density constant either; it takes the
address surface's, per invariant 2.

**B — structural selection untouched.** The filled paragraph capsule on
`.spatial-thought__label` carries navigation semantics and is not part of this
atomic restoration. Native selection is unified to neutral ink; structural
selection waits for its own visual decision with fixed fixtures.

## Point Talk

[`product.md`](../product.md) line 97 freezes that "the two operations never
compete around one visible selection". Read precisely, that constrains
**instrument competition**, not reference visibility.

- **Whole-node Point Talk** is entered from Control Fog, not from a Lasso
  selection, so Lasso still exposes only Elastic and no two instruments contend
  for one address. Giving it a visible reference therefore needs only a
  clarifying amendment, not a freeze change. Implemented after the foundation
  slice, at a density below `held`, with no grips.
- **Exact-segment Point Talk** would create a Lasso-shaped exact range reachable
  by both Elastic and Point Talk. That does conflict. It is formally blocked:
  not implemented, and no CSS branch is reserved for it. Unblocking requires an
  amendment that states the arbitration rule, not merely permission — an exact
  range has exactly one eligible instrument, chosen by entry gesture, and the
  other is not merely hidden but unmountable through the operation lease.

No chat surface, no candidate carousel, and no warm palette enter through
either path.

## Reference reading

Point + Talk is a concept film, so it is read for mechanism, not for style.

**Transferable — the opened slot is the vessel.** A press opens a rounded slot
under the addressed lines, the following language is pushed down and stays
legible, and the generated result arrives inside that same slot, continuous
with the impression above it. Selection, pending, and result are one growing
object. This is the source of C3's spatial constraint.

**Transferable — the impression is per line and ends ragged.** The mark hugs
each visual line and the final line stops where the selected text stops. Matter
already does this correctly.

**Not transferable — the ink-colour channel.** The reference shifts selected
text from black to warm red, giving it a second channel beside the background
tint. In a neutral system the only available shift is toward `--muted`, which
already means excluded or de-emphasised here. The same gesture would read as
the opposite state, so this stays a one-channel system.

**Not transferable — the absence of instruments.** No handle, field, or chrome
appears in any frame, because the film is projected onto paper and a real
finger is the instrument: it carries position, pressure, lift, and withdrawal
by itself. A pointer has none of those, so Matter needs visible grips. Much of
the naturalness being admired is a property of the medium, not a design result.
What is actually available to us is continuity — one piece of material that
never changes owner, never blanks, and never becomes a different object.

The reference is also not a correctness standard: one frame shows its own
address almost entirely gone with an empty slot open.

## State matrix

Grip form (22x2 visible, 52x40 hit, 30px on hover and press) and the existing
neutral palette are unchanged.

| state | reference | grips | other |
| --- | --- | --- | --- |
| native selection | neutral ink, quietest | none | none |
| structural selection | unchanged this slice | none | none |
| lasso eligible | per-line impression at `held` | shown, from first/last line | none |
| lasso ineligible | same impression at `held` | hidden | none |
| grip press, degree zero | **stays visible, density unchanged** | press form | pocket depth 0 |
| dragging | **stays visible**; upper grip displaces it with the language, lower grip leaves it in place | follow per-line anchors | vessel at the surface's own density; the body appears at full column width, and low-amount continuity comes from it entering at zero height rather than from interpolating width |
| pending | same impression, same density, same place | present, non-interactive | no spinner, toast, or panel |
| result | atomic handoff to the settle receipt | removed | existing settle |
| failure | impression and degree return to a usable phase | interactive again | no error chrome |
| Point Talk armed | per-line impression, below `held` | none | field from the shared upper anchor |
| Point Talk listening | unchanged impression | none | restrained edge activity only |

## Slice order

`cloud/address-restore` merges into `codex/selected-material-unity` **before**
the foundation slice, so that the appearance proofs it adds become the
regression net for the receipt and lease refactor.

- **Slice 0.5 — UI owner.** Class A and the `::selection` half of class B, plus
  appearance and geometry proofs. No architecture.
- **Slice 1 — foundation owner.** Geometry receipt, operation lease,
  address-to-result handoff, backend closure.
- **Slice 1 UI — UI owner, on top of the accepted render model.** Three pieces,
  in this order:
  1. **Pending pocket to result settle.** Make the vessel visible: the pending
     rectangle and the settled rectangle are the same rectangle, with no paint
     in which the address and the result are both absent. Depends on C3.
  2. **Whole-node Point Talk reference.** A per-line impression at a density
     below `held`, no grips, unchanged through eligible, listening, pending,
     retryable failure, and recovery. Needs only the clarifying amendment to
     `product.md` line 97, not a freeze change.
  3. **Field anchor and active Lens.** The Control Fog mark and the opened
     field share one anchor with a bounded continuity tolerance, and an active
     Point Talk lease suppresses the Lens rather than letting hover or focus
     mount it again over an open field.

  Exact-segment Point Talk stays blocked throughout, with no CSS branch
  reserved for it.

Slice 0.5 is closed. The decisions below were only visible once the impression
was painting again, so they belong to Slice 1 UI rather than to an amendment of
the slice that revealed them.

## Settled visual decisions

The five questions raised after Slice 0.5 are answered. They are recorded as
decisions, not preferences, and are not reopened without both owners.

1. **Topology.** Fragments, connectors, and the expanded pocket compose one
   surface under a single parent opacity, per invariants 1 and 2.

2. **Cross-line joining.** Adjacent rows are bridged along their real line-box
   overlap with a short rectangular bridge, extended outward by at most one
   dynamic corner radius per side. The rare non-overlapping case takes an
   orthogonal step bounded by the real line gap. A sheared trapezoid across a
   large horizontal run is forbidden: it produced a near-horizontal edge with
   two acute corners, measured at one point as a 155px horizontal travel inside
   an 11.4px height. Overlapping a connector into its rows costs nothing now
   that children paint at full alpha inside one group, so height may grow to
   keep the joint honest.

3. **Grip seam.** The halo stays, retinted to the theme-resolved surface
   composite: ink at 18% over field in light, ink at 10% over field in dark. It
   is kept rather than removed because both visible bars sit exactly on the
   surface's outer boundary, so half of each is over bare material and would
   lose contrast without it. Grip shape, size, colour, and the existing
   physical rules are unchanged.

4. **Proportional geometry.** Radius, outset, and the shoulder derive from
   measured line metrics with safe bounds, so the mark stays proportional to
   the material it marks across the zoom range instead of reading tight and
   square when magnified. `shoulderDepth` is the median real line gap, clamped
   to `[2 x dynamicRadius, medianLineHeight]`, and **must not grow with
   `pocketDepth`**. A transition whose depth scales with the vessel keeps the
   same slope at every amount, so the whole vessel stays transition and never
   becomes a block: that failure was measured once at a constant 73.8 degrees
   with 100% of the depth in transition.

5. **Vessel composition and seam.** The vessel is two full-alpha sub-surfaces
   inside the address surface's single opacity group: a **neck** spanning
   exactly the anchor line, and a **body** at the owning text column's width.
   They overlap by `seamOverlap`, so they neither compound density nor leave a
   gap. While `depth <= shoulderDepth` only the neck grows; beyond it the
   neck's depth is fixed and the body enters at zero height and grows, so the
   widening is continuous without becoming instant. The upper grip places the
   body above and the neck below, meeting the first line; the lower grip
   mirrors it against the last line. **A sheared trapezoid spanning the full
   depth is forbidden**, in the same terms already frozen for connectors: a
   large horizontal run may not be absorbed by a slope. Every seam is
   zero-gap, per invariant 6.

### Known non-blocking

Under `forced-colors`, connectors paint a solid `Highlight` fill while
fragments paint `transparent` with a `1px solid Highlight` border, so high
contrast renders outlined rows joined by solid bars. It stays legible because
connectors sit in the line gap and never cover glyphs. Logged, not expanded
into Slice 1.

## Proof

Seven fixtures: single line, wrapped stepped range, adjacent segments, whole
node, upper-grip displacement, lower-grip displacement, and the high-zoom dark
fixture that revealed the decisions above. The last one is in place and
passing; it exists because all five were invisible at default zoom in light
appearance, which is how they survived Slice 0.5.

Boundaries: light and dark, `forced-colors: active`,
`prefers-reduced-motion: reduce`, `pointer: coarse`, and the 389 / 767 / 959
breakpoints.

Three transitions must be reviewed as recordings, not stills: lasso to press to
drag to release; Control Fog to field; pending to result handoff.

The vessel is proven at the extreme fixture, where the anchor line is far
narrower than the column. Neck width and offset match the anchor line exactly;
the body reaches both column edges; every seam is within `0.01px`; and the
body's share of the depth rises monotonically with amount toward the whole
vessel. The acceptance contract is the shoulder itself: **it never exceeds one
measured visual line and never grows with `pocketDepth`**. It is deliberately
not a fixed percentage, because the achievable share depends on the fixture's
line gap; the same contract is what the high-zoom end-to-end proof passes
across magnifications. Measured against a `36.7px` anchor line in a `548.5px`
column, the body's share ran 0% / 40.6% / 76.2% / 88.1% at amounts
0.1 / 0.2 / 0.5 / 1, with a neck depth constant at `18.53px` once the body
existed, and the upper grip mirrored it to the same figures.

Slice 0.5 locks, at minimum: press-at-zero opacity is not zero; the fragment is
still visible during expand and pending; per-line centres are used on first
paint and on the hot path; forced-colors keeps the reference outline; and no
presentation custom property is written without a consumer.

At the time these decisions were frozen the browser regression suite ran
123 passed / 15 skipped, with one pre-existing `material-files` zoom
floating-point difference of `3.39e-5` that is unrelated to this work, and the
unit suite and typecheck were clean.

## Non-goals

Merging any protocol or lifecycle; a general AI reducer; a second measurement
path; candidate browsing; a chat surface for Point Talk; warm peach or cyan
accents; changing grip form or the overall neutral feel; restructuring
structural selection in this slice; exact-segment Point Talk.
