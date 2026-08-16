# Control fog

Useful when working on the passage-local action field: its surface, its size,
or where it sits.

## What it is

**Control fog** is the small blurred plate that carries a passage's local
actions. It appears on hover, keyboard focus, or coarse selection, holds the
two glyphs, and vanishes again. It is not a card, a toolbar, or a panel: it is
a patch of paper going quiet so a control can be read against arbitrary
material.

The name is borrowed. The same affordance in the Codex desktop app is built
from Core Animation layers named `_controlFogContainerLayer`,
`_controlFogBackdropLayer`, and `_controlFogBlurMaskSourceLayer` — a
`CABackdropLayer` with a Gaussian blur, masked to a small shape, with a
separate dynamic-shadow layer. We keep the name because it describes the thing
better than "lens" or "field" does, and because it points at the prior art.

## Why the surface is built this way

Three constraints decide the recipe, and each one has already been got wrong
once.

**`filter` and `backdrop-filter` must not share an element.** A `filter` makes
its element a backdrop root, so the element's own `backdrop-filter` samples
nothing. The shipped field carried both for several previews and rendered as an
invisible smear over dark material — the blur was never reaching the screen.
If the fog ever looks absent, check for a `filter` before changing any value.

**Legibility comes from the tint, not the blur.** A heavily blurred but nearly
transparent plate does not separate a glyph from busy material; a tinted one
does. The tint is greyed rather than pure paper so the plate is distinguishable
from the paper it sits on. Shipped comparisons in this family run 70–95%
surface opacity with 12–40px of blur; ours is a grey-cast 80% over 28px.

**The mask is what makes it fog.** The plate is a blurred backdrop faded out by a radial mask,
so it has no edge of its own and reads as paper going quiet rather than as a card laid on top.
A hard-edged rounded rectangle was tried and rejected: it is a more definite shape, but a
definite shape is a card, and a card is exactly what this must not become.

## The constraint that is ours, not Codex's

Codex fogs a preview of someone else's web page, where blurring the content
costs nothing. We fog a person's own unfinished thought, so how far the field
may reach onto material is a product decision, not a default.

The decision: at the corner placement the fog sets onto the first line and the
glyphs descend with it by `CORNER_GLYPH_DESCENT`, currently 10px. The text
underneath stays exact, selectable, copyable and accessible — the fog is
translucent and nothing is rewritten — so a bounded descent reads as contact
rather than occlusion. Every fallback placement stays clear of material
entirely, and `projectNodeHandlePosition` tests material against the field
minus that authorised descent, so the bound is enforced rather than assumed.

An earlier revision forbade any contact at all. That was a stricter rule than
the product wanted; it is now a number, which is the point — a named bound can
be reviewed and tested, an absolute cannot be relaxed without argument.

## Hover is denser fog, not a tile

The resting field has no straight edge anywhere. A hover state that inverts the
glyph onto a solid rounded square puts one back — and puts it exactly where the
control approaches the first line, so the mark that means "you can press this"
is also the mark that covers the words.

The rule instead: hover is a rounded rectangle that stays crisp, with the
spread carried by concentric shadows of the same ink. A shadow blurs the
silhouette, so the falloff is even the whole way round — corners and edge
midpoints diffuse at the same rate — and a sharp core is what makes it read as
spreading outward instead of merely fading. The outermost ring has reached
nothing before it nears the first line. Every side stays soft, so it merges sideways into the
surrounding fog, and its density has already fallen to nothing by the time it
nears the text — it gives way rather than cutting across. Two earlier attempts were rejected: a bottom-only feather, which
softens one edge and leaves three hard ones without ever clearing the text; a radial wash, soft on every side but a shape that appears nowhere else here;
a blurred rectangle, which loses the shape it was meant to keep; and a
two-axis gradient mask, whose composited alpha is a product, so corners
collapsed quadratically while edge midpoints fell linearly and the spread came
out visibly uneven.

Keyboard focus is the deliberate exception and keeps a complete fill with a hard
ring. Focus must be unambiguous at a glance; it is the one state where a crisp
edge is worth more than the softness.

## Size follows the material

The field is sized from the measured ink height of the passage's first line, so
a leaf gets a smaller control than a root. `projectNodeHandleMetrics` owns that
derivation and clamps it: never larger than the base size, and never below the
pointer target floor — 44px for a coarse pointer, 32px for a fine one. Those
floors are accessibility limits, not visual taste.

The metrics it returns are the one source for the field's box. The placement
rule computes from them, and the render edge publishes the same numbers as
`--lens-button`, `--lens-gap`, `--lens-pad-x`, and `--lens-pad-y` so the CSS
paints exactly the box the geometry reserved. Before this, the geometry assumed
42px of horizontal padding while the CSS drew 40px; two sources of one fact
disagreeing by 2px is precisely the drift this arrangement removes.

## One ratio, three layers

The proportions are not chosen fresh; they are the tool rail's, because the rail
is the control vocabulary this product already has. `.tool-rail__button` is a
72x44 hit box holding a 40px visible chip around a 20px glyph.

| layer | ratio of `--lens-button` | at 44px | rail |
| --- | --- | --- | --- |
| hit target | 1.00 | 44px | 44 tall (72 wide) |
| solid core | 0.91 | 40px | 40px chip |
| glyph | 0.455 | 20px | 20px |

Core over glyph is 2.0, exactly the rail's. All three derive from
`--lens-button`, so the relationship holds at every material size instead of
being three independently chosen numbers.

The rail also encodes the second rule: its hit box is wider than its chip, so
the control is reachable past what it draws. The field already has this where it
counts — a 44px button around a 40px core leaves 2px of invisible margin on
every side, so a pointer that lands just off the mark still activates it.

Extending the slop around the whole field was tried and removed. The field is
mounted beside the canvas, not inside it, so a pointer landing in that margin is
caught by the field, triggers nothing, and never reaches the paper underneath:
the margin becomes a band where a lasso cannot start and material cannot be
selected. Buying a little hover convenience with a dead strip of paper is the
wrong trade; the 200ms close delay already covers travel to the control.

## Press

Pressing compresses the control in place; releasing springs it back past rest
and settles. It must never travel downward. The field sits on the first line, so
a downward nudge reads as the control stepping onto the material it addresses —
the one direction this control is not allowed to move.

## Fallbacks

`@supports not (backdrop-filter)` replaces the sample with an opaque tint.
`forced-colors` drops the blur and shadow for a system surface with a border.
Both keep the glyphs legible without the effect.
