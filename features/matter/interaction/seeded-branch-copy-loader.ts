/**
 * Lazy loader for the seeded-branch-copy interaction copy chunk.
 *
 * The synchronous five-locale floor (seededFallbackBranchTexts) stays in place
 * until the richer chunk loads. A failed load is not silent: the receipt code
 * is readable and the backoff + recovery signals try again. Timers and listeners
 * exist only while at least one subscriber is waiting.
 */

import {
  createChunkRecovery,
  type ChunkRecovery,
} from "./chunk-recovery";
import type { SeededBranchTextResolver } from "../material/seeded-material-core";

let _status: "pending" | "ok" | "failed" = "pending";
// Set of active setter callbacks; one per mounted consumer (e.g. MatterApp).
// A backoff retry reaches every subscriber simultaneously.
const _setters = new Set<(resolver: SeededBranchTextResolver) => void>();
const _recovery: ChunkRecovery = createChunkRecovery(loadChunk);

function loadChunk(): void {
  void import("../material/seeded-branch-copy").then(
    ({ seededBranchTexts }) => {
      _status = "ok";
      _recovery.succeeded();
      for (const set of _setters) set(seededBranchTexts);
    },
    () => {
      _status = "failed";
      // Only arm retry while someone still waits; release automatically
      // clears timers and listeners when the last subscriber leaves.
      if (_setters.size > 0) _recovery.failed();
    },
  );
}

/**
 * Content-free load status for the seeded-branch-copy lazy chunk.
 * Diagnostics and tests only; never user-visible.
 * - `"pending"`: no load attempt has completed yet
 * - `"ok"`: the chunk loaded successfully at least once
 * - `"failed"`: the most recent load attempt failed; a retry is armed
 */
export const readSeededBranchCopyLoadStatus = (): "pending" | "ok" | "failed" =>
  _status;

/**
 * Registers a setter that will receive the richer resolver when the chunk
 * loads. Returns a cleanup function that removes the setter and releases
 * timers/listeners when no subscriber remains.
 *
 * - If the chunk already loaded, the setter is called asynchronously via the
 *   cached import (one microtask delay).
 * - If no load is in progress and the recovery allows it, one load attempt
 *   starts immediately.
 * - On failure, the module-level recovery schedules retries; every subscriber
 *   receives the resolver once any attempt succeeds.
 */
export function subscribeSeededBranchCopyResolver(
  set: (resolver: SeededBranchTextResolver) => void,
): () => void {
  _setters.add(set);
  if (_status === "ok") {
    // Deliver from the cached import (no network round-trip).
    void import("../material/seeded-branch-copy").then(
      ({ seededBranchTexts }) => { if (_setters.has(set)) set(seededBranchTexts); },
      () => undefined,
    );
  } else if (_recovery.mayAttempt()) {
    loadChunk();
  }
  return () => {
    _setters.delete(set);
    // Timers and listeners exist only while someone waits.
    if (_setters.size === 0) _recovery.release();
  };
}
