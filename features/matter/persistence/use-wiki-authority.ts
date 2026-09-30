"use client";

import { useEffect } from "react";
import {
  createChunkRecovery,
  type ChunkRecovery,
  type ChunkRecoveryHost,
} from "../interaction/chunk-recovery";

// Chunk recovery for the lazy wiki-runtime-core import in this hook. The
// module-level instance persists across remounts (e.g. Fast Refresh) so a
// recovery signal does not require the component to be mounted again.
// A load failure arms backoff + recovery signals; the authority starts as soon
// as the chunk loads, whether through a timed retry or a recovery signal.
let _authorityStatus: "pending" | "ok" | "failed" = "pending";
let _authorityRecovery: ChunkRecovery = createChunkRecovery(retryAuthorityLoad);

function retryAuthorityLoad(): void {
  void import("./wiki-runtime-core")
    .then(({ startMatterWikiAuthority }) => {
      _authorityStatus = "ok";
      _authorityRecovery.succeeded();
      return startMatterWikiAuthority();
    })
    .catch(() => {
      _authorityStatus = "failed";
      _authorityRecovery.failed();
    });
}

/**
 * Content-free load status for the wiki-runtime-core lazy chunk as seen from
 * the authority hook. Diagnostics and tests only; never user-visible.
 * - `"pending"`: no load attempt has completed yet
 * - `"ok"`: the chunk loaded and the authority started at least once
 * - `"failed"`: the most recent load attempt failed; a retry is armed
 */
export const readWikiAuthorityLoadStatus = (): "pending" | "ok" | "failed" =>
  _authorityStatus;

/**
 * Replaces the module-level chunk recovery with one that uses the given host.
 * For tests only — call before mounting the hook to inject a deterministic host.
 */
export function _setWikiAuthorityRecoveryHost(
  host: ChunkRecoveryHost | null,
): void {
  _authorityRecovery = createChunkRecovery(retryAuthorityLoad, host);
}

/** Hydrates local lexical authority without adding permanent product chrome. */
export function useWikiAuthority() {
  useEffect(() => {
    // If already loaded or in backoff, the recovery manages the next attempt.
    // The first mount triggers the initial load through the shared retry path.
    retryAuthorityLoad();
  }, []);
}
