"use client";

import { useEffect, useSyncExternalStore, type ComponentType } from "react";
import { preloadNow, type Preload } from "../interaction/idle-preload";

/**
 * A code-split component whose chunk can start before the gesture that mounts
 * it. Once loaded it renders synchronously in the gesture's own commit.
 *
 * `React.lazy`, and `next/dynamic` above it, cannot do that: a lazy boundary
 * suspends on its first mount even when the chunk is cached, and React
 * throttles the reveal of a just-committed fallback by about 300 ms. Until its
 * chunk arrives this renders nothing, like a null fallback, and a failed load
 * is retried by the next mount or preload rather than thrown into the tree.
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
): ComponentCell<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const listeners = new Set<() => void>();
  return Object.freeze({
    preload() {
      if (pending !== null) return pending;
      const attempt = load().then((component) => {
        loaded = component;
        for (const listener of [...listeners]) listener();
        return component;
      }, (error: unknown) => {
        if (pending === attempt) pending = null;
        throw error;
      });
      pending = attempt;
      return attempt;
    },
    read: () => loaded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
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
