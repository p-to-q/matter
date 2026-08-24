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

For the rooted slice, contextual tools are Add child, Focus, Fold/Unfold, and
Show all when the current view needs it. Select remains a direct material
interaction. The visible Branch slot targets the root when no node is selected;
Canvas pan remains a reachable no-op/return action when lasso is off. Undo is the
stable utility action and remains visible but disabled when history is empty. An
applicable tool temporarily locked by a pending interaction stays in place and
disabled.
Unimplemented voice, lasso, stretch, draw, move, and AI tools are absent.

The product surface restores the hackathon control island: a fixed paper rail on
the right at laptop widths and a bottom rail respecting the safe area on narrow
or coarse-pointer devices. It is not draggable. Voice, Lasso, Branch, Move, and
Undo retain stable visual positions; unavailable capabilities are honestly
disabled and never manufacture a command. Move describes the transient canvas
camera, not a node mutation. Buttons have visible tooltips or labels, native tab
order, and at least 44 CSS-pixel fine-pointer or 48 CSS-pixel coarse-pointer
targets. The selected desktop rail uses the second preview's `60px` / `22px`
outer geometry and `44px` / `13px` button geometry.
`aria-pressed` is reserved for a real persistent mode or toggle.

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

## Rejected

- a registry or extension API before two real external tool families need one;
- AI-ranked or usage-ranked tool order, because movement damages muscle memory;
- storing callbacks, icons, or domain commands in the catalog;
- showing disabled placeholders for future features;
- bringing back free per-node movement or authored coordinates through toolbar modes.
