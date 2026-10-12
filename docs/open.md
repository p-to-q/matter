# Open

Deliberately unresolved. Everything here is out of scope until it is promoted by
a change entry and a plan.

Each item states what would have to be true to promote it. An item with no
promotion condition is not a real candidate — it is a wish, and belongs at the
bottom.

---

## Deployment: confirm Production deploys again after next 16.3.8

Tracked as [p-to-q/matter#130](https://github.com/p-to-q/matter/issues/130). Vercel
builds failed from the `next` 16.3.8 bump (#128). The cause was the post-build
`check:runtime` step meeting 16.3.8's adapter route-cache artifacts; #131 teaches it to
read them, and the Production deploy of `053bdaa` then succeeded. The next merge commit
(`c11b849`) failed within a second of creation, which looks like a queue artefact. Done
when the next Production deployment on `main` succeeds; then close the issue.

## Post-preview material-runtime candidates

These candidates share one direction but are not one project. Their research
order and promotion gates are in
[`handoff-post-preview-direction.md`](handoff-post-preview-direction.md).

### Coherent material projection and context receipt

Derive one bounded, versioned semantic projection from the rooted tree, then
adapt it separately for AI context, a deliberate machine-readable receipt, and
later diagram renderers.

Why it is wanted: current Archive, index Copy, material turns, and Inquiry each
project the same tree differently. Plain copying loses relations, while making
every renderer or prompt infer them independently risks drift and hidden scope.

Promotion requires: deciding the receipt's human and machine purpose; resolving
the stored Inquiry-record migration for `selection`, `lineage`, and
`working-tree`; an explicit clipping and privacy model; and proof that the
projection neither widens an address nor becomes a second document model.
Archive remains the exact recovery format, and ordinary native Copy remains
literal unless the owner separately reopens it.

### Lineage-aware visual projection

Let the material index and canvas show the root-to-target relationship while a
person is navigating or performing a bounded operation.

Why it is wanted: the relationship already governs focus and model context, but
the index and canvas do not yet explain consistently which path is active and
why a result belongs there.

Promotion requires: a state table separating navigation, lasso selection,
material-operation basis, and read-only Inquiry; a decision on when ancestors
and connectors appear and disappear; accessible semantics that do not mark
ancestors as selected; and proof that connector geometry remains transient view
state rather than authored coordinates or permanent mind-map chrome.

### Native editing-rail vocabulary

Reduce the main rail to operations that are native to Matter and move the fixed
Branch composition out of the main product when its Preview purpose has ended.

Why it is wanted: the current Branch action offers seeded continuation copy,
while selected Voice already owns Point and Talk. Treating a template as a
permanent editing primitive makes the rail describe the preview rather than the
material language.

Promotion requires: an explicit Preview/demo composition boundary that preserves
the existing seeded journey and tests; a decision on whether the main product
needs a human-authored child-creation operation; a full rail inventory; and
evidence that removal does not hide the only visible way to create structure.

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

Promotion requires: source address and direction; content identity and hash;
original and derivative ownership; preview, acceptance and one perceivable
commit; exact undo and redo; persistence, quota and garbage collection; Archive
round-trip; deletion, accessibility, model-context and privacy rules. No Image
control appears before that lifecycle closes.

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

- a permanent prompt box or assistant panel — the bounded Ask Matter record
  remains secondary, explicitly opened, non-mutating, and never hidden context;
- agent-initiated multi-step operations — the person keeps the handle;
- vector store, embeddings, retrieval, memory service — [`material.md`](material.md);
- infinite canvas panning, user-authored coordinates — Matter is rooted;
- persona-targeted feature work — [`product.md`](product.md).
