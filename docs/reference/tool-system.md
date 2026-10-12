# Editing Tools

Module: `features/matter/tools/`

## Need

Matter needs the hackathon prototype's visible editing instrument without
restoring a permanent canvas mode bar. Tools must change with selected material,
stay predictable, and remain easy to extend without becoming a plugin framework
or a second state owner.

## Current choice

The right rail is a pure **tool projection** over runtime capability:

```text
selection + view + history + interaction state
  → projectTools
  → ordered visible tool descriptors
  → closed ToolIntent
  → controller revalidates and calls a named runtime action
```

The projection owns no selection, focus, fold, voice, pending, or undo state. It
does not construct a `TreeCommand`, mutate the tree, store callbacks, rank tools,
or load plugins. A static closed catalog carries identity, grouping, label, and
order; exhaustive predicates decide applicability.

For the rooted slice, contextual tools are Focus, Fold/Unfold, and
Show all when the current view needs it. Add child exists only in a Preview
Branch build (below). Select remains a direct material
interaction. Canvas pan remains a reachable no-op/return action when lasso is off. Undo is the
stable utility action and remains visible but disabled when history is empty. An
applicable tool temporarily locked by a pending interaction stays in place and
disabled.
Unimplemented voice, lasso, stretch, draw, move, and AI tools are absent.

The product surface restores the hackathon control island: a fixed paper rail on
the right at laptop widths and a bottom rail respecting the safe area on narrow
or coarse-pointer devices. It is not draggable. Voice, Lasso, Move (shown as Pan), and
Undo retain stable visual positions; unavailable capabilities are honestly
disabled and never manufacture a command. Move describes the transient canvas
camera, not a node mutation. Buttons have visible tooltips or labels, native tab
order, and at least 44 CSS-pixel fine-pointer or 48 CSS-pixel coarse-pointer
targets. The selected desktop rail uses the second preview's `60px` / `22px`
outer geometry and `44px` / `13px` button geometry.
`aria-pressed` is reserved for a real persistent mode or toggle.

Pan owns a direct-manipulation gesture only after the person selects Move. The
material plane declares `touch-action: none` before that gesture begins, so a
mobile browser cannot turn a few delivered pointer samples into native viewport
motion and then cancel Matter's camera owner. Pointer capture keeps the same
gesture alive when the finger leaves the paper, while the camera reducer derives
every frame from the original client-space point rather than accumulating event
deltas. Coalesced or skipped samples therefore change smoothness, never travel.
Cancellation retains the last accepted transient camera position; changing
tools releases capture and makes every later event from that pointer inert.
This follows the Pointer Events Level 3
[`touch-action` negotiation](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property),
[`pointercancel` boundary](https://www.w3.org/TR/pointerevents3/#the-pointercancel-event),
and [pointer-capture model](https://www.w3.org/TR/pointerevents3/#pointer-capture).
Excalidraw independently recorded the same Android/iPad failure and repair in
its [mobile-support investigation](https://github.com/excalidraw/excalidraw/issues/138).

The paper may also present one transient local action lens for a precise passage.
It does not create another catalog or state owner: its left control is the
material-local AI mark and opens one transient Point-and-Talk direction field
for that exact complete node; its right control projects the same
working-context transition as the material index — `−` sets an active branch
aside and `+` restores its held root. The render edge measures one collision-safe
position and mounts one shared lens regardless of tree size. Lasso, stretch,
pan, node drag, pending work, modal chrome, held descendants, and lack of clear
adjacent space all suppress it. A held root alone retains the local `+` recovery
and disables AI so set-aside text cannot become a transformation target.
Canvas Fold/Unfold remains an unpresented navigation capability in this
first-release surface. The material index has a separate view-local disclosure
control: it neither dispatches canvas Fold nor changes canvas visibility. Delete
stays behind the explicit selection contract.

Dispatch revalidates the projected target, revision-sensitive capability, and
pending lock. Pointer down must not accidentally select material behind the
rail. Removing a selected node through undo reconciles selection before the next
projection.

## Human child creation: Under

Branch left the main product because it composed text the person never spoke.
A person makes a child with the **Under** mark on a passage's local lens. Tapping it starts a
Voice admission at once with that passage as parent (`runtime/under-child.ts`
builds the handle with the same `createAdmissionAnchor`, so the child is
appended last); the spoken words become the child through the existing repair,
Wiki and tree-engine path, and the AI never writes them. Arming lasts one
utterance: tapping the mark again or `Escape` withdraws it. Fixed Voice keeps
its contextual meaning, but a live admission recording wins over a selected
passage (`runtime/voice-tool-route.ts`), so tapping Voice stops an Under
recording instead of opening Point and Talk. Selection does not move on commit,
so speaking again appends the next sibling. The mark is `aria-disabled`, never
removed, with a stated reason when the passage is held aside, is at the deepest
level (`MAX_TREE_DEPTH`), holds `MAX_CHILDREN_PER_NODE` children, the tree holds
`MAX_NODES_PER_TREE`, voice admission is unavailable, or another action is in flight.

## Preview Branch flag

`NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true`, read only by
`config/preview-branch.ts` and allow-listed in `next.config.ts`, keeps the retired Branch
tool: the fifth rail slot, the `insert-child` intent, `extendMaterial` and the seeded-branch
prose. It defaults to `false`, is documented in `.env.example`, and is never set in
`vercel.json`, so the deployed product has no Branch. `npm run test:e2e:preview-branch`
proves the five-slot rail; the default run proves four.

## Rejected

- a registry or extension API before two real external tool families need one;
- AI-ranked or usage-ranked tool order, because movement damages muscle memory;
- storing callbacks, icons, or domain commands in the catalog;
- showing disabled placeholders for future features;
- bringing back free per-node movement or authored coordinates through toolbar modes.
