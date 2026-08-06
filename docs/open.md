# Open

Deliberately unresolved. Everything here is out of scope until it is promoted by
a change entry and a plan.

Each item states what would have to be true to promote it. An item with no
promotion condition is not a real candidate — it is a wish, and belongs at the
bottom.

---

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

### Lightweight Matter inquiry

A paper-contained, secondary inquiry may eventually accept a short question and
return orientation only. It would not alter material, invoke an editing tool,
retain a transcript, or have an autonomous persona. Weak and strong intelligence
modes are explicitly not designed yet.

Why it is wanted: a person may need a small amount of orientation without
leaving the workbench, while keeping Matter's main path embodied and material.

Promotion requires: a revision of the product invariant that currently forbids
prompt boxes, chat transcripts, and assistant surfaces; a bounded request and
response contract; proof that a non-material response cannot be mistaken for an
edit; and a decision about whether it has any durable state. Until then, the
corner control remains static information rather than a preview chat UI.

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

Deferred from protocol `0.2`. See [`material.md`](material.md).

Promotion requires: a rule for whether a linked node enters the lineage window.
If it does, the context boundary stops being the path and the product contract
needs rewriting. If it does not, the link is purely visual — which may be exactly
right.

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

- a prompt box, an assistant panel, a chat transcript — AI only changes material;
- agent-initiated multi-step operations — the person keeps the handle;
- vector store, embeddings, retrieval, memory service — [`material.md`](material.md);
- infinite canvas panning, user-authored coordinates — Matter is rooted;
- persona-targeted feature work — [`product.md`](product.md).
