# Ambient workbench UI reference

Status: frozen local composition reference for the right-side Matter canvas.

Source: a user-provided private visual package. It is referenced here only as an
anonymized ZIP-derived composition study; do not redistribute its assets, name
its origin, or treat its copy as Matter product copy.

## Composition contract

The workbench has two deliberately unequal regions:

```text
fixed material field | inset rounded paper
262 px               | one continuous thought surface
```

The current material field is an unfinished structural index. Its visual form,
spacing, and future controls are deliberately open. The paper is the only
frozen surface in this reference: it owns the leaf atmosphere, thought material,
corner utilities, and the editing rail.

This distinction is behavioral, not merely visual: the left-side index may be
redesigned later, but it must not absorb paper-only lasso guidance, leaf FX,
canvas appearance, or the right-rail editing tools.

## Visual constraints

- The paper remains a smaller, rounded physical surface inside the broader
  workbench field.
- The paper owns the supplied leaf-shadow media. It is decorative, transient,
  and never part of document state or persistence.
- Paper utilities align to a 24 px edge grid. Their hover fill may react to the
  leaf atmosphere, but they never migrate into the material field.
- The right rail exposes only the current editing vocabulary. Its selected
  second-preview geometry is `60px` wide with a `22px` outer radius; desktop
  buttons remain visibly `44px` with `13px` corner radii and `20px` artwork.
  Their non-overlapping pointer boxes may extend horizontally beyond the rail so
  imprecise approach still lands on the intended tool; narrow screens retain
  `48px`-high targets. Focus follows the visible button, not the invisible
  extension.

The editing buttons use a `72 x 44px` desktop pointer box around the unchanged
`44 x 44px` visible control. This exceeds the WCAG 2.2
[2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
floor without enlarging the composition. A keyboard-focused tool receives a
high-contrast `2px` perimeter around the visible control, calibrated against
[2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).
These measurements are component evidence, not a claim of product-wide WCAG
conformance.

## Left field: intentionally pending

The left field is not frozen by this reference. It may be redesigned after a
separate research and freeze slice. That future slice should decide its visual
density, information hierarchy, open/closed behavior, and whether it remains a
file-like index or becomes another structural view of the material.

## Implementation anchors

- Shell geometry and desktop/mobile presentation: `app/globals.css`.
- Structural material index: `features/matter/components/MaterialFiles.tsx`.
- Rounded thought surface and its ownership boundary:
  `features/matter/components/RootedMaterial.tsx`.
- Paper-only utility chrome and preferences:
  `features/matter/components/CanvasChrome.tsx`.

## Explicit non-goals

This reference does not authorize copying branded names, logos, legal text,
company attribution, product copy, or source assets from the private package.
It does not authorize copying the package's branded UI into Matter. It also does
not decide the left-field redesign.
