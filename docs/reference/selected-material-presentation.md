# Selected material presentation architecture

Status: architecture proposal for joint review. It is not an implementation
freeze and does not reopen the active release plan. The proposal is based on
the current `main` tree at `3e3cc8f` and the selected-material research round.

Update 2026-09-02: the address/receipt/lifecycle boundaries remain useful, but
the raw-fragment render sketches are superseded by the post-reflow combined
interval in `selected-material-flow-interval.md`.

## Product intent

Matter's subject is unfinished language made touchable. The person working with
it must always be able to answer two questions without consulting chrome:

1. which material is being addressed;
2. what is currently happening to that material.

The first answer must remain stable while the second changes. Lasso, Elastic,
and Point and Talk therefore share one **material reference identity**, not one
feature lifecycle or one generic AI controller.

The proposed signature is still a quiet contact impression attached to the
actual text fragments. It must feel specific to material on paper rather than a
browser highlight, selection card, or AI status surface. The palette remains
Matter's existing neutral paper and ink family:

| role | seed |
| --- | --- |
| paper | `#f5f5f2` |
| solid paper | `#ffffff` |
| ink | `#161d27` |
| muted ink | `#58616a` |
| night field | `#202831` |
| reverse ink | `#f0f2f3` |

No new warm beige, terracotta, cyan activity color, gradient, or candidate-card
language is implied. State is expressed through density, edge energy, physical
displacement, and bounded motion.

## Current architectural cause

The same conceptual reference currently has several independent owners:

```text
Lasso semantic address
  useLasso → Range rect React state → LassoOverlay fragment spans

Elastic degree
  useStretch → hot DOM/CSS preview → LanguageSplitProjection duplicate text
                                      └─ second selected-material background

Point and Talk address
  pointTalkNodeId → PointTalkTurn whole-node SegmentSelection
                  → PointTalkComposer independently measures full content union
                  └─ no persistent mark on the addressed material

Control Fog entry
  NodeActionLens independently measures first-line ink
  └─ different coordinate owner, scale rule, carrier and lifecycle
```

This produces four structural failures:

- settled Lasso and engaged Elastic do not render the same reference object;
- the two Elastic grips are geometrically related to the selection but visually
  rendered as neighbouring controls;
- Point and Talk owns a strict semantic reference that has no on-material visual
  owner;
- Control Fog and the expanded Point and Talk field recompute related geometry
  through different measurement and placement paths.

`RootedMaterial.tsx` currently coordinates these facts with local booleans,
callbacks, refs, CSS data attributes, and synchronous cancellation calls. It is
the right composition root, but it is carrying several stable concepts that now
have at least two consumers and therefore qualify for extraction.

## The target shape

```text
                         separate semantic lifecycles
               ┌──────────────┼──────────────┐
               │              │              │
          Lasso address   Stretch degree   Text Swap turn
               │              │              │
               └────── claims + phases + address ──────┐
                                                        │
                          Material Operation Slot       │
                          lease/exclusivity only        │
                                                        ▼
                         Material Address Projection
                         pure semantic render intent
                                                        │
DOM Range measurement ── Material Geometry Receipt ─────┤
render edge only          client-space, epoch-bound      │
                                                        ▼
                         Address Render Model
                         pure fragments + anchors
                                                        │
               ┌────────────────┼────────────────┐
               │                │                │
       MaterialAddressLayer  ElasticInstrument  PointTalkInstrument
       one contact surface   grips + pocket     Fog/field + activity
               │                │                │
               └────────────────┴────────────────┘
                                │
              LanguageSplitProjection and tree lifecycles remain separate
```

The dependency direction is deliberate:

- semantic reducers never import DOM, React, CSS, or presentation components;
- the render edge measures and publishes plain frozen data;
- pure projection combines existing lifecycle facts with a current geometry
  receipt;
- components paint the resulting model and dispatch existing public actions;
- no presentation value enters tree, history, protocol, persistence, or model
  context.

## 1. Material address identity

Do not invent another network or document address. Reuse the current validated
`SegmentSelection` and selection-set grammar. Add only a transient presentation
identity that states why the existing address is visible:

```ts
type MaterialAddressIntent =
  | {
      kind: "range";
      source: "lasso" | "point-talk";
      selection: SegmentSelection;
    }
  | {
      kind: "selection-set";
      source: "lasso";
      selections: readonly SegmentSelection[];
    };
```

This type is illustrative, not frozen. The important rules are:

- a complete-node Point and Talk reference remains a complete-node
  `SegmentSelection`; it does not gain a parallel node-address protocol;
- a selection set remains non-generative and never acquires Elastic controls;
- address identity includes the exact tree/document owner, node, UTF-16 bounds,
  selected text, and target-node memento needed for revalidation;
- whole-tree revision is not the sole identity. An unrelated revision may move
  layout without changing the addressed text, so it requests remeasurement
  rather than silently creating a different reference;
- a target edit, removal, role change, document switch, or failed exact
  validation revokes the address and any authority that depends on it.

## 2. Geometry receipt

Semantic address and measured geometry must remain separate transient values.
The shared geometry receipt should be the only source of fragment paint and
material anchors:

```ts
type MaterialGeometryReceipt = Readonly<{
  addressKey: string;
  basis: Readonly<{
    treeId: string;
    documentEpoch: number;
    layoutEpoch: number;
    viewportKey: string;
  }>;
  fragments: readonly ClientTextRect[];
  lines: readonly MaterialVisualLine[];
  bounds: ClientBounds;
  column: ClientBounds;
  anchors: Readonly<{
    upper: ClientAnchor;
    lower: ClientAnchor;
    upperStart: ClientAnchor;
  }>;
}>;
```

Again, the names are a design sketch. The receipt contract is:

- all geometry uses client CSS pixels. World/local conversion happens once in
  a pure consumer and never creates a second measured truth;
- fragments are finite, non-zero, clipped only by an explicit presentation
  boundary, and normalized into deterministic visual-line order;
- wrapped fragments are grouped by overlap, not DOM enumeration order;
- a selection set publishes all of its valid ranges or none of them;
- a whole-node range is measured through the same `Range` path as a Lasso
  range; Point Talk must stop owning a second `contentBounds` implementation;
- the receipt is frozen, disposable, and keyed by semantic address plus layout,
  canvas, and visual-viewport epochs;
- layout, font, zoom, scroll, visual viewport, or paper translation clears old
  geometry before paint, then remeasures on one animation-frame boundary;
- an unavailable receipt means no reference paint and no interactive grip. A
  stale-looking affordance is more dangerous than a temporarily absent one;
- pointer movement never measures a Range, walks text, or sets React state.

The current `measureTextRange` remains the low-level browser primitive. The new
work is to move ownership of remeasurement, normalization, and receipt
publication out of `useLasso` so whole-node Point Talk and later exact-address
features cannot create new measurement paths.

### CSS Custom Highlight boundary

Custom Highlight remains useful for copy-like, layout-following paint. It cannot
be the only active-operation renderer: during upper-grip Elastic preview the
canonical DOM range remains at its natural location while the visible selected
language is projected downward. A Custom Highlight would therefore remain on
the hidden source.

The active material address needs one explicit fragment renderer whose pure
render model can translate the same natural receipt with the projected
material. This renderer may use DOM spans, SVG, or another tested primitive,
but it must have one owner across neutral and engaged states. The existing
fixed fragment overlay is the safer starting primitive.

## 3. Material address projection

The projection reads existing lifecycle state and emits a semantic render
intent. It does not mutate or cancel those lifecycles:

```ts
type MaterialAddressPresentation = Readonly<{
  address: MaterialAddressIntent;
  phase:
    | "addressed"
    | "adjusting"
    | "directing"
    | "listening"
    | "pending"
    | "recovering";
  instrument: "none" | "elastic" | "point-talk";
  interactive: boolean;
  displacement: Readonly<{ x: 0; y: number }>;
}>;
```

The projection establishes one explicit priority table:

| condition | reference | instrument |
| --- | --- | --- |
| native copy | browser native range | none |
| structural navigation selection | navigation treatment | none |
| neutral single-range Lasso | Lasso exact range | two Elastic grips when eligible |
| Lasso selection set | complete set | none |
| Elastic adjustment/pending | same Lasso range | two grips + degree pocket |
| Point Talk eligible/voice/pending | complete-node range | one Point Talk instrument |
| successful mutation | address hands off atomically | existing result-settle presentation |

Structural navigation and native copy share palette/tokens, not reducers,
geometry receipts, or operation authority.

## 4. Material operation slot

The product already declares one transient AI-operation slot, but current
mutual exclusion is expressed through scattered calls such as closing Inquiry,
cancelling Elastic, closing Point Talk, and hiding controls.

Extract a very small root-owned lease:

```ts
type MaterialOperationOwner = "elastic" | "point-talk" | "inquiry";

type MaterialOperationLease = Readonly<{
  owner: MaterialOperationOwner;
  interactionId: string;
}>;
```

It owns only acquisition, replacement, release, and a monotonically unique
interaction identity. It must not own:

- Lasso mode or selection;
- Elastic degree or request state;
- Text Swap direction, microphone, request, or error state;
- Inquiry question, answer, or snapshot;
- Voice admission;
- tree or history.

Acquiring a lease synchronously revokes the previous owner's public lifecycle
before the opening action returns. Losing a lease makes every late effect inert.
Neutral Lasso owns no lease; the Elastic lease begins when a grip adjustment
begins. Inquiry may therefore continue to use a neutral Lasso selection as
explicit context. Voice admission remains a separate gate that synchronously
revokes the slot and temporarily withholds actionable Elastic selection.

This is the smallest extraction that makes the already-frozen product rule
mechanical without creating a global interaction reducer.

## 5. Render model and components

The pure render model combines one current receipt, the presentation phase, and
operation-specific degree or placement policy:

```ts
type MaterialAddressRenderModel = Readonly<{
  key: string;
  phase: MaterialAddressPresentation["phase"];
  fragments: readonly Readonly<{
    rect: ClientTextRect;
    role: "first" | "middle" | "last" | "only";
  }>[];
  anchors: MaterialGeometryReceipt["anchors"];
  instrument: "none" | "elastic" | "point-talk";
}>;
```

The visual component split should follow lifecycle ownership:

- `LassoStrokeLayer` keeps drawing ink, closure, particles, pointer snapshots,
  and no settled selection fill;
- `MaterialAddressLayer` is the single owner of settled reference fragments;
- `ElasticInstrument` owns two grip buttons, their accessible slider semantics,
  and the degree pocket, but not fragment paint;
- `LanguageSplitProjection` remains the layout/reflow projection and keeps its
  duplicate visible text. Its `.language-split-selected-copy` stops painting a
  second selection background;
- `PointTalkInstrument` owns the direction/voice/status surface. It receives a
  shared upper-start anchor and current viewport bounds rather than measuring
  target text itself;
- `NodeActionLens` keeps Control Fog and collision policy, but obtains its
  first-line material anchor through the shared measurement vocabulary;
- `RootedMaterial` composes the owners and their public actions. It no longer
  derives the same visibility and cancellation policy in several local boolean
  expressions.

This extraction is justified by independent lifecycles, not by file size alone.

## Elastic continuity

The language-split projection is still required. Plain text must retain browser
shaping, CJK wrapping, native selection, and accessibility; physically splitting
canonical text into arbitrary spans would threaten those properties.

The architectural change is narrower:

- the natural geometry receipt remains stable for the settled degree;
- lower-grip expansion applies no displacement to the reference fragments;
- upper-grip expansion applies the same client-space Y displacement to every
  reference fragment that the layout projection applies to selected language;
- pocket depth expresses degree and never doubles as the reference mark;
- the selected-text duplicate contains ink only, not another selection skin;
- handle anchors, fragment displacement, and split layout derive from one pure
  preview calculation or one shared receipt, never parallel arithmetic;
- layout invalidation during drag restores the prior settled degree before old
  handles disappear, matching the current reducer contract;
- pending keeps the same reference and pocket. Provider failure returns the
  same degree/address to a usable phase without error chrome;
- commit hands presentation directly to the existing transform-settle receipt.
  There must be no paint in which both the address and result disappear.

The last point needs an explicit transient handoff identity between the current
address and `MaterialTextCommittedChange`. It is presentation-only and expires
after the first trustworthy post-commit layout publication or the bounded
settle sequence, whichever the accepted design freeze chooses.

## Point Talk continuity

Point Talk should use the same address pipeline without becoming a Lasso
operation:

1. the AI click constructs the current exact whole-node `SegmentSelection`;
2. that range receives a geometry receipt and contact impression;
3. Control Fog closes and the Point Talk field opens from the shared upper-start
   anchor;
4. the whole-node reference remains visible through eligible, permission,
   recording, transcribing, ready, pending, retryable failure, and recovery;
5. target invalidation cancels the Text Swap turn, releases the operation lease,
   removes the reference, and rejects late work;
6. success hands the same identity to the existing Text Swap settle sequence.

`nodeActionsEnabled` must explicitly exclude an active Point Talk lease. The
current click closes the existing lens, but the root eligibility expression does
not prevent hover/focus from mounting it again while the field is open.

The expanded field may still prefer the space above the material and fall below
when necessary. It must derive that decision from the same target geometry and
visual-viewport intersection. The initial field anchor and the closed AI mark's
anchor need a bounded continuity tolerance; subsequent camera or keyboard
viewport movement reprojects from the semantic address rather than preserving
stale screen coordinates.

## Native copy and structural selection

These are a related visual calibration, not part of the generative address
runtime.

- native copy receives the quietest density in the same neutral token family;
- structural navigation selection keeps its own navigation state and accessible
  semantics, but should no longer compete with an actionable address through a
  large filled paragraph capsule;
- Lasso and Point Talk use the full contact impression because they declare an
  exact operation reference;
- a coarse-pointer structural selection may reveal Control Fog, but opening
  Point Talk replaces that structural emphasis with the explicit material
  address before any generative state begins;
- review the current `aria-pressed` passage semantics separately. A visual
  unification is not permission to keep an inaccurate accessibility state.

## Invalidation and recovery matrix

| event | semantic address | geometry receipt | operation lease | visible behavior |
| --- | --- | --- | --- | --- |
| unrelated node edit | revalidate and retain when exact basis holds | clear and remeasure after layout | retain | same reference moves honestly |
| addressed text edit | revoke | clear before paint | revoke | controls disappear; late result inert |
| target removal/held aside | revoke | clear | revoke | no guessed fallback target |
| document/tree switch | revoke | clear | revoke | no cross-document frame |
| resize/font/zoom/scroll | retain | clear then remeasure | retain unless target becomes unusable | no stale hit area |
| layout invalidation during grip drag | retain | clear | retain Elastic | restore prior settled degree, then re-arm |
| visual viewport/keyboard change | retain | clear then remeasure | retain Point Talk | field and mark stay within current visible bounds |
| target leaves mounted visible projection | lifecycle policy revokes | clear | revoke | field closes; late work inert |
| provider/transport failure | retain | retain/currently remeasureable | retain | original material and usable local control |
| successful commit | old address expires after handoff | old receipt expires | release after accepted commit | result settle replaces reference without blank frame |
| pointer cancel/capture loss | retain settled address | retain/revalidate | release only if no active adjusted turn remains | prior degree restored |
| page hidden/unmount | lifecycle-specific revoke | clear | revoke | resources cleaned once; no late UI |

## Edge cases that must be designed, not discovered late

### Text and Range

- wrapped selections with stepped first and last lines;
- adjacent punctuation segments, final seam, whitespace, CRLF, and complete-node
  ranges;
- combining marks, surrogate pairs, variation selectors, flags, skin tones,
  ZWJ emoji, Indic conjuncts, bidirectional text, and empty/zero-area DOM rects;
- browser rect enumeration order, sub-pixel values, device pixel ratio, and
  ranges split across presentation wrappers such as repair/transform settle;
- a source whose text remains valid while its type size or line wrapping changes.

### Geometry and camera

- Full and Focus view; root and child typography; 390px, tablet, laptop;
- paper clipping, sidebar/drawer occlusion, visual viewport offsets, browser
  zoom, canvas pan/zoom, and mobile keyboard appearance;
- Point Talk above/below fallback, minimum usable width, partially visible
  target, and target near every paper edge;
- font-load and resize races; layout publication older than the interaction;
- virtualization unmount/remount and a target whose semantic node survives but
  has no current DOM owner.

### Ownership and concurrency

- neutral Lasso plus Inquiry context;
- first Elastic pointer-down revoking Inquiry before pointer capture proceeds;
- Point Talk opening while an Elastic amount or request exists;
- Voice admission starting during neutral or adjusted Elastic;
- Point Talk voice permission resolving after target or document loss;
- one operation completing while a newer owner already holds the slot;
- double click/native copy while keyboard Undo/Redo and canvas selection exist;
- a retryable Point Talk failure followed by layout change or another AI entry.

### Presentation and accessibility

- forced colors, reduced motion, no backdrop filter, no mask composite, and
  coarse pointer;
- keyboard focus travelling from passage → Control Fog → Point Talk and back;
- exactly one accessible copy of the selected text while projection copies are
  inert;
- grips remain minimum-size targets and retain vertical-slider semantics;
- state announcement is bounded and never duplicates visible material;
- reference identity must remain visible without relying on motion or opacity
  alone.

## What merges, what changes, what stays separate

| treatment | boundary |
| --- | --- |
| merge | Range/whole-node measurement, fragment normalization, visual-line grouping, anchors, reference renderer, address tokens, operation lease, continuity proof fixtures |
| change | `useLasso` geometry ownership, `LassoOverlay` responsibilities, Point Talk target measurement, Fog/field anchor handoff, root eligibility/cancellation projection, language-split selected background, structural selection calibration |
| keep separate | Lasso acquisition, Stretch reducer/physics, Text Swap reducer/voice/effects, Inquiry lifecycle, admission lifecycle, transform and text-swap protocols/routes/governors, language-split layout, tree mutation/history, result-settle policies |
| delete after migration | duplicate `contentBounds`/first-line address arithmetic where the shared receipt replaces it; duplicate selected-material CSS; scattered Point Talk/Fog visibility conditions now owned by the operation slot |
| explicitly do not add | global AI reducer, persistent selection store, scene graph, editor framework, universal `/api/ai`, new protocol version, dependency, or feature-specific color system |

## Implementation sequence

No visual implementation should begin until the architecture and Cloud review
packet agree on the state matrix and contact grammar.

### Slice 0 — characterization and joint freeze

- record current browser states for native copy, structural selection, neutral
  Lasso, both Elastic grips at neutral/dragging/pending, Point Talk eligible,
  voice, pending, and retryable failure;
- freeze exact semantic owners and the invalidation matrix above;
- freeze six visual decisions with Cloud: fragment topology, first/last edge,
  grip attachment, phase density, Fog→field expansion, and result handoff;
- define objective continuity tolerances before touching CSS.

### Slice 1 — foundation with no visible change

- add the pure operation-slot reducer and ownership tests;
- add address keys, geometry receipt, fragment/line normalization, and pure
  render-model projection;
- adapt the current Lasso path first and prove old/new geometry equivalence on
  fixtures while only the old surface remains visible;
- add one focused import-fitness rule only if the new stable boundary produces a
  real illegal edge that review alone cannot hold.

### Slice 2 — one Lasso/Elastic reference surface

- split `LassoStrokeLayer`, `MaterialAddressLayer`, and `ElasticInstrument`;
- move settled fragment paint to the shared layer;
- remove selected background ownership from `LanguageSplitProjection`;
- drive upper/lower reference displacement and grips from one projection;
- prove neutral → drag → adjusted → pending → failure/result continuity.

### Slice 3 — Point Talk address and anchor

- measure the whole-node `SegmentSelection` through the shared receipt;
- keep its reference mark throughout the Text Swap lifecycle;
- feed Point Talk placement from the shared anchor/viewport projection;
- suppress Control Fog through the operation lease while Point Talk is active;
- prove desktop/coarse/keyboard paths produce the same semantic reference.

### Slice 4 — copy/navigation/actionable hierarchy

- calibrate native copy, structural selection, and actionable address as one
  token family with three semantic strengths;
- repair the structural selection silhouette and accessibility semantics;
- keep this slice free of generative protocol or lifecycle work.

### Slice 5 — cleanup and future admission rule

- delete duplicate geometry and CSS owners only after their focused tests move;
- document the final contract in product/architecture/material/changes;
- require every later material-local capability to declare address, receipt,
  instrument anchor, degree owner, operation lease, pending/recovery, settle
  handoff, and proof matrix before UI is added.

Each slice must be independently reviewable and revertible. Do not combine the
geometry foundation, Elastic visual migration, Point Talk migration, and
structural-selection redesign in one change.

## Proof strategy

The current tests prove each feature locally. The new suite must prove the seams:

### Pure tests

- exact address-key revalidation and unrelated-revision behavior;
- rect normalization, line grouping, anchors, clipping, sub-pixel rounding, and
  invalid input rejection;
- operation-slot replacement, release, stale lease, idempotent cleanup, and
  admission revocation policy;
- phase/priority projection and upper/lower displacement;
- Point Talk anchor/placement from the same receipt.

### Component/browser tests

- one and only one visible reference surface through every transition;
- Lasso fragment rects and engaged reference rects differ only by the declared
  displacement/tokens;
- the selected-text duplicate never paints its own background;
- both grips remain attached to the actual first/last selected visual lines;
- Point Talk target mark is identical across hover, coarse selection, and
  keyboard entry;
- Control Fog count is zero while Point Talk holds the slot;
- Fog AI anchor and first Point Talk frame remain within the frozen tolerance;
- no stale grip/reference frame after resize, font, layout, tree, or document
  invalidation;
- no blank frame at address→result handoff;
- fixed screenshot fixtures cover only reference and instrument, not the entire
  canvas.

### Release matrix

- light/dark, reduced motion, forced colors;
- fine/coarse pointer, keyboard, screen-reader semantics;
- Full/Focus, root/child, one/wrapped/whole-node/selection-set;
- laptop, 390px, tablet, browser/canvas zoom and mobile visual viewport;
- pointer cancel, lost capture, scroll, resize, font settle, unmount, target
  removal, hold aside, unrelated edit, addressed edit, provider refusal,
  retry, late success, Undo, and document switch.

## Collaboration contract with Cloud

The division should be explicit before either side edits the other boundary.

### Foundation owner

The architecture/foundation pass owns:

- semantic address identity and exact validation;
- operation-slot lease and synchronous revocation;
- geometry receipt/invalidation and pure render model;
- lifecycle adapters and address→result handoff;
- import direction, cleanup, stale-work, and pure/browser proof harnesses;
- preserving current protocols, tree engine, history, and model boundaries.

### Cloud UI owner

Cloud's UI pass owns, within the accepted render model:

- the contact impression's exact fragment outset, radius, joins, and density;
- the visual seam between contact impression and both grips;
- phase-specific edge energy and bounded motion;
- Control Fog → Point Talk unfolding form and optical continuity;
- structural/native/actionable selection calibration;
- perceptual browser review across light/dark, sizes, pointer types, and motion
  preferences.

### Joint decisions

Neither side may decide alone:

- whether a visual idea requires new geometry or lifecycle state;
- the state matrix and visible-owner priority;
- the continuity tolerance at owner handoffs;
- whether pending/failure retains enough reference identity;
- accessibility fallbacks that materially alter the visual form;
- removal of an existing renderer, measurement path, or proof.

Cloud should review transition recordings, not only still screenshots. The
foundation owner should provide inspectable receipt/render-model fixtures, not
ask Cloud to infer state from DOM classes. If Cloud needs a shape that the
render model cannot express, both sides reopen the pure projection and proof
boundary before adding component-local geometry.

## Joint freeze packet

Before implementation, hand Cloud one bounded packet:

1. the current-state recording and screenshots;
2. the reference/phase/owner matrix;
3. six frozen geometry fixtures: one line, wrapped stepped range, adjacent
   segments, whole node, top-grip displacement, bottom-grip displacement;
4. serialized examples of the proposed address and render models;
5. the invalidation/recovery matrix;
6. the exact browser/perceptual proof checklist;
7. six open visual questions, with no architecture hidden inside them:
   fragment topology, fragment joining, grip seam, active density, listening /
   pending activity, and Fog→field unfolding.

Implementation begins only after both reviews agree that this packet can
express the intended UI without feature-local escape hatches.

## Acceptance boundary

The architecture is successful when:

- the same exact material reference remains identifiable from address through
  action, pending, recovery, and result handoff;
- Lasso, Elastic, and Point Talk share no protocol or lifecycle state merely to
  achieve that visual continuity;
- one current geometry receipt owns every fragment and material anchor;
- no pointer-move path performs Range measurement or React publication;
- every operation has one lease, cancellation owner, late-result guard, and
  cleanup proof;
- Point Talk cannot coexist with a newly mounted Control Fog;
- native copy, structural selection, and actionable address are related but not
  semantically confused;
- future capabilities can reuse the address pipeline by adding an adapter and
  instrument, not a fourth selection renderer;
- the tree, history, protocol, provider, context, and persistence contracts do
  not change.
