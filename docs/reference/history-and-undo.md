# History and Undo

Module: `features/matter/tree/`

## Problem

Every committed material change must be reversible to the exact prior state,
because reversibility is how the person keeps the handle.

Concretely:

- an inverse exists for every mutation, including subtree removal;
- an invalid plan is rejected whole; partial application never happens;
- undo restores text, structure, order, and time fields exactly;
- history is bounded (owner decision 2026-09-29): the newest 1,000 steps within
  32 MiB of exact inverses across both stacks; older steps are released and the
  exported archive is long-term recovery;
- a step that cannot be restored is released and announced, never silently
  replaced by an empty journal;
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
  material. A successful undo moves the engine-produced inverse to the redo
  stack; keyboard redo applies that inverse through the engine again. A new
  human command clears the alternate redo future; a delivered result keeps the
  part of it that still replays (see below). An empty stack preserves both tree
  and stacks. A top inverse the engine refuses (`HISTORY_UNAVAILABLE`) leaves
  the tree unchanged and releases that whole stack, because every older step on
  it could only be reached through the refused one. The paper rail exposes only
  Undo; `Cmd/Ctrl+Shift+Z` and `Ctrl+Y`
  retain the platform convention without adding another visible tool.
  Opening, importing, or hydrating a foreign document clears history and
  pending turns.
- `affectedNodeIds` is returned so motion can be local to what changed, rather
  than the view diffing to find out.
- Exact undo restores text, structure, order, and node timestamps. Tree revision
  remains monotonic because undo is a new commit.
- The undo and redo stacks hold committed human and agent commands. Folding,
  focus, and selection are view state and are not undoable.

### Bounds

`MATTER_HISTORY_LIMITS` in `tree/history.ts` is `{ maxEntries: 1_000,
maxRetainedInverseBytes: 32 MiB }` across both stacks.

- The byte bound admits every legal inverse. The largest is a subtree restore of
  every node but the root at the text and id bounds with every code unit needing
  a six-byte JSON escape: about 24 MiB (`history.test.ts` builds it). CJK text
  at the bound is about 12 MiB and ASCII about 4 MiB. `HISTORY_LIMIT_EXCEEDED`
  therefore stays a guard for other limits, not a refusal a person can meet.
- One retention policy (`boundHistory` in `tree/history.ts`) bounds every
  operation: whole oldest undo steps are released first, then the farthest redo
  steps, until count and bytes fit across both stacks. An operation keeps the
  undo step it just produced (a commit, a delivery, a Redo); the byte bound
  exceeds every legal inverse, so that step always fits. Undo and Redo keep the
  count but may grow bytes slightly (each move re-inverts the command and
  extends its id), so they are bounded like any other operation. A history
  therefore never exceeds the bound in memory, and journal recovery applies the
  same policy: it releases nothing a current build kept and only trims a
  journal written under another policy, such as an unbounded v5 inline one.
- Each inverse is serialized once when it enters a stack, and its byte count
  travels with it. Totals are not carried between operations: every operation
  recomputes them from the entries while it bounds the stacks. That is linear in
  the at most 1,000 entries, not in their bytes, and the same order as the stack
  copy each operation already makes.
- Reaching the bound is ordinary editing and is not announced. Only an abnormal
  release is: a stored step that could not be read, a step that no longer
  applies, or durable steps shed under storage pressure.

### Recovery

`persistence/history-recovery.ts` attaches a stored journal in constant cost:
after the storage boundary's O(entries) shape check, it applies the bounds and
dry-runs only the next Undo and the next Redo (`verifyHistoryTops`). Every
deeper step is validated when first used, by the same engine preconditions that
make any memento exact. Replaying the whole journal on hydrate cost about 9 ms
per step at 2,000 nodes; the per-step storage layout and its measurements live
in [`virtual-file-system.md`](virtual-file-system.md#undo-journal-schema-v6).

A restored step carries `bytesUnverified`: its stored byte count is compared
with its memento when it is first applied, so a damaged record fails closed.
Seed relocalization follows the same rule. Untouched seed copy lives in the
material and in every memento that can restore it, so both follow the
language: an Undo of a person's edit to a seed passage restores that passage in
the language being read, even when no untouched passage is left in the
material. It rewrites the seed copy of every memento, re-measures only the
mementos it rewrites, and dry-runs only the two stack tops; the walk is linear
in the bounded journal and replays nothing. It runs once per language and
document instance, not for save phases or each settled turn. A deeper stale
step never stops translation. With about 1,000 nodes and 1,000 steps, the
whole-journal replay it replaced cost 4.4 s of main thread.

### Late results and the redo future

Elastic, Text Swap, and admission repair are submitted at one moment and
delivered later, when a visible pointer-idle window opens and the exact
read/write set still validates. Between the two the person may press Undo. If
the delivery then cleared redo as a human command does, the undone step would
be destroyed by latency rather than by anything the person did: start Elastic
on X, undo sibling Y's admission, and the arriving expansion would make Y
impossible to redo.

`commitDeliveredTreeCommand` therefore commits like `commitTreeCommand` but
keeps the redo future that still replays. The same retention policy then counts
both stacks: at capacity, the oldest undo steps are released first, never the
delivered step itself, and only then the farthest redo steps. The kept redo
prefix is the person's most recently undone intent and is fresher than the
oldest undo step. A delivery is one exact
text replacement of one node, and the engine reads node content only through
the node mementos a mutation carries. Every redo step nearer than the first one
carrying that node's memento replays unchanged; that first carrier holds the
replaced content and can never replay, so it is released with every later
step, which was recorded on top of it. The rule finds the exact replayable
prefix without replaying the tree: replay costs one full validation per step,
measured at 7.7 s for 1,000 redo steps over about 1,940 nodes. Tests check the
rule against full engine replay (the test oracle in `history-replay-oracle.ts`). Any other delivered mutation ends the redo
future as a human command does. The kept stack is
thus always one contiguous future that journal recovery, seed relocalization,
and the keyboard shortcut can replay without a special case; nothing is ever
applied against material its memento does not match. Human commands (admission,
branch, move, removal, rename) still end the redo future, as every editor does.
The rule does not ask whether the Undo came before or after submission: that
would need a second history clock, and a kept step can only ever restore
exactly what the person undid.

Rejected alternative: record the redo head in the turn's basis and fail the
delivery as stale when it moved. That keeps the textbook rule but discards a
paid, requested result because of an unrelated keyboard gesture, and the
person cannot tell why their change never arrived. Also rejected: delaying the
delivery until redo is empty, which can block forever. Reopen this choice if
collaboration or a second history owner makes "nearest replayable prefix"
ambiguous, if a delivered command can ever be something other than one exact
replace-text, or if the engine gains a precondition that reads node content
outside a carried memento (the replay oracle in `history.delivery.test.ts`
then fails).

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

**Unbounded retention to physical storage.** Held until 2026-09-29, then
reversed by the owner. It rewrote the whole journal inside every snapshot save,
replayed every step on hydrate, and let one long session exhaust quota before
material could be saved; a stale entry discarded the whole journal silently.

**Whole-journal validation on hydrate.** Rejected: it is proportional to the
journal, blocks the main thread, and proves nothing the engine does not prove
again at use. Only the two stack tops are dry-run.

**Snapshot stacks and opaque browser history.** Still rejected. Redo remains a
first-class inverse stack because a person may reverse an accidental Undo after
reload without asking the model to recreate material. It is a keyboard safety
convention, not part of the visible canvas vocabulary.
