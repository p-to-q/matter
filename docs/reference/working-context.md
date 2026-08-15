# Working context

The document tree is complete material. The working context is the person's
transient decision about which visible material may participate in the current
canvas and model-facing work. It is not a second document, an archive filter,
or a hidden retrieval rule.

## Form

The left material index separates directory disclosure from working context:

```text
› / ⌄  close or open an included branch in the index only
−      hold the current passage and its branch aside
+      return a held passage and reopen its branch
```

An included row does not permanently display `−`: on a precise pointer it
appears at the trailing edge only on row hover or direct keyboard focus, so
selection remains a reading state rather than an editing mode. A coarse pointer
has no hover, so its current row exposes the same action as a touch fallback. A
leaf therefore has no leading mark.
Pressing `−` holds that node and all of its descendants aside. They remain on
the canvas at a restrained lower opacity, so their place in the thought remains
legible, but they cannot receive a normal selection or a lasso. In the browse
index, that same action closes the branch beneath its faint root, so the root's
`+` replaces the disclosure mark as the one compact recovery handle. Search and
Select can still discover the durable descendants; neither changes canvas
layout or structural fold. Pressing `+` returns that branch and reopens its index
descendants. The browse outline derives one thin vertical segment for
each adjacent pair when that *visible* sibling group continues into a deeper
visible level: three siblings therefore have two distinct relations, owned by
their parent rather than by a leaf. A singleton has no relation to draw, and a
group that is entirely the terminal visible leaf level has no redundant rail.
A small joint gap keeps a larger group from becoming one accidental long rail.
An inherited parent segment may still pass a leaf row. Segments stop when a
branch closes and share the exact centre axis of the corresponding disclosure
or recovery slot. Select mode keeps the same guide topology, with its checkbox
centred in that slot rather than shifting the title. The original 11-pixel
control proportion keeps six pixels of endpoint clearance; a blank leaf joint
keeps four so separate edges remain distinct without floating away from the
row. The trailing `−` and row title do not supply guide geometry. Guides are
only a reading aid, never another hierarchy. A held result found by search
explicitly restores its lineage and selects that result in full view; a
search result opened from an existing focus view keeps that explicit focus
intent. A node held aside by an ancestor has no independent control until its
ancestor is returned; this prevents a hidden exception inside an otherwise
withheld branch.

The document root is not a control. A visible root passage may be held aside,
including the last active passage; an inquiry then has no material context and
returns the existing no-material outcome. Focus is an explicit act of taking
material up again: focusing a held branch first returns only its root-to-focus
lineage, then opens that exact working path.

## Authority

`WorkingContextState` owns only a normalized set of direct held-aside node ids
and a monotonic local epoch. The client-only Material root owns this lifecycle;
pure material helpers perform its transitions and projection. It resets on
hydration, import, and document switch. It never enters `ThoughtTree`, tree
history, IndexedDB material snapshots, exports, archives, or network envelopes.

One pure projection is the authority for every consumer:

```text
current view projection
  − structural-fold descendants
  − held-aside branches
  = active working projection
```

The canvas receives both the active projection and the complementary held-aside
set so it can keep held material faintly visible. The material index receives
both sets as the recovery surface. Pointer selection, lasso target measurement,
inquiry projection, and future model turns consume only the active projection.
Navigation labels remain a local presentation exception: they may name one node
from its own text, but never use it as model context or affect an inquiry. An
explicit lasso is still the narrow inquiry context, but it may only address
active passages; it cannot override a held-aside decision.

The browser sends only the resulting bounded material payload to `/api/inquiry`.
It sends neither the held-aside ids nor their count, so the server cannot infer
or retrieve excluded material.

## Measurement and cache boundary

The projection is derived once at the client composition boundary from tree id,
tree revision, full/focus mode, focus id, structural fold ids, held-aside root
ids, and the local epoch. It has one linear preorder pass and is memoized for
that exact key at the rendering edge; 2,000-node material stays within the
existing windowed index and canvas measurement budget. It is not a durable or
cross-request cache: a miss recomputes purely, a tree revision invalidates it,
and no model response is stored with it.

Changing the projection invalidates a live lasso snapshot and an outstanding
inquiry context. The existing operation-token check then makes a late response
a no-op. Geometry does not remeasure merely because opacity changes; only the
lasso target set and its selection state are refreshed.

## Proof

- a direct branch and all descendants become held aside without changing text,
  structure, revision, history, export, or persistence;
- index and canvas agree on active versus held-aside state at laptop and narrow
  widths, including leaf, ancestor, and all-material cases;
- held-aside material has no pointer or lasso target, and changing context
  clears any existing lasso selection;
- an inquiry without a lasso sends exactly the active projection and no signal
  about withheld material; a lasso never contains held-aside text;
- hydrate, import, undo, redo, and a late inquiry completion cannot restore an
  obsolete working-context projection.
