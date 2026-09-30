import type {
  RepositoryErrorCode,
  RepositoryResult,
} from "./document-repository";
import type { LoadedWiki, WikiRepository } from "./wiki-repository";
import { compileWikiBasis, type WikiBasis } from "../wiki/wiki-basis";
import { WikiBasisOwner } from "../wiki/wiki-basis-owner";
import { wikiStateStorageBytes } from "../wiki/wiki-codec";
import {
  applyWikiObservationBatch,
  applyWikiEvent,
  applyWikiOccurrenceSettlement,
  clearWikiState,
  createEmptyWikiState,
  WIKI_CONFIRMED_ONLY,
  type WikiProjectionPolicy,
} from "../wiki/wiki-evidence";
import {
  MAX_WIKI_STATE_BYTES,
  type WikiEvent,
  type WikiObserveEvidenceEvent,
  type WikiObservationTick,
  type WikiOccurrenceSettlement,
  type WikiState,
  type WikiTransitionResult,
} from "../wiki/wiki-model";
import {
  isWikiAliasEvidenceProducer,
  type WikiAliasEvidenceProducer,
} from "../wiki/wiki-learning-policy";

export type WikiCoordinatorStatus =
  | Readonly<{ phase: "loading" }>
  | Readonly<{ phase: "ready"; generation: number; stateRevision: number }>
  | Readonly<{
      phase: "degraded";
      reason: "corrupt" | "conflict" | "storage" | "compile";
      errorCode: RepositoryErrorCode | "WIKI_COMPILE_FAILED";
    }>;

export type WikiDecision = Exclude<WikiEvent, { type: "observe-evidence" }>;

export type WikiObservationView = Readonly<{
  generation: number;
  stateRevision: number;
}>;

export type WikiCoordinatorResult =
  | Readonly<{ ok: true; changed: boolean; generation: number; stateRevision: number }>
  | Readonly<{
      ok: false;
      code:
        | "NOT_READY"
        | "STALE_VIEW"
        | "INVALID_DECISION"
        | "BOUND_EXCEEDED"
        | "PERSISTENCE_FAILED"
        | "COMPILE_FAILED";
    }>;

export type WikiCoordinator = Readonly<{
  start(): Promise<WikiCoordinatorStatus>;
  retry(): Promise<WikiCoordinatorStatus>;
  readBasis(): WikiBasis;
  readState(): WikiState | null;
  getStatus(): WikiCoordinatorStatus;
  subscribe(listener: () => void): () => void;
  decide(event: WikiDecision, expectedStateRevision?: number): Promise<WikiCoordinatorResult>;
  observe(
    events: readonly WikiObserveEvidenceEvent[],
    tick: WikiObservationTick,
    expectedView?: WikiObservationView,
  ): Promise<WikiCoordinatorResult>;
  /**
   * Records the one settlement of one applied occurrence. Informed acceptance
   * and inspection are soft evidence: they rebase over a concurrent write and
   * pause silently under the byte bound. A person's explicit decision or
   * revert also rebases, because it addresses a rule rather than a view, but
   * reports every failure.
   */
  settle(settlement: WikiOccurrenceSettlement): Promise<WikiCoordinatorResult>;
  clear(expectedStateRevision?: number): Promise<WikiCoordinatorResult>;
  resetCorrupt(): Promise<WikiCoordinatorResult>;
  dispose(): void;
}>;

type WikiBasisPublication = Pick<WikiBasisOwner, "read" | "publishCompiled">;

type ReadyAuthority = {
  state: WikiState;
  writeGeneration: number | null;
};

const MAX_OBSERVATION_REBASE_ATTEMPTS = 4;

/**
 * Applies automatic evidence under the durable byte budget. When a batch would
 * overflow, known relations may still gain support and quiet ledgers may still
 * decay; only rows that would allocate a new durable identity are discarded.
 */
export function applyBoundedWikiObservationBatch(
  state: WikiState,
  events: readonly WikiObserveEvidenceEvent[],
  tick: WikiObservationTick,
  qualifiedAliasProducers: ReadonlySet<WikiAliasEvidenceProducer>,
  maxStateBytes = MAX_WIKI_STATE_BYTES,
): WikiTransitionResult {
  const result = applyWikiObservationBatch(
    state,
    events,
    tick,
    qualifiedAliasProducers,
  );
  if (!result.ok || !result.changed ||
      wikiStateStorageBytes(result.state) <= maxStateBytes) return result;

  const retained = events.filter((event) => observationExists(state, event));
  const fallback = applyWikiObservationBatch(
    state,
    retained,
    tick,
    qualifiedAliasProducers,
  );
  if (!fallback.ok || !fallback.changed ||
      wikiStateStorageBytes(fallback.state) <= maxStateBytes) return fallback;
  return Object.freeze({ ok: true, state, changed: false });
}

/**
 * Serializes hydrate, transition, compile, CAS-save, and basis publication.
 * Material always reads the last valid basis. A failed candidate or temporary
 * store operation degrades configuration only; the last-good authority remains
 * retryable and material never waits for recovery.
 */
export function createWikiCoordinator(
  repository: WikiRepository,
  owner: WikiBasisPublication = new WikiBasisOwner(),
  projectionPolicy: WikiProjectionPolicy = WIKI_CONFIRMED_ONLY,
): WikiCoordinator {
  let status: WikiCoordinatorStatus = Object.freeze({ phase: "loading" });
  let ready: ReadyAuthority | null = null;
  let startPromise: Promise<WikiCoordinatorStatus> | null = null;
  let mutationTail: Promise<unknown> = Promise.resolve();
  let disposed = false;
  const listeners = new Set<() => void>();
  const qualifiedAliasProducers = new Set<WikiAliasEvidenceProducer>(
    projectionPolicy.qualifiedProducerReleases.flatMap((release) =>
      isWikiAliasEvidenceProducer(release.identity.producerId)
        ? [release.identity.producerId]
        : []),
  );

  const publishStatus = (next: WikiCoordinatorStatus) => {
    if (disposed) return;
    status = next;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One presentation observer cannot change authority or reject a write.
      }
    }
  };

  const hydrate = async (): Promise<WikiCoordinatorStatus> => {
    const loaded = await safeLoad(repository);
    if (disposed) return status;
    if (!loaded.ok) {
      const degraded = degradedStatus(loaded.error.code);
      publishStatus(degraded);
      return degraded;
    }
    if (loaded.value === null) {
      if (ready !== null && ready.writeGeneration !== null) {
        const degraded = degradedStatus("PERSISTENCE_CONFLICT");
        publishStatus(degraded);
        return degraded;
      }
      ready = { state: createEmptyWikiState(), writeGeneration: null };
      const next = readyStatus(owner.read());
      publishStatus(next);
      return next;
    }

    const compiled = compileWikiBasis(
      loaded.value.state,
      loaded.value.writeGeneration,
      owner.read(),
      projectionPolicy,
    );
    if (!compiled.ok) {
      const degraded = compileDegradedStatus();
      publishStatus(degraded);
      return degraded;
    }

    const current = owner.read();
    if (compiled.basis.snapshot.generation < current.snapshot.generation) {
      const degraded = degradedStatus("PERSISTENCE_CONFLICT");
      publishStatus(degraded);
      return degraded;
    }
    if (compiled.basis.snapshot.generation > current.snapshot.generation) {
      const published = owner.publishCompiled(compiled.basis);
      if (!published.ok) {
        const degraded = compileDegradedStatus();
        publishStatus(degraded);
        return degraded;
      }
    } else if (compiled.basis.stateRevision !== current.stateRevision) {
      const degraded = degradedStatus("PERSISTENCE_CONFLICT");
      publishStatus(degraded);
      return degraded;
    }

    ready = {
      state: loaded.value.state,
      writeGeneration: loaded.value.writeGeneration,
    };
    const next = readyStatus(owner.read());
    publishStatus(next);
    return next;
  };

  const start = () => {
    startPromise ??= hydrate().catch(() => {
      const degraded = degradedStatus("PERSISTENCE_UNAVAILABLE");
      publishStatus(degraded);
      return degraded;
    });
    return startPromise;
  };

  const enqueueRefresh = (): Promise<WikiCoordinatorStatus> => {
    const operation = mutationTail.then(hydrate, hydrate);
    mutationTail = operation.catch(() => undefined);
    return operation;
  };

  const enqueue = (
    transition: (state: WikiState) => ReturnType<typeof applyWikiEvent>,
    expectedStateRevision?: number,
    rebaseOnConflict = false,
    softBoundAsNoop = false,
    expectedGeneration?: number,
  ): Promise<WikiCoordinatorResult> => {
    const operation = mutationTail.then(async (): Promise<WikiCoordinatorResult> => {
      if (disposed || ready === null) {
        return Object.freeze({ ok: false, code: "NOT_READY" });
      }
      if (
        expectedStateRevision !== undefined &&
        expectedStateRevision !== ready.state.revision
      ) return Object.freeze({ ok: false, code: "STALE_VIEW" });
      if (expectedGeneration !== undefined &&
          expectedGeneration !== (ready.writeGeneration ?? 0)) {
        return Object.freeze({ ok: false, code: "STALE_VIEW" });
      }

      const attemptLimit = rebaseOnConflict ? MAX_OBSERVATION_REBASE_ATTEMPTS : 1;
      for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
        if (ready === null) return Object.freeze({ ok: false, code: "NOT_READY" });
        const authority = ready;
        const result = transition(authority.state);
        if (!result.ok) {
          return Object.freeze({
            ok: false,
            code: result.error.code === "BOUND_EXCEEDED"
              ? "BOUND_EXCEEDED"
              : "INVALID_DECISION",
          });
        }
        if (!result.changed) {
          return Object.freeze({
            ok: true,
            changed: false,
            generation: authority.writeGeneration ?? 0,
            stateRevision: authority.state.revision,
          });
        }

        // Keep a normal capacity limit distinct from corrupt durable storage.
        // The current compiled authority remains healthy when a candidate is too large.
        if (wikiStateStorageBytes(result.state) > MAX_WIKI_STATE_BYTES) {
          // Automatic evidence is disposable. Under byte pressure it pauses
          // without degrading Wiki or blocking later human decisions.
          if (softBoundAsNoop) {
            return Object.freeze({
              ok: true,
              changed: false,
              generation: authority.writeGeneration ?? 0,
              stateRevision: authority.state.revision,
            });
          }
          return Object.freeze({ ok: false, code: "BOUND_EXCEEDED" });
        }

        const nextGeneration = nextWriteGeneration(authority.writeGeneration);
        if (nextGeneration === null) {
          publishStatus(degradedStatus("PERSISTENCE_WRITE_FAILED"));
          return Object.freeze({ ok: false, code: "PERSISTENCE_FAILED" });
        }
        const compiled = compileWikiBasis(
          result.state,
          nextGeneration,
          owner.read(),
          projectionPolicy,
        );
        if (!compiled.ok) {
          publishStatus(compileDegradedStatus());
          return Object.freeze({ ok: false, code: "COMPILE_FAILED" });
        }

        const saved = await safeSave(
          repository,
          result.state,
          authority.writeGeneration,
        );
        if (disposed) return Object.freeze({ ok: false, code: "NOT_READY" });
        if (!saved.ok) {
          if (saved.error.code === "PERSISTENCE_CONFLICT" && rebaseOnConflict) {
            const refreshed = await hydrate();
            if (refreshed.phase === "ready") continue;
          } else if (saved.error.code === "PERSISTENCE_CONFLICT") {
            const refreshed = await hydrate();
            return Object.freeze({
              ok: false,
              code: refreshed.phase === "ready" ? "STALE_VIEW" : "PERSISTENCE_FAILED",
            });
          } else {
            publishStatus(degradedStatus(saved.error.code));
          }
          return Object.freeze({ ok: false, code: "PERSISTENCE_FAILED" });
        }
        if (saved.value !== nextGeneration) {
          publishStatus(degradedStatus("PERSISTENCE_WRITE_FAILED"));
          return Object.freeze({ ok: false, code: "PERSISTENCE_FAILED" });
        }

        const published = owner.publishCompiled(compiled.basis);
        if (!published.ok) {
          publishStatus(compileDegradedStatus());
          return Object.freeze({ ok: false, code: "COMPILE_FAILED" });
        }
        ready = { state: result.state, writeGeneration: saved.value };
        publishStatus(readyStatus(published.basis));
        return Object.freeze({
          ok: true,
          changed: true,
          generation: saved.value,
          stateRevision: result.state.revision,
        });
      }
      return Object.freeze({ ok: false, code: "PERSISTENCE_FAILED" });
    });
    mutationTail = operation.catch(() => undefined);
    return operation.catch(() => Object.freeze({
      ok: false as const,
      code: "PERSISTENCE_FAILED" as const,
    }));
  };

  const enqueueCorruptReset = (): Promise<WikiCoordinatorResult> => {
    const operation = mutationTail.then(async (): Promise<WikiCoordinatorResult> => {
      if (disposed || status.phase !== "degraded" || status.reason !== "corrupt") {
        return Object.freeze({ ok: false, code: "NOT_READY" });
      }
      const reset = await safeResetCorrupt(
        repository,
        owner.read().snapshot.generation,
      );
      if (disposed) return Object.freeze({ ok: false, code: "NOT_READY" });
      if (!reset.ok) {
        publishStatus(degradedStatus(reset.error.code));
        if (reset.error.code === "PERSISTENCE_CONFLICT") await hydrate();
        return Object.freeze({ ok: false, code: "PERSISTENCE_FAILED" });
      }
      const compiled = compileWikiBasis(
        reset.value.state,
        reset.value.writeGeneration,
        owner.read(),
        projectionPolicy,
      );
      if (!compiled.ok) {
        publishStatus(compileDegradedStatus());
        return Object.freeze({ ok: false, code: "COMPILE_FAILED" });
      }
      const published = owner.publishCompiled(compiled.basis);
      if (!published.ok) {
        publishStatus(compileDegradedStatus());
        return Object.freeze({ ok: false, code: "COMPILE_FAILED" });
      }
      ready = {
        state: reset.value.state,
        writeGeneration: reset.value.writeGeneration,
      };
      publishStatus(readyStatus(published.basis));
      return Object.freeze({
        ok: true,
        changed: true,
        generation: reset.value.writeGeneration,
        stateRevision: reset.value.state.revision,
      });
    });
    mutationTail = operation.catch(() => undefined);
    return operation.catch(() => Object.freeze({
      ok: false as const,
      code: "PERSISTENCE_FAILED" as const,
    }));
  };

  return Object.freeze({
    start,
    async retry() {
      await start();
      return enqueueRefresh();
    },
    readBasis: () => owner.read(),
    readState: () => ready?.state ?? null,
    getStatus: () => status,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    decide: (event, expectedStateRevision) => enqueue(
      (state) => applyWikiEvent(state, event),
      expectedStateRevision,
    ),
    async observe(events, tick, expectedView) {
      await start();
      return enqueue(
        (state) => applyBoundedWikiObservationBatch(
          state,
          events,
          tick,
          qualifiedAliasProducers,
        ),
        expectedView?.stateRevision,
        false,
        true,
        expectedView?.generation,
      );
    },
    async settle(settlement) {
      await start();
      const soft = settlement.outcome === "accepted-implicit" ||
        settlement.outcome === "inspected-kept" ||
        settlement.outcome === "censored";
      return enqueue(
        (state) => applyWikiOccurrenceSettlement(state, settlement, qualifiedAliasProducers),
        undefined,
        true,
        soft,
      );
    },
    clear: (expectedStateRevision) => enqueue(clearWikiState, expectedStateRevision),
    resetCorrupt: enqueueCorruptReset,
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      repository.close();
    },
  });
}

function observationExists(
  state: WikiState,
  event: WikiObserveEvidenceEvent,
): boolean {
  if (event.source === "recent-material") {
    return state.termEvidence.some((entry) =>
      entry.locale === event.locale &&
      entry.canonical === event.canonical);
  }
  const lexeme = state.lexemes.find((entry) =>
    entry.locale === event.locale && entry.canonical === event.canonical);
  return lexeme !== undefined && state.aliasEvidence.some((entry) =>
    entry.lexemeId === lexeme.id &&
    entry.channel === event.channel &&
    entry.boundary === event.boundary &&
    entry.form === event.form);
}

async function safeLoad(
  repository: WikiRepository,
): Promise<RepositoryResult<LoadedWiki | null>> {
  try {
    return await repository.load();
  } catch {
    return failure("PERSISTENCE_UNAVAILABLE", "Wiki storage is unavailable.");
  }
}

async function safeSave(
  repository: WikiRepository,
  state: WikiState,
  expectedGeneration: number | null,
): Promise<RepositoryResult<number>> {
  try {
    return await repository.save(state, expectedGeneration);
  } catch {
    return failure("PERSISTENCE_WRITE_FAILED", "Wiki could not be saved locally.");
  }
}

async function safeResetCorrupt(
  repository: WikiRepository,
  minimumGeneration: number,
): Promise<RepositoryResult<LoadedWiki>> {
  try {
    return await repository.resetCorrupt(minimumGeneration);
  } catch {
    return failure("PERSISTENCE_WRITE_FAILED", "Wiki recovery could not be saved locally.");
  }
}

function nextWriteGeneration(current: number | null): number | null {
  if (current === Number.MAX_SAFE_INTEGER) return null;
  return (current ?? 0) + 1;
}

function readyStatus(basis: WikiBasis): WikiCoordinatorStatus {
  return Object.freeze({
    phase: "ready",
    generation: basis.snapshot.generation,
    stateRevision: basis.stateRevision,
  });
}

function degradedStatus(code: RepositoryErrorCode): WikiCoordinatorStatus {
  return Object.freeze({
    phase: "degraded",
    reason: code === "PERSISTENCE_CORRUPT"
      ? "corrupt"
      : code === "PERSISTENCE_CONFLICT"
        ? "conflict"
        : "storage",
    errorCode: code,
  });
}

function compileDegradedStatus(): WikiCoordinatorStatus {
  return Object.freeze({
    phase: "degraded",
    reason: "compile",
    errorCode: "WIKI_COMPILE_FAILED",
  });
}

function failure(
  code: RepositoryErrorCode,
  message: string,
): RepositoryResult<never> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}
