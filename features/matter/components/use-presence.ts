"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  advancePresence,
  advanceSettledStatus,
  createTimedStore,
  emptySettledStatus,
  markPresencePainted,
  presenceAwaitsPaint,
  projectPresence,
  projectSettledStatus,
  settledStatusDeadline,
  syncPresence,
  surfacePresencePolicy,
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
 * `present` it must render the frozen view without handlers. `policy` belongs
 * to the surface and is fixed for its lifetime; it is called at each
 * transition, so a reduced-motion change applies to the next close.
 */
export function usePresence<T>(
  live: PresenceLive<T>,
  close: PresenceClose,
  policy: () => PresencePolicy = defaultPresencePolicy,
): PresenceFrame<T> {
  const [surfacePolicy] = useState(() => policy);
  const [store] = useState(() => createTimedStore<PresenceState<T>>(null, {
    deadline: (state) => state?.deadlineMs ?? null,
    advance: (state, nowMs) => advancePresence(state, nowMs, surfacePolicy()),
    frame: { due: presenceAwaitsPaint, mark: markPresencePainted },
    // Fresh live content renders from props; only a stage or identity change
    // needs another render.
    notifies: (previous, next) =>
      previous?.identity !== next?.identity || previous?.stage !== next?.stage,
  }));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useLayoutEffect(() => {
    store.update((current, nowMs) => syncPresence(current, live, close, nowMs, surfacePolicy()));
  }, [close, live, store, surfacePolicy]);
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

function defaultPresencePolicy(): PresencePolicy {
  // Reduced motion removes the fade, never the hold.
  return surfacePresencePolicy(prefersReducedMotion());
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
