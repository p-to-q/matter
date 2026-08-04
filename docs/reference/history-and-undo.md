# History and Undo

Module: `features/matter/tree/`

## Problem

Every committed material change must be reversible to the exact prior state,
because reversibility is how the person keeps the handle.

Concretely:

- an inverse exists for every mutation, including subtree removal;
- an invalid plan is rejected whole; partial application never happens;
- undo restores text, structure, order, and time fields exactly;
- history is bounded by both command count and retained inverse bytes;
- transient state — pointer, audio level, partial transcript — never enters it.

## Prior art

**Command pattern with memento.** The textbook shape: a command knows how to
apply itself and how to undo itself. Gets right: the inverse is a first-class
object, not something derived later.

**ProseMirror's `Step` / `invert(doc)`.** The closest match to what Matter
needs, and the source of the one non-obvious rule here: a step's inverse is
computed **against the document it is about to be applied to**, at apply time.
Deriving an inverse afterwards, from the before and after states, is where
exactness quietly gets lost — a diff can describe a result without describing
what actually happened to reach it.

**Automerge and Yjs undo managers.** Scoped, per-origin undo over a CRDT.
Correct answer if collaboration lands, since "undo my change but not theirs"
stops being expressible in a linear stack. Not needed while a tree has one
author.

**Editor history grouping.** Coalescing rapid keystrokes into one undo unit.
Not applicable: Matter has no keystrokes, and one turn is already one
perceivable change. Noted so nobody adds it by reflex.

## Chosen

```ts
type TreeCommand = {
  id: string;
  expectedTreeId: string;
  expectedRevision: number;
  mutation: TreeMutation;
  createdAt: string;
};
type CommandResult =
  | { ok: true; tree: ThoughtTree; inverse: TreeCommand; affectedNodeIds: string[] }
  | { ok: false; error: CommandError };
```

- `applyTreeCommand` is the only function that mutates the tree, and it returns
  the inverse it constructed from the pre-state in the same call. There is no
  path that applies without producing an inverse.
- An empty document has `rootId: null`, no nodes, and a real revision.
  `initialize-root` and its private `clear-root` inverse make the first admission
  pointer-undoable without a fake root node or a revision reset.
- `remove-subtree` captures one `DetachedSubtree`; its inverse is the private
  `restore-subtree` mutation. The memento includes the exact subtree, parent,
  former index, and parent child order. Root removal is not part of `0.2`.
- A command contains one domain mutation. The engine checks its complete local
  preconditions, applies to a candidate, validates the complete tree, and only
  then publishes.
  Failure returns no candidate, inverse, or history entry.
- Every command carries `expectedRevision`; the engine checks it for forward and
  undo commits. This closes the gap between a plan conversion check and a later
  asynchronous apply.
- The inverse initially expects the committed revision. When several latest
  commands are undone in sequence, the history controller rebases only the next
  inverse's revision token. Mutation mementos still verify exact current
  material. A successful undo consumes the entry and does not push a new one;
  failure preserves both tree and stack. Opening, importing, or hydrating a
  document clears history and pending turns.
- `affectedNodeIds` is returned so motion can be local to what changed, rather
  than the view diffing to find out.
- Exact undo restores text, structure, order, and node timestamps. Tree revision
  remains monotonic because undo is a new commit.
- The undo stack holds committed human and agent commands. It drops oldest
  entries to satisfy both a count cap and a retained-inverse byte budget; one
  subtree memento may be close to the size of the document. Folding, focus, and
  selection are view state and are not undoable.

The public action vocabulary in [`../protocol.md`](../protocol.md) is smaller
than `TreeMutation` on purpose: the agent can propose only a range replacement.
Human admission uses an internal insert command; removal and reordering remain
private.

## Rejected

**Diff-based undo** — store before and after, compute the reverse later.
Rejected: this is the specific failure ProseMirror's design exists to avoid. A
diff between two trees is ambiguous about what happened, and undo then restores
something equivalent rather than something identical.

**Full snapshot stack.** Simple and tempting. Rejected on two counts: memory
grows with document size times history depth, and a snapshot loses
`affectedNodeIds`, so every undo becomes a whole-view reconcile instead of a
local motion.

**Generic object patches (`Immer`, JSON Patch).** Rejected: object paths are not
domain preconditions, their inverses obscure affected nodes and subtree intent,
and they weaken the distinction between public agent actions and private tree
mutations. The normalized tree is small enough for one nodes-map copy plus
clones of affected nodes.

**Undoable view state.** Rejected. If folding entered the undo stack, undo would
sometimes change what a person sees and sometimes change what they wrote, and
they would stop trusting it. Undo means "take back what was generated".

**Redo, for now.** Not rejected on merit, just not built. Every turn is cheap to
re-express by repeating the gesture, and a redo stack adds branching history
semantics for a case that has not come up. Promote it if use shows otherwise.
