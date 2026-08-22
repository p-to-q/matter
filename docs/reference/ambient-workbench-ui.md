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
  `15px` inline / `11px` block inner guard. Upper-right uses `30/24` and `17/13`;
  lower-left uses `32/24` and `18/12`, giving their different copy only a few
  more pixels of air. The outer plane samples at `0.8px`, the inner at `3.25px`.
  Both elliptical alpha masks share a very short zero-foot:
  the perimeter is fully transparent, reaches only `.004` opacity three percent
  inward, and remains near `.012`–`.014` six percent inward. After that common
  quiet beginning the curves deliberately diverge: the `0.8px` outer plane is
  capped below full mask strength and gathers over a long shallow shoulder,
  while the inner plane rises later through a compact S-shaped soft step
  (`.32` → `.72` → `.90`) beneath the labels. The two depths therefore remain
  immediately distinguishable without a border, a third ring, or a hard cutoff
  under zoom.
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
  Their non-overlapping pointer boxes may extend horizontally beyond the rail so
  imprecise approach still lands on the intended tool; narrow screens retain
  `48px`-high targets. Focus follows the visible button, not the invisible
  extension.
- One measured frosted action field prefers the upper-left clear space of a
  hovered or keyboard-focused passage, then tries the other above, below, and
  side positions in a fixed collision-safe order. The field and all available
  actions reveal together. It reuses the existing Branch and Focus capabilities;
  focus view offers only Show all. The field is a single render-edge instance,
  yields to precise gestures and pending work, and disappears when no safe
  adjacent position exists. It never introduces delete, fold, model, or
  coordinate semantics.

The editing buttons use a `72 x 44px` desktop pointer box around the unchanged
`44 x 44px` visible control. This exceeds the WCAG 2.2
[2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
floor without enlarging the composition. A keyboard-focused tool receives a
high-contrast `2px` perimeter around the visible control, calibrated against
[2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).
These measurements are component evidence, not a claim of product-wide WCAG
conformance.

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
