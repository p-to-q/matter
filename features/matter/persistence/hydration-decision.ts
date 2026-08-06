import type { ThoughtTree } from "../tree/model";

export type HydrationDecision =
  | { action: "hydrate"; tree: ThoughtTree }
  | { action: "publish"; tree: ThoughtTree }
  | { action: "none" };

/**
 * The load-window reconciliation rule. The stored tree is the person's last
 * committed material, so it wins whenever it is at least as new as the live
 * fixture-derived tree: a mid-load edit built on the fixture base must never
 * CAS-overwrite a prior session. Only a live tree strictly newer than the
 * stored one is published.
 */
export function resolveHydrationDecision(
  initialTree: ThoughtTree,
  latestTree: ThoughtTree,
  storedTree: ThoughtTree | null,
): HydrationDecision {
  if (latestTree.id !== initialTree.id) return { action: "none" };
  if (storedTree === null) return { action: "publish", tree: latestTree };
  if (latestTree.revision <= storedTree.revision) return { action: "hydrate", tree: storedTree };
  return { action: "publish", tree: latestTree };
}
