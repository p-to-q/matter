# Ambient workbench UI reference

Status: frozen local composition reference for the right-side Matter canvas.

Source: a user-provided private visual package. It is referenced here only as an
anonymized ZIP-derived composition study; do not redistribute its assets, name
its origin, or treat its copy as Matter product copy.

## Composition contract

The workbench has two deliberately unequal regions:

```text
fixed material field | inset rounded paper
304 px               | one continuous thought surface
```

The material field now has its own separate first-release freeze: a quiet 304 px
manuscript index with local disclosure, flat search, copy selection, archive,
and transient working-context controls. This reference still freezes the paper
only: it owns the leaf atmosphere, thought material, corner utilities, ruling,
local action lens, and the editing rail.

This distinction is behavioral, not merely visual: the left-side index may be
redesigned later, but it must not absorb paper-only lasso guidance, leaf FX,
canvas appearance, or the right-rail editing tools.

## Visual constraints

- The paper remains a smaller, rounded physical surface inside the broader
  workbench field.
- The paper owns the supplied leaf-shadow media. It is decorative, transient,
  and never part of document state or persistence.
- Decorative motion is optional delivery, not structural UI. The poster and
  wash remain when leaf atmosphere is enabled but reduced motion, explicit data
  saving, or a browser-reported `2g`/`slow-2g` connection suppresses video. The
  browser re-evaluates explicit preference and connection changes; missing
  network hints keep the normal path and user-agent guesses are forbidden. A
  failed video load settles on the poster rather than entering a retry loop.
- When leaf atmosphere is off, the paper exposes one quiet structural ruling
  across the complete visible surface. The ruling uses a quiet dashed
  line and repeats on the existing derived horizontal column step: `636 x 196px`
  at desk widths, `344 x 172px` below 720 px, and `292 x 160px` below 390 px.
  Cell origin, span, dash, gap, and open-joint clearance share the material
  camera, so Pan and zoom move one coherent world texture rather than two
  independent phases. The nominal visible rhythm is `6px` dash, about `10px`
  gap, and `3px` clearance on each side of a crossing at `1x`; each cell balances
  complete dashes between the two transparent joints. Each dash is one custom
  filled Bézier silhouette whose flatter shoulders soften into the end without
  reading as an ordinary capsule. Its `1.4px` thickness is the sole screen-space
  reading exception. Light and dark
  canvases settle at `16%` and `13%` opacity after one subtle `300ms` entry
  breath; reduced-motion preference compresses it to an imperceptible frame. The
  ruling never changes online material widths, gaps, or derived boxes and remains
  outside authored position, snapping, hit testing, history, persistence,
  inquiry context, and protocol.
- Paper utilities align to a 24 px edge grid. Their hover fill may react to the
  leaf atmosphere, but they never migrate into the material field.
- Upper-right About/settings, bottom-right utilities, and lower-left guidance
  share one transparent two-depth optical contract. Bottom-right supplies the
  baseline: a broad `28px` inline / `22px` block outer guard and a smaller
  `15px` inline / `11px` block inner guard. Upper-right uses `18/14` and `10/7`;
  lower-left uses `22/18` and `12/9`. The outer plane samples at `0.8px`, the
  inner at `3.25px`.
  Both elliptical alpha masks share a very short zero-foot:
  the perimeter is fully transparent, reaches only `.004` opacity three percent
  inward, and remains near `.012`–`.014` six percent inward. After that common
  quiet beginning the curves deliberately diverge: the `0.8px` outer plane is
  capped below full mask strength and gathers over a long shallow shoulder,
  while the inner plane rises later through a compact S-shaped soft step
  (`.32` → `.72` → `.90`) beneath the labels. The two depths therefore remain
  immediately distinguishable without a border, a third ring, or a hard cutoff
  under zoom.
  The lower-left owner itself never animates opacity: only its text enters, so
  the persistent backdrop planes remain in the paper's sampling context.
  Because both planes have no fill, empty paper exposes no card; the effect
  becomes perceptible only when material or ruling passes behind it.
  The shared masks inherit from the canvas shell; only each group's insets and
  radii differ. The planes ignore pointer input and disappear at the existing
  `767px` mobile handoff. No DOM collision observer, per-glyph
  opacity, material filter, camera state, animation, history, or preference is
  introduced.
- The right rail exposes only the current editing vocabulary. Its selected
  second-preview geometry is `60px` wide with a `22px` outer radius; desktop
  buttons remain visibly `44px` with `13px` corner radii and `20px` artwork.
  Its white surface is opaque and therefore owns no backdrop sample or blur
  layer; the optical buffers remain confined to the three corner groups above.
  Their non-overlapping pointer boxes may extend horizontally beyond the rail so
  imprecise approach still lands on the intended tool; narrow screens retain
  `48px`-high targets. Focus follows the visible button, not the invisible
  extension.
- One measured frosted action field prefers the upper-left clear space of a
  hovered, keyboard-focused, or selected passage, then tries the other above,
  below, and
  side positions in a fixed collision-safe order. A fine pointer's click
  selects the passage it will act on, so the selection keeps the field after
  the pointer leaves, and a press on a passage never closes that passage's
  field; hover or focus elsewhere still takes precedence, and `Escape`
  dismisses the selection's field until that passage is pressed or selected
  again. The field and all available
  actions reveal together. Its left control is the supplied AI placeholder and
  opens the node-local Point-and-Talk direction field; its right control reuses the
  material index's working-context transition: `−` sets the active branch aside
  and `+` restores a held root. A held root keeps the AI mark but disables it,
  because set-aside material cannot become a transformation target. The field is a single
  render-edge instance, yields to precise gestures and pending work, and
  disappears when no safe adjacent position exists. It never introduces delete,
  fold or coordinate semantics; the AI result is one pointer-undoable material
  replacement, never a local chat.

The editing buttons use a `72 x 44px` desktop pointer box around the unchanged
`44 x 44px` visible control. This exceeds the WCAG 2.2
[2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
floor without enlarging the composition. A keyboard-focused tool receives a
high-contrast `2px` perimeter around the visible control, calibrated against
[2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).
These measurements are component evidence, not a claim of product-wide WCAG
conformance.

## Keyboard ownership

A keydown belongs to the IME iff `isComposing || keyCode === 229`
(`components/composition-safe-keys.ts`). Chromium flags the confirming Enter;
WebKit before its April 2026 event-order fix fired `compositionend` first and
then a `229` keydown with the flag already clear; Android keyboards report `229`
for nearly every key. Every caller therefore passes `keyCode`, React call sites
pass `event.nativeEvent`, and Enter or Escape acts only on keydown. An Android
Enter is accepted as IME-owned: every such field also has a visible action, and
a rename still commits on blur.

Document-level Escape has one owner, `components/escape-layers.ts`: a single
bubble-phase `window` listener that runs after every React handler and ignores
`defaultPrevented`, auto-repeat, and IME-owned keys. Registered layers are
ordered by tier, then activation recency, and one keydown closes at most one:

```text
gesture 4    node drag, grip drag
transient 3  settings and language menus
panel 2      Ask Matter, modal dialogs, the overlay material drawer
paper 1      node action lens, Point and Talk, the Wiki takeover,
             a submitted Elastic degree
mode 0       Lasso
```

Everything that covers the paper outranks every paper surface, so no paper
surface asks whether something covers it. A layer that had nothing left to
cancel declines, and the next one tries. The overlay drawer keeps the key while
its archive or the canvas is busy: it stays open and nothing beneath it acts.
Focused fields (rename, canvas title, index search, a slider grip) keep their
own `onKeyDown`, test `isCancelEscape`, and call `preventDefault()`. No keydown
handler runs in the capture phase or stops a keydown's propagation (the canvas's
capture-phase click suppression for a rejected palm is a click, not a key).
After a submit Escape only dismisses
presentation: Elastic loses its visible degree, its range staying addressed with
both grips at zero, and Point and Talk detaches, while the submitted request
continues. Escape on the Point and Talk field is the person's close: its
frozen copy fades and shrinks for 200 ms, never a cut. `escape-ownership.test.ts` holds the boundary
by scanning the source tree.

## Canvas pointer ownership

The canvas has one gesture owner (`runtime/canvas-pointer-arbitration.ts`),
which replaces the per-type `isPrimary` gate: Pointer Events make a palm primary
for its own type, so a palm during a pen stroke used to reach node drag, Pan, or
a pinch. There is no persistent pen mode. While a pen is in contact, and for
`PEN_PALM_GRACE_MS` (400 ms) after its last contact event, a touch pointer-down
is rejected before the contact registry, capture, Lasso, drag, or camera; every
later event of that pointer and its click are ignored, and so is an unowned
touch's cancel. A pen that lands anywhere, a local field included, within
`PEN_TAKEOVER_WINDOW_MS` (300 ms) of a single-finger touch takes the canvas
over: the touch's Lasso stroke restores its prior selection, its Pan returns the
camera to where it began, and its tap never settles. Until a touch founder
commits (it travels `TOUCH_COMMIT_SLOP_PX`, ends as a tap, or outlives the
window) it dismisses nothing a person made: Point and Talk, a committed Elastic
degree, and repair presentations wait, while camera interruption stays
immediate. The grips, Point and Talk's outside dismissal, and the Wiki
takeover's outside dismissal sit outside the canvas owner, so they apply the
same rule through the arbitration module's one press-dismissal policy.
Otherwise the
first pointer owns the gesture and only another touch may join it, so two
fingers still pinch whenever no pen is touching. Pen hover is not activity, and
a mouse alone behaves as before. Pen contact is noted in the window capture
phase, so a control that stops propagation cannot strand it. A pointer-down
that reuses an id still held as owned or rejected settles that earlier contact
first: ids are unique among active pointers, so an end the page never received
cannot leave every later touch joining a pinch that no longer exists. A move
with nothing pressed settles its own pointer the same way, and a hovering pen
settles every pen contact still recorded, because a stylus returns into range
under a fresh id and one screen carries one stylus. A settled pen keeps the
grace of its last real contact event: hover never extends palm rejection, and
a barrel press while hovering is not contact.

## Chrome accessibility

- Hover affordances exist only under `@media (hover: hover)`, so a tap never
  leaves a sticky hover state; focus, press, and selection states stay ungated,
  and a hovering desktop sees the same cascade as before.
- An unavailable rail tool is `aria-disabled`, not `disabled`: it keeps focus
  when a pending operation flips it and describes why it cannot act (pending
  work, no selection, or no history).
- Under forced colors every focus and selection that was a background plate or
  box-shadow also draws a system-color outline or bar.
- An open modal dialog makes the rail, index, drawer handle, and brand header
  inert, including a handle mounted after the dialog opened.
- Live regions are mounted before they speak; a silent region leaves the flow
  but stays in the accessibility tree.
- Chrome, guidance, Wiki, Point and Talk, and paper-region copy tables are
  typed per locale (`Record<CanvasLanguage, …>` or `satisfies` the full key
  set); none spreads another language, so a missing key fails the type check
  instead of falling back to English or Simplified Chinese.

## Left field: separately frozen

The left field is not governed by this composition reference. Its current
first-release contract lives in `docs/surfaces.md` and
`docs/reference/working-context.md`; changes to its density, hierarchy, or
controls require their own research and freeze rather than borrowing paper-only
rules from this document.

## Implementation anchors

- Shell geometry and desktop/mobile presentation: `app/globals.css`.
- Structural material index: `features/matter/components/MaterialFiles.tsx`.
- Rounded thought surface and its ownership boundary:
  `features/matter/components/RootedMaterial.tsx`.
- FX-off paper ruling: `features/matter/components/CanvasRuling.tsx`.
- Shared render-edge node actions:
  `features/matter/components/NodeActionLens.tsx`.
- Paper-only utility chrome and preferences:
  `features/matter/components/CanvasChrome.tsx`.

## Explicit non-goals

This reference does not authorize copying branded names, logos, legal text,
company attribution, product copy, or source assets from the private package.
It does not authorize copying the package's branded UI into Matter. It also does
not reopen the separately frozen left-field design.
