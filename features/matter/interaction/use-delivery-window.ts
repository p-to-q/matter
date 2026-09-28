"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { subscribePageExit, subscribePageSuspension } from "./page-suspension";

/**
 * Owns the pointer-idle delivery window shared by admission, Point Talk, and
 * Elastic: submitted work may change material only while the page is visible,
 * the caller's surface is available, and no pointer is pressed.
 *
 * A pressed pointer is released by `pointerup`, `pointercancel`, or
 * `lostpointercapture`, and also by evidence that its release was never
 * delivered here: the window losing focus (a permission sheet, another
 * application) or its next move reporting no pressed buttons (a mouse let go
 * outside the window). Without those, one lost release would hold delivery
 * closed for the rest of the session.
 */
export type DeliveryWindowBinding = Readonly<{
  /** Caller-owned surface availability, read at every evaluation. */
  isAvailable: () => boolean;
  /** Receives the window at every evaluation point, including repeats. */
  onChange: (open: boolean) => void;
  /** The page became hidden; pressed pointers are already released. */
  onSuspend?: () => void;
  /** The page is leaving its usable lifetime. */
  onExit?: () => void;
}>;

export type DeliveryWindowSubscription = Readonly<{
  /** Re-evaluates after a caller-owned availability change. */
  refresh: () => void;
  unsubscribe: () => void;
}>;

export function subscribeDeliveryWindow(
  binding: DeliveryWindowBinding,
): DeliveryWindowSubscription {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Object.freeze({ refresh: () => undefined, unsubscribe: () => undefined });
  }
  const pageWindow = window;
  const pageDocument = document;
  const pressed = new Set<number>();
  let subscribed = true;
  const evaluate = () => {
    if (!subscribed) return;
    binding.onChange(
      binding.isAvailable() &&
        pageDocument.visibilityState === "visible" &&
        pressed.size === 0,
    );
  };
  const onPointerDown = (event: PointerEvent) => {
    pressed.add(event.pointerId);
    binding.onChange(false);
  };
  const onPointerReleased = (event: PointerEvent) => {
    pressed.delete(event.pointerId);
    evaluate();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons !== 0 || !pressed.delete(event.pointerId)) return;
    evaluate();
  };
  const onWindowBlur = (event: Event) => {
    // Element blur does not bubble, but a capturing ancestor would still see
    // it; only the window's own focus loss means a release may be lost.
    if (event.target !== pageWindow || pressed.size === 0) return;
    pressed.clear();
    evaluate();
  };
  // Option objects rather than a boolean: some EventTarget implementations
  // (Node's) ignore a boolean capture flag on removal.
  const capture = { capture: true } as const;
  pageWindow.addEventListener("pointerdown", onPointerDown, capture);
  pageWindow.addEventListener("pointerup", onPointerReleased, capture);
  pageWindow.addEventListener("pointercancel", onPointerReleased, capture);
  pageWindow.addEventListener("lostpointercapture", onPointerReleased, capture);
  pageWindow.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  pageWindow.addEventListener("blur", onWindowBlur);
  const unsubscribeSuspension = subscribePageSuspension(
    () => {
      pressed.clear();
      binding.onChange(false);
      binding.onSuspend?.();
    },
    evaluate,
  );
  const unsubscribeExit = subscribePageExit(() => binding.onExit?.());
  evaluate();
  return Object.freeze({
    refresh: evaluate,
    unsubscribe: () => {
      if (!subscribed) return;
      subscribed = false;
      pageWindow.removeEventListener("pointerdown", onPointerDown, capture);
      pageWindow.removeEventListener("pointerup", onPointerReleased, capture);
      pageWindow.removeEventListener("pointercancel", onPointerReleased, capture);
      pageWindow.removeEventListener("lostpointercapture", onPointerReleased, capture);
      pageWindow.removeEventListener("pointermove", onPointerMove, capture);
      pageWindow.removeEventListener("blur", onWindowBlur);
      unsubscribeSuspension();
      unsubscribeExit();
    },
  });
}

/**
 * Binds one lifecycle owner to the delivery window. The subscription follows
 * `owner`; callbacks are read at call time, so a caller may pass fresh
 * closures on every render. Returns a stable refresh for availability changes
 * the caller owns.
 */
export function useDeliveryWindow(
  binding: DeliveryWindowBinding,
  owner: unknown,
): () => void {
  const bindingRef = useRef(binding);
  const subscriptionRef = useRef<DeliveryWindowSubscription | null>(null);
  useLayoutEffect(() => {
    bindingRef.current = binding;
  });
  useEffect(() => {
    const subscription = subscribeDeliveryWindow({
      isAvailable: () => bindingRef.current.isAvailable(),
      onChange: (open) => bindingRef.current.onChange(open),
      onSuspend: () => bindingRef.current.onSuspend?.(),
      onExit: () => bindingRef.current.onExit?.(),
    });
    subscriptionRef.current = subscription;
    return () => {
      subscription.unsubscribe();
      if (subscriptionRef.current === subscription) subscriptionRef.current = null;
    };
  }, [owner]);
  return useCallback(() => subscriptionRef.current?.refresh(), []);
}
