"use client";

import { useLayoutEffect, useRef } from "react";
import { isCancelEscape, type KeyLike } from "./composition-safe-keys";

/**
 * The one owner of document-level Escape. One keydown closes at most one layer.
 *
 * Focused fields (rename, title, search, a slider grip) keep their own
 * `onKeyDown`, test `isCancelEscape(event.nativeEvent)`, and call
 * `preventDefault()` — never `stopPropagation()`. Everything else registers a
 * layer here. The single listener sits on `window` in the bubble phase: React
 * delegates at the root container (the document under Next), so it runs after
 * every React handler and can honour their `defaultPrevented`.
 *
 * Tier orders what a person perceives as "on top": an in-flight gesture, then a
 * transient surface, then a panel, then a mode. Within a tier the most recently
 * activated layer wins. A layer returns false when it had nothing left to
 * cancel, and the next one tries.
 */
export type EscapeTier = "mode" | "panel" | "transient" | "gesture";

export type EscapeLayer = Readonly<{
  tier: EscapeTier;
  onEscape: () => boolean;
}>;

export type EscapeKeydown = KeyLike & Pick<KeyboardEvent, "defaultPrevented" | "repeat" | "preventDefault">;

export type EscapeStack = Readonly<{
  register: (layer: EscapeLayer) => () => void;
  /** Returns true when one layer handled this keydown. */
  handleKeydown: (event: EscapeKeydown) => boolean;
  size: () => number;
}>;

const TIER_RANK: Readonly<Record<EscapeTier, number>> = Object.freeze({
  mode: 0,
  panel: 1,
  transient: 2,
  gesture: 3,
});

export function createEscapeStack(): EscapeStack {
  const layers = new Map<symbol, Readonly<{ layer: EscapeLayer; sequence: number }>>();
  let sequence = 0;
  return Object.freeze({
    register(layer: EscapeLayer) {
      const key = Symbol("escape-layer");
      sequence += 1;
      layers.set(key, Object.freeze({ layer, sequence }));
      return () => {
        layers.delete(key);
      };
    },
    handleKeydown(event: EscapeKeydown) {
      // Auto-repeat would walk down the stack while the key is held.
      if (event.defaultPrevented || event.repeat || !isCancelEscape(event)) return false;
      const ordered = Array.from(layers.values()).sort((left, right) =>
        TIER_RANK[right.layer.tier] - TIER_RANK[left.layer.tier] ||
        right.sequence - left.sequence
      );
      for (const { layer } of ordered) {
        if (!layer.onEscape()) continue;
        event.preventDefault();
        return true;
      }
      return false;
    },
    size: () => layers.size,
  });
}

const documentEscapeStack = createEscapeStack();
let windowListening = false;

function handleWindowKeydown(event: KeyboardEvent): void {
  documentEscapeStack.handleKeydown(event);
}

/** Registers one layer with the document stack; the returned function is idempotent. */
export function registerEscapeLayer(layer: EscapeLayer): () => void {
  const unregister = documentEscapeStack.register(layer);
  if (!windowListening && typeof window !== "undefined") {
    window.addEventListener("keydown", handleWindowKeydown);
    windowListening = true;
  }
  return () => {
    unregister();
    if (windowListening && documentEscapeStack.size() === 0) {
      window.removeEventListener("keydown", handleWindowKeydown);
      windowListening = false;
    }
  };
}

/**
 * Keeps one layer registered while `active`. Recency is the moment the layer
 * became active, not the last time its handler identity changed.
 */
export function useEscapeLayer(
  active: boolean,
  tier: EscapeTier,
  onEscape: () => boolean,
): void {
  const handlerRef = useRef(onEscape);
  useLayoutEffect(() => {
    handlerRef.current = onEscape;
  });
  // A layout effect registers before paint, so an Escape that follows the
  // first visible frame of a surface can always reach it.
  useLayoutEffect(() => {
    if (!active) return;
    return registerEscapeLayer({ tier, onEscape: () => handlerRef.current() });
  }, [active, tier]);
}
