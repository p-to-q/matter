# Text as Material

Module: `features/matter/material/`

## Problem

Text has to behave like something a hand can land on:

- segment a passage at punctuation boundaries, correctly in Chinese and English;
- hit-test a freehand lasso against text that has already wrapped across lines;
- turn that hit into a character range that is safe to replace;
- commit only after touch ends, preserve the outer grammar seam, and make the
  resulting reflow explicit and stable;
- survive resize honestly rather than by pretending stale geometry is valid.

## Prior art

**`Intl.Segmenter`.** Platform-native segmentation with real CJK support, at
grapheme, word, and sentence granularity. Gets right: grapheme-safe offsets, so
a range never splits a character. Does not solve our unit — `sentence`
granularity will not break at a comma, and comma-to-comma is exactly the span we
address.

**DOM `Range` + `getClientRects()`.** The standard way to get per-line rectangles
for a span of text across line breaks. This is the geometry primitive; there is
no better one, and reimplementing it means reimplementing line breaking.

**CSS Custom Highlight API.** Paints ranges without inserting elements into the
DOM. Gets right: the thing that makes selection painting cheap and, more
importantly, non-destructive — highlighting does not change the text's own
layout. This is the correct tool for the selection fill.

**[Excalidraw](https://github.com/excalidraw/excalidraw/blob/786ab266ff3a9cfffaed16804cf9132b44bc08ae/packages/excalidraw/lasso/index.ts)
and [tldraw](https://github.com/tldraw/tldraw/blob/0527a7d5172819d8a1fbf2767295e6752918d2ec/apps/examples/src/examples/editor-api/lasso-select-tool/LassoOverlayUtil.ts)
lasso paths.** Useful source for explicit polygon closure, bounded pointer input
and a separate smoothed display projection.
Matter keeps their important separation: smoothing never changes the polygon
used to address text. Their shape-selection policies do not define Matter's
punctuation address or ambiguity rules.

**ProseMirror / TipTap.** Text as a validated model rather than as DOM state.
Relevant as a warning more than a template: they are the right answer when a
person types and edits arbitrarily, and they carry a large amount of machinery
for that. Matter's person does not type into the text at all — every change
arrives as a bounded range replacement — so adopting an editor framework would
buy an editing model we have deliberately removed.

## Chosen

**Rendering.** A node is normally plain text in a block element. A committed
late transcript repair keeps that exact canonical text while one transient,
bounded presentation may split it into coalesced stable runs and at most 64
changed grapheme timing units. Stable language is never animated. Changed units
appear after a short recognition beat without changing their reserved geometry;
then the plain-text DOM shape returns. `textContent` is canonical throughout,
and there is no old/new overlay, `aria-live` announcement, caret, token stream,
or layout-changing motion. Reduced-motion and forced-colors presentations skip
the sequence.

**Segmentation.** `Intl.Segmenter("en", { granularity: "grapheme" })` first
produces the only legal UTF-16 boundaries. A forward scan over those graphemes
then recognizes the punctuation in [`../material.md`](../material.md). Runs such
as `？！`, `?!`, `……`, `——`, `...`, and CRLF are one seam rather than empty
segments. No normalization is performed because NFC/NFD conversion would change
the address of a person's material.

Each derived segment carries `{ start, end, seamEnd }`. The replaceable content
is `[start, end)` and its trailing punctuation/whitespace seam is
`[end, seamEnd)`. Adjacent current segments inside one node may merge into one
contiguous range: their internal seams remain in the selected text and only the
last segment's outer seam stays protected. A gap or another node starts another
range and therefore material selection mode rather than an Elastic target.

The exact seam lexicon is contract in [`../material.md`](../material.md), not
configurable punctuation. The shared `validateSelection` recomputes the current
segments and accepts exactly one contiguous run. The dormant Text Swap contract
adds its own exact-one-segment check. The envelope carries no segment ordinal;
server and client derive the range from the final lineage text.

**Geometry.** Prefer one plain Text node per passage. The interaction edge still
indexes descendant Text nodes and asserts their concatenated content equals the
node's material before mapping a logical offset to a DOM `Range`. It converts
`getClientRects()` to finite, non-zero client-viewport rectangles. Pure material
code uses a polygon bounding-box broad phase, then accepts a punctuation segment
when a rect fragment's center is inside the lasso or within a small client-pixel
edge margin. It does not select on any edge touch or require full containment.
A generous loop around one node resolves to its contiguous range, including a
multi-clause title. Disconnected runs or hits in more than one node settle as a
transient material selection set with no Elastic controls.

**Painting.** Selection fill via the Custom Highlight API where available, with
an absolutely-positioned overlay as the fallback. Lasso ink is a separate SVG
overlay that never participates in layout. Its visible stroke is a midpoint
quadratic projection of the bounded semantic polyline. A quiet closing seam
appears only when the current closed path resolves to a trustworthy contiguous
range or material selection set in the stroke's measurement snapshot. Empty,
incomplete, failed, self-crossing, and unmeasured results keep it hidden. The seam
is recomputed as the path changes, shows the exact final edge,
and pointer-up resolves through the same pure target rule.
The ink has no fill or shadow, and disappears when the semantic result takes
over. A cancelled stroke never becomes a selection.

For the first browser slice the fallback overlay is the shipped path. It keeps
the implementation and forced-fallback proof honest while Custom Highlight is
added only when both paths share the same invalidation receipt. Pointer-down
freezes one epoch-bound snapshot of viewport-visible text geometry. Pointer move
writes only SVG path attributes and resolves the current polygon against that
plain immutable snapshot; React, tree layout, text enumeration and Range
measurement do not run per frame. Pointer-up uses the same resolver and snapshot,
so visible success and committed selection cannot disagree. This is the same
broad-phase and cached-geometry principle used by mature canvas editors without
importing their coordinate or shape model.

**Lifecycle.** Semantic address and measured geometry are different transient
values:

```ts
type LassoAddress = {
  kind: "contiguous-segment-range";
  range: SegmentSelection;
};

type LassoSelectionSet = readonly SegmentSelection[];

type MeasuredSelection = {
  address: LassoAddress;
  rects: Rect[];
  layoutEpoch: number;
};
```

Selected-node text change, unmount, navigation, or a newer interaction cancels
both values and its pending turn. A successful one-range lasso never navigates:
it keeps the current Full or Focus projection, validates the current node and
contiguous range, and remeasures there before controls appear. Two or more
ranges remain a separate selection set for index projection and explicit
inquiry context; they never create grips or a transform request. Clicking
ordinary material, blank paper, or the active Lasso tool clears either form.
Width, font, visual viewport, canvas transform,
or any tree/layout commit retains an address only if it still validates, advances
the epoch, and remeasures before handles or stretch can operate. Scroll retains
the address; handles and fallback rects remeasure on animation frame. Custom
Highlight follows layout itself. An old async turn cleans up only resources
tagged with its own interaction id.

A repair presentation validates the same tree id and document epoch plus the
committed node text and timestamp at read time. An unrelated later revision may
leave its brief settle intact; a same-node edit, removal, Undo, Redo, hydrate,
import, or document switch clears or invalidates it. The hint is bounded per
node and never becomes measured geometry, a text address, material, history,
persistence, archive, or model context.

Before DOM measurement, envelope construction, server planning, and synchronous
plan-to-command translation, the shared selection validation runs. The tree
engine receives a whole-node expected-text mutation and enforces that memento
rather than pretending it still has the public range. This repetition is
necessary: browsers can return a whole glyph rectangle for a Range that contains
only half of a surrogate or joined emoji, so plausible geometry does not prove
a safe text boundary.

## Rejected

**Per-character or per-token `<span>` wrapping.** The obvious way to make text
hit-testable, and how the `0.1` prototype does it. Rejected for `0.2`: it
multiplies DOM nodes by text length, and — the real reason — wrapping every
character in an element interferes with text shaping and CJK line breaking, so
the text stops looking like text. Ranges give the same geometry with none of
that.

**Canvas-painted glyphs.** Rejected, carrying forward the decision recorded in
[`../changes.md`](../changes.md): painting text loses selection, accessibility,
IME, and platform text rendering, and Matter's entire claim is that this
material is real.

**An editor framework (ProseMirror, TipTap, Lexical, Slate).** Rejected because
Matter has no typing surface. Every change is a validated range replacement from
a bounded plan. Adopting an editor would import a full editing model, a schema
system, and an input pipeline in order to use its geometry helpers.

**`Intl.Segmenter` at `sentence` granularity as the segment unit.** Rejected
because it will not break at a comma, and the address space is explicitly
comma-to-comma.

**Persisting screen geometry.** Rejected. Stale rects that look valid are worse
than no rects. Clearing on resize is the honest failure.

**Promising no reflow after replacement.** Rejected. Text whose length changes
may wrap differently. Matter commits only after the pointer gesture is over,
clears old Range/highlight state before changing text, then keeps the affected
node's top in the same layout coordinate stable while descendants flow downward.

Lasso thresholds are exported code constants in client CSS pixels, including
minimum path length, two-dimensional extent, sample distance, maximum points,
closure intent, and edge margin. A literal close is within `14px` of the start.
An early release instead compares the endpoint direction with the direction at
`12px` of starting arc: the unsigned angle must be at least `60deg`, while the
closing gap is at most `50%` of drawn path length and `78%` of bounds diagonal.
This admits three sides of a rectangle but rejects two sides, a half-circle, and
a scale-enlarged loop whose endpoint remains far away. Bounding-box broad phase
expands by its single shared margin.
Sampling is stable: accepting later points cannot move already-painted history.
The completed polygon owns an explicit closing edge. Tiny and degenerate input
is uncommitted, a qualified empty loop is an intentional deselection, and
self-crossing or structurally ambiguous hits restore the prior address rather
than guessing. A normal pointer-up never waits for a guessed continuation: it
closes the already-visible seam. Pointer cancellation, capture loss, hidden or
blurred page state, and layout invalidation cancel instead. Unit tests assert
values immediately inside and outside each threshold rather than relying on
words such as "small" or "near."

## Degree preview

Once an address is stable, two physical handles expose one shared normalized
expansion degree in `[0, 1]`. The upper handle belongs to the first visual line
of the measured selection and expands when pulled upward; the lower belongs to
the last visual line and expands when pulled downward. Reversing either handle
reduces the same degree toward zero. Neither handle creates another AI direction
or text address. Client-pixel travel is independent of canvas zoom. Pointer
movement writes only selection-local CSS geometry; it does not measure a Range,
render React, mutate text, or enter history. Cancellation, capture loss, layout
invalidation, and a newer selection restore the previous settled degree.

Wrapped Range rectangles are grouped into visual lines by vertical overlap.
Fragments on one line are unioned only for that line; the two handles never use
the complete selection's horizontal center. This keeps a stepped selection's
upper and lower grips attached to the actual first and last pink fragments.

At degree zero, the highlight and two grips remain on the source and no empty
interstitial lane opens. Moving either grip transfers ownership to Elastic and
opens the bounded local pocket; resetting to zero closes it. This keeps the
choice state materially quiet while preserving a full pointer hit area.

[Point + Talk](https://diana.lu/point-n-talk) demonstrates a useful presentation
quality: alternatives remain clipped to the selected phrase while surrounding
language stays perceptually fixed. Its swipe chooses among discrete generated
options, however, whereas Matter's stretch expresses continuous degree before
generation. Candidate browsing is therefore not part of this interaction.

The visible surface is projected from the exact Range fragments, the owning
text column, and a pure `before / selected+outer-seam / after` text projection.
Fragment tint preserves the stepped shape at rest. During a lower-grip
expansion the upper language keeps the complete source paragraph's inline
layout: a hidden suffix ghost retains every prior line break while a centered
`after` copy moves to the slot floor. During an upper-grip expansion the fixed
seam and prefix remain stationary while the selected language and suffix move
down. The two grips own one shared degree and one operation; their mirrored
pointer directions do not create a second transform. Their difference is which
language boundary stays fixed. The connected source text remains the DOM, accessibility, Range, width,
spacing, and wrapping owner. Projection copies never become selectable material,
context, history, or a second document model. Browser proofs compare source
text and Range rectangles while separately proving visual displacement.

## Required proofs

- mixed Chinese/Latin text; punctuation runs; CRLF; no punctuation; only seams;
- combining marks, surrogate pairs, flags, skin tones, variation selectors, ZWJ
  emoji, and Indic conjuncts;
- adjacent-segment merge, disconnected-run and cross-node selection-set
  projection, and proof that only one contiguous range reaches Elastic;
- clockwise, counter-clockwise, concave, tiny, and near-edge lassos;
- wrapped DOM Range geometry in Chromium; invalidation on width, text, font, and
  visual viewport changes; Custom Highlight and forced fallback paths.

Geometry assertions use relative/topological relationships, not pixel snapshots.
The platform contracts are [ECMA-402 `Intl.Segmenter`](https://tc39.es/ecma402/#segmenter-objects),
[Unicode grapheme boundaries](https://www.unicode.org/reports/tr29/),
[DOM Range](https://dom.spec.whatwg.org/#concept-range-bp),
[CSSOM range rectangles](https://drafts.csswg.org/cssom-view/#dom-range-getclientrects),
and the [CSS Custom Highlight API](https://drafts.csswg.org/css-highlight-api-1/).
