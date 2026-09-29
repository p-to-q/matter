"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  advancePresence,
  advanceSettledStatus,
  createTimedStore,
  emptySettledStatus,
  PRESENCE_TIMING,
  projectPresence,
  projectSettledStatus,
  settledStatusDeadline,
  syncPresence,
  syncSettledStatus,
  type PresenceClose,
  type PresenceFrame,
  type PresenceLive,
  type PresencePolicy,
  type PresenceState,
  type SettledStatus,
  type SettledStatusInput,
} from "./presence";

/**
 * Binds one transient surface to the presence rules. The caller stays mounted
 * across the close and renders the returned frame; while the frame is not
 * `present` it must render the frozen view without handlers.
 */
export function usePresence<T>(live: PresenceLive<T>, close: PresenceClose): PresenceFrame<T> {
  const [store] = useState(() => createTimedStore<PresenceState<T>>(null, {
    deadline: (state) => state?.deadlineMs ?? null,
    advance: (state, nowMs) => advancePresence(state, nowMs, presencePolicy()),
    // Fresh live content renders from props; only a stage or identity change
    // needs another render.
    notifies: (previous, next) =>
      previous?.identity !== next?.identity || previous?.stage !== next?.stage,
  }));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useLayoutEffect(() => {
    store.update((current, nowMs) => syncPresence(current, live, close, nowMs, presencePolicy()));
  }, [close, live, store]);
  useEffect(() => {
    store.attach();
    return () => store.detach();
  }, [store]);
  return projectPresence(state, live, close);
}

/**
 * Settles one status label inside a surface. While `frozen` the shown label
 * never changes, so an exiting live region is never rewritten.
 */
export function useSettledStatus<K>(
  input: SettledStatusInput<K>,
  frozen: boolean,
): K | null {
  const [store] = useState(() => createTimedStore<SettledStatus<K>>(emptySettledStatus<K>(), {
    deadline: (state) => settledStatusDeadline(state),
    advance: (state, nowMs) => advanceSettledStatus(state, nowMs),
    notifies: (previous, next) => previous.shown !== next.shown || previous.scope !== next.scope,
  }));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const { lingers, scope, urgent, value } = input;
  useLayoutEffect(() => {
    if (frozen) {
      store.detach();
      return;
    }
    store.attach();
    store.update((current, nowMs) =>
      syncSettledStatus(current, { scope, value, urgent, lingers }, nowMs));
  }, [frozen, lingers, scope, store, urgent, value]);
  useEffect(() => () => store.detach(), [store]);
  return frozen ? state.shown : projectSettledStatus(state, { scope, value, urgent, lingers });
}

function presencePolicy(): PresencePolicy {
  return Object.freeze({
    minVisibleMs: PRESENCE_TIMING.minVisibleMs,
    // Reduced motion removes the fade, never the hold.
    exitMs: prefersReducedMotion() ? 0 : PRESENCE_TIMING.exitMs,
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
