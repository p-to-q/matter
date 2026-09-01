# Selected material language

Status: research proposal, not a frozen product contract. This document records
the evidence and a proposed visual/engineering boundary for review before any
implementation slice reopens the active plan.

Update 2026-09-02: the shared-address direction remains useful, but later
implementation evidence supersedes every fragment/connector/pocket geometry
sketch here. The current geometry contract is
`selected-material-flow-interval.md`.

## Decision in one sentence

Selection, Elastic, and Point and Talk are not three interfaces. They are
different operations on one addressed piece of material: the address remains
visually continuous, operation feedback grows from it, and the result settles
back into it.

The proposed shared concept is **Material Address Presentation**. Its signature
visual element is a quiet **contact impression** attached to the exact material
being addressed. It is not a global interaction reducer, a generic AI UI kit, or
a new document state.

## What is actually broken

The visible mismatch is not primarily a color-token problem. One semantic
reference currently changes visual identity as it moves through the interaction:

| Moment | Current visible owner | Consequence |
| --- | --- | --- |
| Navigation or double-click selection | passage DOM | a large whole-passage fill and ring |
| Settled Lasso range | fixed `Range`-rect overlay | rounded line fragments at one density |
| Elastic engaged | language-split text projection | the overlay disappears and a second selected-text copy uses another density and topology |
| Control Fog | passage-local lens | a blurred capsule anchored from the first line |
| Point and Talk | viewport-fixed composer | the field is visible, but its whole-node semantic reference has no persistent on-material mark |
| Successful transform | shared transform presentation | the result already settles through a mostly shared presentation layer |

The current UI therefore has three separate visual owners for one product idea:
Lasso, Elastic projection, and Control Fog/Point and Talk. CSS tuning can make a
still frame closer, but cannot prevent a reference from appearing to disappear
and be replaced by another object.

Live inspection adds three useful observations:

- the neutral Lasso fill and its grips read as nearby objects, not one body;
- beginning Elastic opens a pocket while the selected range changes renderer,
  fill density, edge behavior, and layer;
- opening Point and Talk replaces a small fog instrument with an unrelated white
  field while the addressed text itself carries no stable mark.

## Recovered historical context

The current mismatch is understandable because the repository froze several
correct local decisions at different times without freezing their parent visual
grammar.

- `019fc1ab-31f9-7713-b745-6c08780995c4`, *理解项目并对齐方向*, introduced
  pointer as where, stretch as how much, voice as direction, and space as
  relation. Voice-as-Elastic-direction was later superseded.
- `019fcbaa-baf3-7850-9196-057fea43ecd6` froze the neutral black-and-white
  selection/chrome family and explicitly rejected warm beige, brown-grey, and
  old red selection treatments.
- `01a01b47-1732-78e3-82e9-8d62349fc895`, *规划 Matter 产品推进路线*, used
  Point-n-Talk and Zindulka et al. to freeze continuous local reference and
  degree feedback for Elastic. It rejected candidate carousels, prompt chrome,
  two-finger gestures, token-stream theatre, and confirmation popups.
- `01a01f81-9dc1-71d2-9c71-d336e0de33cc`, *梳理 Matter 首发路线图*, corrected
  a temporary single-grip drift. The durable rule is exactly two grips. Both are
  pulled downward; they open different sides of the same selected material by
  holding different anchors.
- `01a022d3-565c-7901-be75-ae6c8aae1c32`, *确认画布文字块控件构型*, froze
  Control Fog as a passage-local optical family, but did not extend that family
  to selected material.
- `01a03340-66eb-78e2-a9a9-681f5407daca`, *设计 hover 加减号交互*, restored
  Point and Talk as a whole-node passage-local entry and later defined a shared
  `ContextAddress` direction. It also rejected one universal AI protocol:
  capabilities may share addresses, geometry, context compilation, and low-level
  presentation primitives while keeping policy, protocol, and lifecycle owners
  separate.

The missing freeze is the sequence between those decisions:

```text
addressed → engaged → acting/listening → pending → result/failure → settled
```

No historical decision established how the same addressed material remains
recognizable across that sequence.

## What the references prove, and what they do not

### Point + Talk

Diana Lu's Point + Talk demonstrates a strong concept sequence:

1. a forgiving, line-following text selection establishes the addressed object;
2. listening feedback follows the selected shape without replacing its identity;
3. suggestions return to the original text position;
4. the selected region remains the place where alternatives are explored.

The useful principle is spatial continuity of the referent. The warm target layer
and cool activity layer are a readable semantic split in that concept, but they
are not Matter's required palette.

The project page also states that the prototype was made in After Effects and
Origami. It provides no production evidence for latency, recognition errors,
undo, reflow, accessibility, or model failure. Matter should not treat its motion
as an implementation recipe.

### Zindulka et al., CHI 2025

The study separates three kinds of feedback that Matter should also keep
distinct:

- address: where the operation applies;
- degree: how much material the gesture is requesting;
- result: what content the model actually produced.

In the controlled study, word bubbles that exposed length and word count were
faster, reduced workload, and prevented observed overshoot compared with lines
or no visualization. The transferable result is the value of continuous,
local feedforward. The literal bubbles, two-finger gesture, sentence inference,
streaming tokens, and confirm widget are not transferable requirements.

The paper also reports wrong-sentence selection for some participants. A
forgiving acquisition gesture must therefore end in an exact, visible interpreted
range before any generative mutation.

### Supporting precedent

Tap&Say supports approximate pointing plus voice disambiguation, and DirectGPT
supports direct manipulation, continuous object representation, and undo. These
reinforce Matter's local-material direction but do not override its explicit
selection, bounded lineage, one-change, and pointer-undo contracts.

## Proposed visual grammar

### 1. Reference mark — the contact impression

The addressed material receives one persistent contact impression. Its geometry
is derived from the same authoritative line-fragment rects throughout the turn.

- It hugs the visible line fragments; it does not become a paragraph bounding
  box or a large rounded card.
- Wrapped lines remain a family of fragments with consistent inset, radius, and
  density. Their shared rhythm makes one range without inventing a blob.
- It survives engagement, drag, listening, pending, and recoverable failure.
- It may translate with the material, but it must not be destroyed and redrawn as
  a visually unrelated object at a lifecycle boundary.
- It disappears only after cancel/recovery or after the result has visibly
  settled into canonical material.

This contact impression is the one intentional aesthetic risk: a selected range
should feel lightly pressed into the paper, not painted by a generic browser
highlighter. It remains flat and restrained; no decorative gradient is needed.

### 2. Instrument — controls grow from the address

The operation's instrument attaches to the address instead of floating near it.

- Elastic keeps exactly the current upper and lower grips and their large hit
  areas. The visible 22px line is a reinforced seam at the first or last selected
  fragment; hover/press can lengthen it without turning the hit target into
  visible chrome.
- Both grips retain the current downward gesture and anchor semantics. The
  contact impression is not replaced when either grip is engaged.
- Point and Talk retains the passage-local AI entry. On activation, its compact
  Control Fog state and direction field use one material anchor. The field may
  unfold from that anchor, but the addressed passage remains marked.
- Point and Talk activation suppresses the folded Control Fog instrument; one
  address must never show two simultaneous instruments.

The grips, Fog, and composer do not need identical silhouettes. They need the
same address, optical density ladder, scale logic, and transition ownership.

### 3. Activity trace — state without changing the address

Operation-specific feedback is a second, transient channel around the persistent
contact impression.

- Elastic expresses degree through real local displacement and pocket depth.
  The mark answers *where*; the pocket answers *how much*.
- Point and Talk listening may add a bounded edge pulse or short acoustic trace.
  It must not deform the true selection geometry or become a permanent waveform.
- Pending keeps the reference quiet but present. A low-energy edge or pocket
  response is preferable to a spinner, toast, panel, or blank gap.
- Failure returns the same surface to an actionable state without losing the
  address or expanding context.

### 4. Outcome settle — one material change

Preview and result return to the addressed location. Any delta treatment belongs
to the result layer, not to the reference layer. Commit remains one atomic,
pointer-undoable tree mutation; cancel removes transient presentation without
material history.

## Selection hierarchy

Not every thing called “selected” has the same product meaning. Visual unity
should preserve that hierarchy rather than flatten it.

| Kind | Meaning | Proposed treatment |
| --- | --- | --- |
| Native copy range | text will be copied | same neutral ink family at the quietest density; no grips or AI instrument |
| Structural node selection | navigation/working context | a restrained structural perimeter or edge cue, not the same filled paragraph capsule as an actionable language address |
| Lasso exact segment | operation-ready language address | full contact impression plus the two Elastic grips when eligible |
| Lasso selection set | references only | the contact family at reference density, no Elastic grips |
| Point and Talk whole node | bounded transformation address | line-fragment contact impression for the whole passage, plus one anchored direction/listening instrument |
| Future exact-segment Point and Talk | bounded transformation address | reuse the exact-range contact geometry; do not silently promote Lasso into a universal tool mode |

This resolves the double-click problem without pretending navigation, copy, and
generative address are semantically identical.

## Matter palette and motion direction

Point + Talk's peach and cyan are not proposed for Matter. Historical work
explicitly rejected warm beige/brown selection. The initial palette remains the
existing neutral material family:

| Role | Existing seed |
| --- | --- |
| Paper | `#f5f5f2` |
| Paper solid | `#ffffff` |
| Ink | `#161d27` |
| Muted ink | `#58616a` |
| Night field | `#202831` |
| Reverse ink | `#f0f2f3` |

State should be carried mainly by density, edge energy, real displacement, and
brief motion—not by assigning every feature a new hue. The final opacity,
fragment outset, radius, and dark-mode density must be frozen as semantic tokens
and used by every renderer; the current hard-coded `.18`, `.10`, and `.08`
variants are evidence of the missing system, not proposed values.

Motion has one rule: the material address does not make an entrance twice. A
settled selection may arrive once; later lifecycle changes modulate or translate
that same object. Reduced motion removes arrival and edge pulse while preserving
range, degree, and pending state through static density and geometry.

## Engineering boundary

The recommended abstraction is a pure render projection, not shared behavior:

```ts
type MaterialAddressPresentation = {
  scope: "range" | "selection-set" | "node";
  nodeId: string;
  phase: "addressed" | "engaged" | "directing" | "pending" | "recovering";
  geometryReceipt: string;
  instrument: "none" | "elastic" | "point-talk";
};
```

This sketch names the boundary, not an implementation contract. A real freeze
should determine whether `geometryReceipt` is an identifier, an epoch, or a pure
derived value.

The boundary must obey these rules:

- existing Lasso, Elastic, Text Swap, voice, and tree lifecycles remain separate;
- current state is projected into one presentation owner with explicit visible
  priority; no universal interaction reducer is introduced;
- the canonical range geometry or its stable receipt is the source for the
  reference mark and instrument anchors;
- DOM measurement remains at the rendering edge and is not repeated in the
  pointer hot path merely to keep two renderers aligned;
- transient reference, grip, voice, pending, and optical state never enters the
  material document, command history, or network protocol;
- stale or missing addresses fail closed and never widen to a whole tree;
- success continues through the existing tree-engine mutation and shared result
  presentation.

## Three possible routes

### Route A — align surfaces only

Unify color density, radius, outset, and anchor tokens while keeping all three
visual owners. This can improve still frames quickly, but the same range still
changes renderer during Elastic and Point and Talk still lacks durable reference
identity. It is an acceptable diagnostic prototype, not a durable system.

### Route B — shared material contact surface (recommended)

Introduce one pure Material Address Presentation and one contact-impression
renderer. Adapt Lasso/Elastic first, then Control Fog/Point and Talk. Lifecycles,
protocols, policy, and mutations stay separate. This solves the observed problem
at its actual boundary without reopening first-release interaction authority.

### Route C — selection-first operation system

Make one selection the parent interaction and branch from it into Elastic, Point
and Talk, and future operations. This may eventually produce the most fluid
system, but it reopens tool ownership, discovery, cancellation, context address,
protocol, and mobile gesture decisions. It should remain a later exploration
until Route B gives evidence that the shared address is stable.

## Recommended implementation slices

This research does not authorize implementation. If Route B is accepted, the
smallest coherent sequence is:

1. **Freeze the address receipt and contact grammar.** Capture fixed fixtures for
   native copy, structural node selection, settled Lasso, both grips, wrapped
   text, whole-node Point and Talk, light/dark, and coarse/fine pointer.
2. **Repair Lasso → Elastic continuity.** Keep one range-fragment mark across
   neutral, dragging, adjusted, pending, recovery, and result settle. The
   language-split projection may still own layout, but must stop owning a second
   selected-material skin.
3. **Repair Control Fog → Point and Talk continuity.** Freeze one anchor, keep a
   whole-node line-fragment reference visible, suppress Fog while the field is
   open, and keep the same reference through voice, pending, and recovery.
4. **Differentiate copy/navigation/actionable selection.** Remove the large
   whole-passage capsule from the actionable visual tier and calibrate the three
   densities as one family.
5. **Freeze future capability admission.** Every material-local tool must declare
   reference geometry, instrument anchor, degree owner, pending behavior, settle
   behavior, cancellation, and mutual exclusion before it receives UI.

Each slice should end in visible proof before the next slice reopens.

## Required proof

The existing tests prove local geometry and lifecycle behavior, but do not prove
visual identity across transitions. Add focused proof for:

- frame-by-frame reference rect and token continuity through
  `addressed → dragging/listening → pending → recovery/result`;
- single-line, wrapped, adjacent segments, root/child, and both Elastic grips;
- desktop and coarse pointer entering the same Point and Talk reference state;
- light, dark, zoom, forced-colors, and reduced-motion behavior;
- maximum acceptable movement between the Control Fog AI anchor and the expanded
  Point and Talk anchor;
- exactly one local instrument while Point and Talk is active;
- canonical text and projection glyph alignment without screenshot-free claims
  that matching text coordinates also imply matching highlight appearance;
- a small fixed-fixture screenshot suite that freezes only reference and
  instrument behavior, not the entire canvas.

## Acceptance boundary

The redesign is coherent when all of the following are true:

- a person can point to the addressed material in every active and pending state;
- beginning Elastic does not produce a second visual selection or a blank,
  ownerless pocket;
- both grips look grown from the same selected body while retaining their current
  hit areas and downward physics;
- opening Point and Talk preserves a visible whole-node reference and one stable
  anchor across input devices;
- copy, structural selection, and actionable selection are distinguishable but
  visibly related;
- future capabilities can reuse the address presentation without joining one
  protocol, lifecycle, global store, or AI endpoint.

## Non-goals

- copying Point + Talk's colors, glow, carousel, auto-slide, or transcription
  layout;
- adopting Zindulka et al.'s bubbles, two-finger gesture, sentence inference,
  token streaming, or confirmation widget;
- turning the lasso into a universal tool chooser in the first release;
- merging Elastic and Text Swap protocols, policies, or reducers;
- adding permanent prompt, transcript, assistant, or status chrome;
- treating an After Effects/Origami concept as production usability evidence.

## Primary sources

- Diana Lu, [Point + Talk](https://diana.lu/point-n-talk)
- Zindulka et al., [Exploring Mobile Touch Interaction with Large Language Models](https://arxiv.org/abs/2502.07629), CHI 2025, [DOI](https://doi.org/10.1145/3706598.3713554)
- Chen et al., [Tap&Say](https://pmc.ncbi.nlm.nih.gov/articles/PMC12723524/), CHI 2025
- Masson et al., [DirectGPT](https://arxiv.org/abs/2310.03691), CHI 2024
- Bolt, [Put-That-There](https://www.media.mit.edu/publications/put-that-there-voice-and-gesture-at-the-graphics-interface/)
