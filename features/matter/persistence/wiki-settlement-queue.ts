import type { WikiOccurrenceSettlement } from "../wiki/wiki-model";
import { sameWikiOccurrenceForm } from "../wiki/wiki-occurrence-registry";
import { revokeMatterWikiOccurrences } from "./wiki-occurrence-owner";
import type { WikiCoordinatorResult } from "./wiki-coordinator";

/** Serial settlement is separate from the admission queue and holds no text. */
export function createWikiSettlementQueue(host: Readonly<{
  settle: (value: WikiOccurrenceSettlement) => Promise<WikiCoordinatorResult>;
  readBasis: () => Readonly<{ snapshot: { generation: number }; stateRevision: number }>;
  cutoff: () => number;
}>) {
  let tail: Promise<unknown> = Promise.resolve();
  const pending = new Set<{ settlement: WikiOccurrenceSettlement; revoked: boolean }>();
  const passive = (value: WikiOccurrenceSettlement) =>
    value.outcome === "accepted-implicit" || value.outcome === "inspected-kept";
  return Object.freeze({
    revokeBefore(revision: number) {
      for (const queued of pending) {
        if (passive(queued.settlement) && queued.settlement.rule.appliedAtRevision < revision) queued.revoked = true;
      }
    },
    settle(settlement: WikiOccurrenceSettlement): Promise<WikiCoordinatorResult> {
      const entry = { settlement, revoked: passive(settlement) && settlement.rule.appliedAtRevision < host.cutoff() };
      pending.add(entry);
      const operation = tail.then(async (): Promise<WikiCoordinatorResult> => {
        if (entry.revoked) {
          const basis = host.readBasis();
          return { ok: true, changed: false, generation: basis.snapshot.generation, stateRevision: basis.stateRevision };
        }
        const result = await host.settle(settlement);
        if (result.ok && result.changed && settlement.outcome === "reverted") {
          revokeMatterWikiOccurrences(settlement.rule, result.stateRevision);
          for (const queued of pending) {
            if (passive(queued.settlement) && sameWikiOccurrenceForm(queued.settlement.rule, settlement.rule) &&
              queued.settlement.rule.appliedAtRevision < result.stateRevision) queued.revoked = true;
          }
        }
        return result;
      }).finally(() => pending.delete(entry));
      tail = operation.catch(() => undefined);
      return operation;
    },
  });
}
Object.defineProperty(createWikiSettlementQueue, "matterCapability", { value: "matter-capability:wiki-settlement-queue" });
