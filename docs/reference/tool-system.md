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
interaction. Undo is the stable utility action and remains visible but disabled
when history is empty. An inapplicable contextual tool is absent; an applicable
tool temporarily locked by a pending interaction stays in place and disabled.
Unimplemented voice, lasso, stretch, draw, move, and AI tools are absent.

The product surface restores the hackathon control island: a fixed paper rail on
the right at laptop widths and a bottom rail respecting the safe area on narrow
or coarse-pointer devices. It is not draggable. Voice, Lasso, Branch, Move, and
Undo retain stable visual positions; unavailable capabilities are honestly
disabled and never manufacture a command. Move describes the transient canvas
camera, not a node mutation. Buttons have visible tooltips or labels, native tab order, and at
least 40 CSS-pixel fine-pointer or 48 CSS-pixel coarse-pointer targets.
`aria-pressed` is reserved for a real persistent mode or toggle.

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
