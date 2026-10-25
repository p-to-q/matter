# Open

Deliberately unresolved. Everything here is out of scope until it is promoted by
a change entry and a plan.

Each item states what would have to be true to promote it. An item with no
promotion condition is not a real candidate — it is a wish, and belongs at the
bottom.

---

## Reload shows the seed document first

On reload the seeded document is laid out for about 150 ms before the stored document replaces
it, so a document that differs from the seed visibly jumps (measured: passages moving 100→270 px).
It affects every restored document, not only ones with pictures. Promotion: decide whether first
paint should wait for the stored document, or show a quiet placeholder, and prove it against the
cold-load receipt.

## Post-preview material-runtime candidates

These candidates share one direction but are not one project. Their research
order and promotion gates are in
[`handoff-post-preview-direction.md`](handoff-post-preview-direction.md).
Implemented baselines below describe the integration candidate, not Production.
The active plan owns remaining work; this list is not a second dispatch queue.

### Coherent material projection and context receipt

Derive one bounded, versioned semantic projection from the rooted tree, then
adapt it separately for AI context, a deliberate machine-readable receipt, and
later diagram renderers.

Why it is wanted: current Archive, index Copy, material turns, and Inquiry each
project the same tree differently. Plain copying loses relations, while making
every renderer or prompt infer them independently risks drift and hidden scope.

Baseline: pure projection, three address meanings, structured Copy and Receipt
v2 are implemented; strict v1 verification remains. Shared adverse fixtures and
focused v2 escape/order/size/delivery proofs exist. Remaining: final-source
integration and the full Archive ordering/timezone matrix. Existing Inquiry vocabulary
does not need a storage migration, and a small evaluation did not justify new
wire parent fields; reopen for a concrete failure rather than a naming change.
Archive remains the exact recovery format. Ordinary Copy carries a selection's
own nesting as an indented plain outline (and a nested list for rich editors)
but never ids, digests or headers; the strict receipt stays a separate act in
Archive.

### Lineage-aware visual projection

Let the material index and canvas show the root-to-target relationship while a
person is navigating or performing a bounded operation.

Why it is wanted: the relationship already governs focus and model context, but
the index and canvas do not yet explain consistently which path is active and
why a result belongs there.

Baseline: index ancestry and a transient canvas trail are implemented, with a
state table and epoch checks. Remaining: owner-reviewed visual redesign of the
trail, using actual adjacent parent-child links, lighter legible ink and the
sidebar's symbol family. The design-only
[`material connections proposal`](reference/material-connections-design.md)
defines quiet/reveal/dismiss behavior and distinguishes hierarchy from future
manual associations. Implementation tests do not accept the visual design.

### Native editing-rail vocabulary

Reduce the main rail to operations that are native to Matter and move the fixed
Branch composition out of the main product when its Preview purpose has ended.

Why it is wanted: the current Branch action offers seeded continuation copy,
while selected Voice already owns Point and Talk. Treating a template as a
permanent editing primitive makes the rail describe the preview rather than the
material language.

Baseline: Under admits a human-spoken child; Branch is confined to the explicit
Preview flag. Remaining: real-use discovery and interaction review, and updating
the independent film capture before it is used as evidence of the main product.
Further native editing operations still require their own product decision.

### Local and private intelligence runtime

Allow the same bounded Matter scenarios to use a verified private API, qualified
browser-local inference, or a trusted desktop-local runtime without changing
the material contract.

Why it is wanted: provider replacement, offline continuity, privacy, and smaller
local models support personal authority and make the document less dependent on
one service.

Promotion requires: separate Web and Desktop trust boundaries; model licence,
provenance and integrity; device and memory floors; installation, update,
rollback, cancellation and resource ownership; a complete offline receipt; and
proof that the current web rejection of localhost and private-network provider
addresses remains intact.

### Generated media as material

Permit an image, sound, or later generated medium only when it has the same
clarity of address, ownership and recovery as text material.

Why it is wanted: generative media can make more kinds of thought visible, but
an API result or decorative attachment is not yet material.

Baseline: the picture lifecycle is implemented in the candidate, including
preview/Keep, pointer identity, bytes, Undo, persistence, Archive and missing
states. Production remains closed. Opening it still requires spend and edge
controls, real-relay evidence, unused-byte compaction, native copy review and a
database v7 recovery decision. Other media require their own native lifecycle.

### Replicated computation and sync

Let more than one device recompute a trustworthy view from portable material or
an ordered stream of accepted changes.

Why it is wanted: future local clients may need continuity across devices, and
later collaboration may need convergence without transferring rendered views.

Promotion requires: observed cross-device or multi-writer need that explicit
export cannot satisfy; identity, snapshot bootstrap, ordering, idempotency,
replay and conflict rules; and a proof that replication history is not Material
Undo. Until then CRDTs, event logs, reflectors and cloud authority stay research
references rather than architecture.

Only replication waits here. Croquet's model/view discipline — one deterministic
model, views as pure projections, view state never entering the model — is
already how Matter is built, and it informs the projection and local-runtime
candidates above rather than this one. See
[`reference/post-preview-research.md`](reference/post-preview-research.md).

## Gesture candidates

Both of these operate on **structure**, not text, which is why they are more
interesting than more text tools and also why they are riskier.

### Split — cut a node into two

Draw a stroke through a node; it becomes two sibling nodes at that boundary. No
model call is required; the agent's only possible job is smoothing the seam.

Why it is wanted: every present act is additive. There is no way to divide a
thought that arrived as one passage but turned out to be two.

Promotion requires: a decision on whether the cut lands on a segment boundary
(consistent with the address space) or anywhere (consistent with the gesture),
and a definition of which half keeps the node's identity, children, and history.
The identity question is the hard one.

### Merge — bring two nodes together

Drag two nodes into overlap; a parent is generated whose text is what they have
in common. The children hang beneath it.

Why it is wanted: today the tree only expands. A structure that cannot converge
has the same disease as an infinite canvas in a different shape. Merge is the
inward breath, and it gives a person a reason to pull the tree back in that is
their own, not a constraint imposed by the UI.

Promotion requires: a rule for merging non-sibling nodes (probably: forbid it),
a rule for what happens to the originals (probably: they become children, not
deleted), and evidence that the generated parent is worth reading. That last one
is a quality bar, not an engineering problem, and it is the reason this is not
scheduled.

### Strike through — abandon without deleting

Mark a node as set aside. It stays in the tree at low emphasis and stays out of
context.

Why it is wanted: rejected thoughts are the highest-signal material a person
produces, and deleting them is the one irreversible act in an otherwise
reversible system.

Promotion requires: deciding whether struck nodes are excluded from lineage
context — probably yes — and whether they survive export. Cheap to build; parked
only because it is not yet needed.

---

## Interaction candidates

### Context-aware tool prediction

Show the three tools most likely to be needed next rather than the whole set.

Blocked by ordering, not difficulty: the gesture vocabulary must first be small
and semantically disjoint. Predicting among four clear tools is useful.
Predicting among nine overlapping ones is guessing, and it will read as the
interface being unreliable.

Promotion requires: a frozen gesture vocabulary.

### Two-dimensional semantic field

Drag a handle in a plane — one axis obey↔provoke, the other strange↔precise —
to express direction without naming it.

Carried over from an earlier prototype. It conflicts with the grammar as it now
stands: direction is voice's channel, and giving it a second carrier breaks the
orthogonality that makes the grammar learnable.

Promotion requires: a reason to believe direction genuinely has two carriers, or
a reassignment of what the plane means. More likely it stays archived.

### Follow a thought

Click a word; adjacent concepts grow around it; keep clicking to keep reasoning.

Carried over from an earlier prototype. It is close to the tree — arguably it is
the tree, with the model choosing the children instead of the person. That is
the problem: it is the one candidate that hands the handle over.

Promotion requires: a form in which the person still authors the branch.

### Streaming voice

Transcribe as a person speaks, so text appears while the thought is still being
formed, rather than after.

Explicitly deprioritized. Record-then-transcribe is adequate for the current
claim, and streaming introduces partial-state handling across the whole
interaction lifecycle for an experiential gain that has not been demonstrated to
matter here.

Promotion requires: evidence from use that the pause between speaking and seeing
breaks the thought.

---

## Structural candidates

### Cross-branch links

Deferred from protocol `0.2`. See [`material.md`](material.md). The owner asked
on 2026-10-16 to design manually authored dashed links, including distant
passages, without implementing them yet. The
[`design proposal`](reference/material-connections-design.md) recommends durable
associations in the same document, not second parents or canvas-only decoration.
That meaning still needs confirmation before build.

Promotion requires: explicit association/reparent semantics; pointer/touch
reveal, connect and cancel; bounded curve routing; tree-engine edits and exact
Undo; versioned persistence/Archive/older-reader behavior; and real-page review.
The proposed context rule is no automatic traversal or scope expansion. A
durable association can matter to the person without becoming AI authority.

### Multiple roots per session

Currently one session is one root. Multiple roots would remove the pressure to
name a top-level thought before one exists.

Promotion requires: a hard cap on visible roots, and a rule that forces
convergence when the cap is hit. Without that this is infinite canvas again.

### Collaboration

Two people on one tree, with the agent showing conflict and overlap rather than
resolving it.

Promotion requires: persistence, identity, and a CRDT decision — in that order.
Nothing before persistence.

---

## Not candidates

Recorded so they stop being re-proposed:

- a permanent prompt box or assistant panel — the bounded Ask Matter record
  remains secondary, explicitly opened, non-mutating, and never hidden context;
- agent-initiated multi-step operations — the person keeps the handle;
- vector store, embeddings, retrieval, memory service — [`material.md`](material.md);
- infinite canvas panning, user-authored coordinates — Matter is rooted;
- persona-targeted feature work — [`product.md`](product.md).
