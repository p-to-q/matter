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

1. **One fragment renderer.** `.lasso-selection-fragment` is the only renderer
   for an actionable address. It is extended, never paralleled. A migration
   that leaves two fragment renderers alive at once is rejected.
2. **The address never blanks.** There is no paint in which the address is
   neither visible nor already replaced by its result.
3. **Degree is expressed by position, not by animation.** Real displacement,
   pocket depth, and grip position carry degree. `prefers-reduced-motion`
   therefore needs no special-casing.
4. **Per-line anchors.** Grips derive from the first and last visual line.
   Neither grip may use the whole selection's horizontal centre, at any point
   in the lifecycle including first paint.
5. **No written-but-unconsumed presentation values.** A custom property that
   JS writes and no rule reads is a defect, and is proven against.
6. **Theme-resolved densities live in CSS.** Opacity constants may not live in
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
`.language-pocket` keeps its own constant `.035`. The dead metric and the dead
custom property are deleted rather than connected.

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
| dragging | **stays visible**; upper grip displaces it with the language, lower grip leaves it in place | follow per-line anchors | pocket at `.035` |
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
- **Slice 1+ — foundation owner.** Geometry receipt, operation lease,
  address-to-result handoff, backend closure, then whole-node Point Talk
  reference.

## Proof

Six fixtures: single line, wrapped stepped range, adjacent segments, whole
node, upper-grip displacement, lower-grip displacement.

Boundaries: light and dark, `forced-colors: active`,
`prefers-reduced-motion: reduce`, `pointer: coarse`, and the 389 / 767 / 959
breakpoints.

Three transitions must be reviewed as recordings, not stills: lasso to press to
drag to release; Control Fog to field; pending to result handoff.

Slice 0.5 locks, at minimum: press-at-zero opacity is not zero; the fragment is
still visible during expand and pending; per-line centres are used on first
paint and on the hot path; forced-colors keeps the reference outline; and no
presentation custom property is written without a consumer.

## Non-goals

Merging any protocol or lifecycle; a general AI reducer; a second measurement
path; candidate browsing; a chat surface for Point Talk; warm peach or cyan
accents; changing grip form or the overall neutral feel; restructuring
structural selection in this slice; exact-segment Point Talk.
