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
  WIKI_CONFIRMED_ONLY,
  WIKI_WITH_PROVISIONAL,
} from "../wiki/wiki-evidence";
import type {
  WikiObserveEvidenceEvent,
  WikiState,
} from "../wiki/wiki-model";
import {
  matterWikiBasisPublication,
  matterWikiFittingMode,
} from "./wiki-runtime-publication";

export const matterWikiProjectionPolicy = matterWikiFittingMode === "latin-conservative"
  ? WIKI_WITH_PROVISIONAL
  : WIKI_CONFIRMED_ONLY;

type MatterWikiRuntime = Readonly<{
  coordinator: ReturnType<typeof createWikiCoordinator>;
  generationChannel: ReturnType<typeof createWikiGenerationChannel>;
}>;

const RUNTIME_KEY = Symbol.for("ptoq.matter.wiki-runtime.v6");
const runtimeHost = globalThis as unknown as {
  [key: symbol]: MatterWikiRuntime | undefined;
};

/** One origin-local authority survives client Fast Refresh as one ownership unit. */
function createMatterWikiRuntime(): MatterWikiRuntime {
  const coordinator = createWikiCoordinator(
    createIndexedDbWikiRepository(),
    matterWikiBasisPublication,
    matterWikiProjectionPolicy,
  );
  const generationChannel = createWikiGenerationChannel();
  const refreshQueue = createWikiGenerationRefreshQueue(
    () => coordinator.readBasis().snapshot.generation,
    () => coordinator.retry(),
  );
  void generationChannel.subscribe((generation) => {
    void refreshQueue.request(generation);
  });
  return Object.freeze({ coordinator, generationChannel });
}

const runtime = runtimeHost[RUNTIME_KEY] ?? createMatterWikiRuntime();
runtimeHost[RUNTIME_KEY] = runtime;
const matterWikiCoordinator = runtime.coordinator;

/** Stable synchronous reader used by material commit closures. */
export const readMatterWikiBasis = matterWikiCoordinator.readBasis;

/** Lifecycle capability used by composition without exposing mutation methods. */
export const startMatterWikiAuthority = matterWikiCoordinator.start;

/** Background evidence is best-effort and never participates in material commit. */
export function observeMatterWikiEvidence(
  events: readonly WikiObserveEvidenceEvent[],
): void {
  void publishChanged(matterWikiCoordinator.observe(events));
}

export const subscribeMatterWikiAuthority = matterWikiCoordinator.subscribe;
export const readMatterWikiState = (): WikiState | null => matterWikiCoordinator.readState();
export const getMatterWikiStatus = (): WikiCoordinatorStatus => matterWikiCoordinator.getStatus();
export const retryMatterWikiAuthority = (): Promise<WikiCoordinatorStatus> =>
  matterWikiCoordinator.retry();

export function decideMatterWiki(
  event: WikiDecision,
  expectedStateRevision: number,
): Promise<WikiCoordinatorResult> {
  return publishChanged(matterWikiCoordinator.decide(event, expectedStateRevision));
}

export function resetCorruptMatterWiki(): Promise<WikiCoordinatorResult> {
  return publishChanged(matterWikiCoordinator.resetCorrupt());
}

async function publishChanged(
  operation: Promise<WikiCoordinatorResult>,
): Promise<WikiCoordinatorResult> {
  const result = await operation;
  if (result.ok && result.changed) runtime.generationChannel.publish(result.generation);
  return result;
}
