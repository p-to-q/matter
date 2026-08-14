# Working context

The document tree is complete material. The working context is the person's
transient decision about which visible material may participate in the current
canvas and model-facing work. It is not a second document, an archive filter,
or a hidden retrieval rule.

## Form

The left material index gives every material passage one context control:

```text
−  this passage and its branch are present in the working context
+  this passage and its branch are held aside from the working context
```

Pressing `−` holds that node and all of its descendants aside. They remain on
the canvas and in the index at a restrained lower opacity, so their place in
the thought remains legible, but they cannot receive a normal selection or a
lasso. In the index, that same action closes the branch beneath its root, so the
root's `+` remains the one compact recovery handle; it does not change canvas
layout or structural fold. Pressing `+` returns that branch and reopens its
index descendants. A node held aside by an ancestor has no independent control
until its ancestor is returned; this prevents a hidden exception inside an
otherwise withheld branch.

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
set so it can keep held material faintly visible. The material index, pointer
selection, lasso target measurement, inquiry projection, and future model
turns consume only the active projection. An explicit lasso is still the narrow
inquiry context, but it may only address active passages; it cannot override a
held-aside decision.

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
