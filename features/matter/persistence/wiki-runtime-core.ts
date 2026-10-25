import type {
  WikiCoordinatorResult,
  WikiCoordinatorStatus,
  WikiDecision,
} from "./wiki-coordinator";
import { createWikiCoordinator } from "./wiki-coordinator";
import {
  createWikiGenerationChannel,
  createWikiGenerationRefreshQueue,
} from "./wiki-generation-channel";
import { createIndexedDbWikiRepository } from "./wiki-repository";
import {
  createWikiProjectionPolicy,
} from "../wiki/wiki-evidence";
import {
  MATTER_WIKI_RUNTIME_ALIAS_PRODUCERS,
  MATTER_WIKI_RUNTIME_PRODUCER_RELEASES,
  MATTER_WIKI_RUNTIME_TERM_PRODUCERS,
} from
  "../wiki/wiki-runtime-producer-releases";
import type { WikiOccurrenceSettlement, WikiState } from "../wiki/wiki-model";
import {
  planWikiAdmissionBatch,
  type WikiAdmissionTurn,
} from "../wiki/wiki-admission";
import { collectCommittedWikiTermsResult } from "../wiki/wiki-term-collection";
import { fitCommittedWikiTextResult } from "../wiki/wiki-fitting";
import {
  createWikiAdmissionQueue,
  type WikiAdmissionQueue,
  type WikiAdmissionQueueReceipt,
} from "./wiki-admission-queue";
import type {
  WikiAliasEvidenceProducer,
  WikiTermEvidenceProducer,
} from "../wiki/wiki-learning-policy";
import { matterWikiBasisPublication } from "./wiki-runtime-publication";
import {
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
} from "./wiki-capability-preferences-reader";
import { canonicalizeWikiText } from "../wiki/canonicalize-wiki-text";
import { deriveWikiDiagnostics } from "../wiki/wiki-diagnostics";
import { readMatterWikiTransientOutcomes, revokeMatterWikiOccurrences,
  revokeMatterWikiPassiveBefore } from "./wiki-occurrence-owner";
import { sameWikiOccurrenceForm } from "../wiki/wiki-occurrence-registry";

// The release table and its learning policy load with this lazy runtime; the
// initial material graph never reads them.
const matterWikiFittingMode =
  MATTER_WIKI_RUNTIME_ALIAS_PRODUCERS.includes("latin-internal-edit-v2")
    ? "latin-conservative" as const
    : "off" as const;

export const matterWikiProjectionPolicy = createWikiProjectionPolicy(
  matterWikiFittingMode === "latin-conservative"
    ? MATTER_WIKI_RUNTIME_PRODUCER_RELEASES
    : Object.freeze([]),
);

type MatterWikiRuntime = Readonly<{
  coordinator: ReturnType<typeof createWikiCoordinator>;
  generationChannel: ReturnType<typeof createWikiGenerationChannel>;
  start(): Promise<WikiCoordinatorStatus>;
  retry(): Promise<WikiCoordinatorStatus>;
  announceGeneration(generation: number): void;
  admissions: WikiAdmissionQueue;
  dispose(): void;
}>;

type MatterWikiRuntimeSlot = Readonly<{
  abi: 16;
  runtime: MatterWikiRuntime;
}>;

// 16: V8 lexical state and diagnostics use one fresh coordinator ownership unit.
const RUNTIME_ABI = 16 as const;
const MAX_ADMISSION_CAS_ATTEMPTS = 4;
const RUNTIME_KEY = Symbol.for("ptoq.matter.wiki-runtime");
const LEGACY_RUNTIME_KEYS = Object.freeze([
  Symbol.for("ptoq.matter.wiki-runtime.v7"),
  Symbol.for("ptoq.matter.wiki-runtime.v8"),
]);
const runtimeHost = globalThis as unknown as {
  [key: symbol]: MatterWikiRuntimeSlot | MatterWikiRuntime | undefined;
};

/** One origin-local authority survives client Fast Refresh as one ownership unit. */
function createMatterWikiRuntime(): MatterWikiRuntime {
  // The only publishing port is bound to the canonicalizer, so the material
  // lexical adapter can interpret every rule this runtime ever publishes.
  const coordinator = createWikiCoordinator(
    createIndexedDbWikiRepository(),
    matterWikiBasisPublication.bindInterpreter(canonicalizeWikiText),
    matterWikiProjectionPolicy,
  );
  const generationChannel = createWikiGenerationChannel();
  const admissions = createWikiAdmissionQueue();
  let announcedGeneration = coordinator.readBasis().snapshot.generation;
  const announceGeneration = (generation: number) => {
    if (!Number.isSafeInteger(generation) || generation < 1 ||
        generation <= announcedGeneration) return;
    announcedGeneration = generation;
    try {
      generationChannel.publish(generation);
    } catch {
      // Cross-tab invalidation is advisory and cannot fail a durable operation.
    }
  };
  const announceStatus = (status: WikiCoordinatorStatus): WikiCoordinatorStatus => {
    if (status.phase === "ready") announceGeneration(status.generation);
    return status;
  };
  const start = async () => announceStatus(await coordinator.start());
  const retry = async () => announceStatus(await coordinator.retry());
  const refreshQueue = createWikiGenerationRefreshQueue(
    () => coordinator.readBasis().snapshot.generation,
    retry,
  );
  const unsubscribe = generationChannel.subscribe((generation) => {
    const before = coordinator.readBasis();
    if (Number.isSafeInteger(generation) && generation > before.snapshot.generation) {
      revokePassiveSettlementsBefore(before.stateRevision + 1);
    }
    void refreshQueue.request(generation).then(() => {
      const after = coordinator.readBasis();
      if (after.snapshot.generation > before.snapshot.generation) {
        revokePassiveSettlementsBefore(after.stateRevision);
      }
    });
  });
  return Object.freeze({
    coordinator,
    generationChannel,
    start,
    retry,
    announceGeneration,
    admissions,
    dispose() {
      admissions.dispose();
      unsubscribe();
      generationChannel.close();
      coordinator.dispose();
    },
  });
}

for (const legacyRuntimeKey of LEGACY_RUNTIME_KEYS) {
  const legacyRuntime = runtimeHost[legacyRuntimeKey] as MatterWikiRuntime | undefined;
  if (legacyRuntime === undefined) continue;
  legacyRuntime.generationChannel.close();
  legacyRuntime.coordinator.dispose();
  delete runtimeHost[legacyRuntimeKey];
}
const previousSlot = runtimeHost[RUNTIME_KEY] as MatterWikiRuntimeSlot | undefined;
if (previousSlot !== undefined && previousSlot.abi !== RUNTIME_ABI) {
  previousSlot.runtime.dispose();
}
const runtimeSlot: MatterWikiRuntimeSlot = previousSlot?.abi === RUNTIME_ABI
  ? previousSlot
  : Object.freeze({ abi: RUNTIME_ABI, runtime: createMatterWikiRuntime() });
runtimeHost[RUNTIME_KEY] = runtimeSlot;
const runtime = runtimeSlot.runtime;
const matterWikiCoordinator = runtime.coordinator;
let diagnosticState: WikiState | null = null;
let diagnosticTransient = readMatterWikiTransientOutcomes();
let diagnostics = deriveWikiDiagnostics(diagnosticState, diagnosticTransient);

export function readMatterWikiDiagnostics(): ReturnType<typeof deriveWikiDiagnostics> {
  const state = matterWikiCoordinator.readState();
  const transient = readMatterWikiTransientOutcomes();
  if (state !== diagnosticState || transient !== diagnosticTransient) {
    diagnosticState = state;
    diagnosticTransient = transient;
    diagnostics = deriveWikiDiagnostics(state, transient);
  }
  return diagnostics;
}
const qualifiedAliasProducers = new Set<WikiAliasEvidenceProducer>(
  MATTER_WIKI_RUNTIME_ALIAS_PRODUCERS,
);
const qualifiedTermProducers = new Set<WikiTermEvidenceProducer>(
  MATTER_WIKI_RUNTIME_TERM_PRODUCERS,
);

/** Stable synchronous reader used by material commit closures. */
export const readMatterWikiBasis = matterWikiCoordinator.readBasis;

/** Lifecycle capability used by composition without exposing mutation methods. */
export const startMatterWikiAuthority = runtime.start;

/** Runs local producers only after the lazy Wiki runtime owns the current basis.
 * The bounded queue may drop an old waiting turn; material never waits. */
export function observeMatterWikiCommittedMaterial(
  request: WikiAdmissionTurn,
): void {
  runtime.admissions.enqueue(request, learnFromAdmission);
}

/** Content-free counts for the background admission queue. */
export const readMatterWikiAdmissionReceipt = (): WikiAdmissionQueueReceipt =>
  runtime.admissions.readReceipt();

async function learnFromAdmission(request: WikiAdmissionTurn): Promise<void> {
  const status = await runtime.start();
  if (status.phase !== "ready") return;
  await observeHydratedMatterWikiCommittedMaterial(request);
}

async function observeHydratedMatterWikiCommittedMaterial(
  request: WikiAdmissionTurn,
): Promise<void> {
  if (request.observed.locale !== request.committed.locale ||
      request.observed.channel !== request.committed.channel) return;
  for (let attempt = 0; attempt < MAX_ADMISSION_CAS_ATTEMPTS; attempt += 1) {
    const permissions = Object.freeze({
      automaticCollection: isMatterWikiAutomaticCollectionEnabled(),
      phoneticFitting: isMatterWikiPhoneticFittingEnabled(),
    });
    if (!permissions.automaticCollection && !permissions.phoneticFitting) return;
    const basis = readMatterWikiBasis();
    const batch = planWikiAdmissionBatch(
      request,
      permissions.automaticCollection
        ? collectCommittedWikiTermsResult(request.committed, qualifiedTermProducers)
        : null,
      permissions.phoneticFitting
        ? fitCommittedWikiTextResult(
            basis.fitSnapshot,
            request.observed,
            qualifiedAliasProducers,
          )
        : null,
    );
    const result = await publishChanged(matterWikiCoordinator.observe(
      batch.events,
      batch.tick,
      Object.freeze({
        generation: basis.snapshot.generation,
        stateRevision: basis.stateRevision,
      }),
    ));
    if (result.ok || result.code !== "STALE_VIEW") return;
  }
}

export const subscribeMatterWikiAuthority = matterWikiCoordinator.subscribe;
export const readMatterWikiState = (): WikiState | null => matterWikiCoordinator.readState();
export const getMatterWikiStatus = (): WikiCoordinatorStatus => matterWikiCoordinator.getStatus();
export const retryMatterWikiAuthority = (): Promise<WikiCoordinatorStatus> =>
  runtime.retry();

export function decideMatterWiki(
  event: WikiDecision,
  expectedStateRevision: number,
): Promise<WikiCoordinatorResult> {
  return publishChanged(matterWikiCoordinator.decide(event, expectedStateRevision));
}

/** Records one occurrence settlement against the hydrated origin authority. */
let settlementTail: Promise<unknown> = Promise.resolve();
const pendingSettlements = new Set<{ settlement: WikiOccurrenceSettlement; revoked: boolean }>();

function revokePassiveSettlementsBefore(revision: number): void {
  revokeMatterWikiPassiveBefore(revision);
  for (const queued of pendingSettlements) {
    if ((queued.settlement.outcome === "accepted-implicit" || queued.settlement.outcome === "inspected-kept") &&
        queued.settlement.rule.appliedAtRevision < revision) queued.revoked = true;
  }
}

export function settleHydratedMatterWikiOccurrence(
  settlement: WikiOccurrenceSettlement,
): Promise<WikiCoordinatorResult> {
  if (pendingSettlements.size >= 128) return Promise.resolve({ ok: false, code: "BOUND_EXCEEDED" });
  const pending = { settlement, revoked: false };
  pendingSettlements.add(pending);
  const operation = settlementTail.then(async (): Promise<WikiCoordinatorResult> => {
    if (pending.revoked) {
      const basis = matterWikiCoordinator.readBasis();
      return { ok: true, changed: false, generation: basis.snapshot.generation,
        stateRevision: basis.stateRevision };
    }
    const result = await publishChanged(matterWikiCoordinator.settle(settlement));
    // The transient tokens cannot outlive this page. Revoke only after the
    // negative evidence committed, including tokens waiting behind this write.
    if (result.ok && result.changed && settlement.outcome === "reverted") {
      revokeMatterWikiOccurrences(settlement.rule, result.stateRevision);
      for (const queued of pendingSettlements) {
        if ((queued.settlement.outcome === "accepted-implicit" ||
            queued.settlement.outcome === "inspected-kept") &&
            sameWikiOccurrenceForm(queued.settlement.rule, settlement.rule) &&
            queued.settlement.rule.appliedAtRevision < result.stateRevision) queued.revoked = true;
      }
    }
    return result;
  }).finally(() => pendingSettlements.delete(pending));
  settlementTail = operation.catch(() => undefined);
  return operation;
}

export function resetCorruptMatterWiki(): Promise<WikiCoordinatorResult> {
  return publishChanged(matterWikiCoordinator.resetCorrupt());
}

async function publishChanged(
  operation: Promise<WikiCoordinatorResult>,
): Promise<WikiCoordinatorResult> {
  const result = await operation;
  if (result.ok) runtime.announceGeneration(result.generation);
  return result;
}
