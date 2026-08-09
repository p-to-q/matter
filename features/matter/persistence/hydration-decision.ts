import type { ThoughtTree } from "../tree/model";

export type HydrationDecision =
  | { action: "hydrate"; tree: ThoughtTree }
  | { action: "publish"; tree: ThoughtTree }
  | { action: "conflict"; tree: ThoughtTree }
  | { action: "none" };

/**
 * The load-window reconciliation rule.
 *
 * Between mount and the first IndexedDB read, the runtime holds a tree derived
 * from the seeded document while the person's last session is still on disk. If
 * they commit anything in that window, two versions of their material exist and
 * neither is a descendant of the other.
 *
 * A revision cannot arbitrate that. It is monotonic only inside one lineage —
 * not a content hash, not a clock — so the previous rule could lose material
 * both ways: a stored r6 and a live r6 built on the seed are different material
 * at the same number, and hydrating discarded the sentence just spoken; a live
 * r7 published over a stored r6 discarded the whole prior session. Both were
 * silent.
 *
 * So divergence decides, and divergence is answered by identity rather than by
 * arithmetic: the runtime freezes state on every commit, so an untouched load
 * window is the same object it started with. Anything else is treated as
 * diverged, including the rare case where a new object carries identical
 * content — refusing to guess costs one explicit gesture, and guessing wrong
 * costs a session.
 *
 * A conflict is not resolved here. It is handed to the person through the same
 * state a second tab already raises, which is the same situation: two versions
 * exist and only they know which one they meant.
 */
export function resolveHydrationDecision(
  initialTree: ThoughtTree,
  latestTree: ThoughtTree,
  storedTree: ThoughtTree | null,
): HydrationDecision {
  if (latestTree.id !== initialTree.id) return { action: "none" };
  if (storedTree === null) return { action: "publish", tree: latestTree };
  if (latestTree === initialTree) return { action: "hydrate", tree: storedTree };
  return { action: "conflict", tree: latestTree };
}
