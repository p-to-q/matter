import type { WikiAdmissionTurn } from "../wiki/wiki-admission";
import type { WikiOccurrenceOutcome } from "../wiki/wiki-learning-policy";
import {
  createChunkRecovery,
  type ChunkRecovery,
  type ChunkRecoveryHost,
} from "../interaction/chunk-recovery";
import {
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
} from "./wiki-capability-preferences-reader";
import {
  claimMatterWikiPublication,
  mintMatterWikiOccurrence,
  renewMatterWikiOccurrence,
  takeMatterWikiOccurrence,
} from "./wiki-occurrence-owner";
import { matterWikiBasisPublication } from "./wiki-runtime-publication";

export { matterWikiBasisPublication };

export const readMatterWikiBasis = matterWikiBasisPublication.read;
/** Null until the lazy runtime binds it, which happens before any rule is published. */
export const readMatterWikiInterpreter = matterWikiBasisPublication.readInterpreter;

export {
  claimMatterWikiPublication,
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
  mintMatterWikiOccurrence,
  renewMatterWikiOccurrence,
};

// Chunk recovery for the lazy wiki-runtime-core import. One instance is shared
// between observeMatterWikiEvidence and settleMatterWikiOccurrence since they
// import the same chunk. A load failure arms backoff + recovery signals; a
// subsequent recovery attempt warms the chunk so the next caller proceeds.
let _coreStatus: "pending" | "ok" | "failed" = "pending";
let _coreRecovery: ChunkRecovery = createChunkRecovery(retryCoreLoad);

function retryCoreLoad(): void {
  void import("./wiki-runtime-core").then(
    () => { _coreStatus = "ok"; _coreRecovery.succeeded(); },
    () => { _coreStatus = "failed"; _coreRecovery.failed(); },
  );
}

/**
 * Content-free load status for the wiki-runtime-core lazy chunk.
 * Diagnostics and tests only; never user-visible.
 * - `"pending"`: no load attempt has completed yet
 * - `"ok"`: the chunk loaded successfully at least once
 * - `"failed"`: the most recent load attempt failed; a retry is armed
 */
export const readWikiRuntimeCoreLoadStatus = (): "pending" | "ok" | "failed" =>
  _coreStatus;

/**
 * Replaces the module-level chunk recovery with one that uses the given host.
 * For tests only — call before the first observeMatterWikiEvidence or
 * settleMatterWikiOccurrence invocation to inject a deterministic host.
 */
export function _setWikiRuntimeCoreRecoveryHost(
  host: ChunkRecoveryHost | null,
): void {
  _coreRecovery = createChunkRecovery(retryCoreLoad, host);
}

/** A successful human turn may wake the local runtime, but never waits for it. */
export function observeMatterWikiEvidence(
  request: WikiAdmissionTurn,
): void {
  if (!isMatterWikiAutomaticCollectionEnabled() &&
      !isMatterWikiPhoneticFittingEnabled()) return;
  // During a backoff window, skip the load attempt rather than hammering a
  // module that just failed. The recovery arms its own timed retry and listens
  // for online/visible signals; the next eligible call proceeds.
  if (!_coreRecovery.mayAttempt()) return;
  void import("./wiki-runtime-core")
    .then(({ observeMatterWikiCommittedMaterial: observe }) => {
      _coreStatus = "ok";
      _coreRecovery.succeeded();
      observe(request);
    })
    .catch(() => {
      // A failed load arms backoff + recovery signals. The admission that
      // triggered this turn is lost (degraded behaviour: identity basis for
      // that turn). The receipt code is readable via readWikiRuntimeCoreLoadStatus.
      _coreStatus = "failed";
      _coreRecovery.failed();
    });
}

/**
 * Content-free outcome of one settlement request. `unattributed` means the id
 * was unknown, expired, or already settled; `neutral` means nothing was
 * written because the outcome carries no evidence.
 */
export type MatterWikiOccurrenceSettleStatus =
  | "unattributed"
  | "neutral"
  | "recorded"
  | "unchanged"
  | "failed";

/**
 * Settles one applied occurrence exactly once. The attribution is consumed
 * before any write, so a repeated or late signal for the same id is inert. A
 * censored occurrence releases its memory without waking durable storage.
 * If the lazy wiki-runtime-core chunk fails to load, the settlement returns
 * "failed" and a retry is armed; the attribution is already consumed and cannot
 * be re-applied (documented degraded behaviour). The receipt code is readable
 * via readWikiRuntimeCoreLoadStatus.
 */
export async function settleMatterWikiOccurrence(
  occurrenceId: string,
  outcome: Exclude<WikiOccurrenceOutcome, "explicit-replace">,
): Promise<MatterWikiOccurrenceSettleStatus> {
  const attribution = takeMatterWikiOccurrence(occurrenceId);
  if (attribution === null) return "unattributed";
  if (outcome === "censored") return "neutral";
  let coreModule: typeof import("./wiki-runtime-core") | null = null;
  try {
    coreModule = await import("./wiki-runtime-core");
    _coreStatus = "ok";
    _coreRecovery.succeeded();
  } catch {
    // Load failure: arm backoff + recovery signals so subsequent calls may
    // succeed. The attribution was already consumed; return "failed" now.
    _coreStatus = "failed";
    _coreRecovery.failed();
    return "failed";
  }
  try {
    const result = await coreModule.settleHydratedMatterWikiOccurrence(Object.freeze({
      occurrenceId,
      outcome,
      rule: attribution.rule,
      origin: attribution.origin,
    }));
    return result.ok ? result.changed ? "recorded" : "unchanged" : "failed";
  } catch {
    return "failed";
  }
}
