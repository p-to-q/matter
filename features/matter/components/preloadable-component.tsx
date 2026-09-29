"use client";

import { useEffect, useSyncExternalStore, type ComponentType } from "react";
import {
  createChunkRecovery,
  type ChunkRecoveryHost,
} from "../interaction/chunk-recovery";
import { preloadNow, type Preload } from "../interaction/idle-preload";

/**
 * A code-split component whose chunk can start before the gesture that mounts
 * it. Once loaded it renders synchronously in the gesture's own commit.
 *
 * `React.lazy`, and `next/dynamic` above it, cannot do that: a lazy boundary
 * suspends on its first mount even when the chunk is cached, and React
 * throttles the reveal of a just-committed fallback by about 300 ms. Until its
 * chunk arrives this renders nothing, like a null fallback, and a failed load
 * is never thrown into the tree: the next mount or preload retries it, and
 * while a mounted instance still waits, `chunk-recovery` retries it with
 * backoff and again when the network returns or the page becomes visible.
 */
export type PreloadableComponent<P> = ComponentType<P> & Readonly<{ preload: Preload }>;

export type ComponentCell<P> = Readonly<{
  preload: () => Promise<ComponentType<P>>;
  read: () => ComponentType<P> | null;
  subscribe: (listener: () => void) => () => void;
}>;

/** The module-lifetime load state behind one preloadable component. */
export function createComponentCell<P>(
  load: () => Promise<ComponentType<P>>,
  recoveryHost?: ChunkRecoveryHost | null,
): ComponentCell<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const listeners = new Set<() => void>();
  // Mounted instances are the demand: recovery runs only while one waits.
  const recovery = createChunkRecovery(() => {
    if (loaded === null && listeners.size > 0) preloadNow(preload);
  }, recoveryHost);
  function preload(): Promise<ComponentType<P>> {
    if (loaded !== null) return Promise.resolve(loaded);
    if (pending !== null) return pending;
    const attempt = load().then((component) => {
      loaded = component;
      recovery.succeeded();
      for (const listener of [...listeners]) listener();
      return component;
    }, (error: unknown) => {
      if (pending === attempt) pending = null;
      if (listeners.size > 0) recovery.failed();
      throw error;
    });
    pending = attempt;
    return attempt;
  }
  return Object.freeze({
    preload,
    read: () => loaded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) recovery.release();
      };
    },
  });
}

const renderNothingOnServer = () => null;

export function preloadableComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
): PreloadableComponent<P> {
  const cell = createComponentCell(load);
  function Preloadable(props: P) {
    // The server snapshot is null during hydration too, so markup the server
    // rendered without this chunk never mismatches a client that has it.
    const Component = useSyncExternalStore(cell.subscribe, cell.read, renderNothingOnServer);
    useEffect(() => {
      if (cell.read() === null) preloadNow(cell.preload);
    }, []);
    return Component === null ? null : <Component {...props} />;
  }
  return Object.assign(Preloadable, { preload: cell.preload as Preload });
}
