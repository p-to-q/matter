/**
 * The one owner of "is a pointer pressed anywhere on this page". Delivery of
 * submitted work and the Wiki settle both wait for pointer idle, and both
 * must survive a release that was never delivered here.
 *
 * A pressed pointer is released by `pointerup` or `pointercancel`, and also by
 * evidence that its release was lost: capture lost with no button held, the
 * window losing focus (a permission sheet, another application), or its next
 * move reporting no pressed buttons (a mouse let go outside the window).
 * Without those, one lost release would hold the page "pressed" for the rest
 * of the session. Canvas code may release capture while the person still
 * presses, so a pressed move re-registers the pointer.
 */
export type PressedPointerCallbacks = Readonly<{
  /** A pointer became pressed, or a pressed one was seen again. */
  onPress?: () => void;
  /**
   * Evidence of a release arrived, even for a pointer this tracker never saw
   * pressed, so a caller may re-evaluate at every such point.
   */
  onRelease?: () => void;
}>;

export type PressedPointers = Readonly<{
  isPressed: () => boolean;
  /** Forgets every pressed pointer, as when the page is hidden. */
  clear: () => void;
  dispose: () => void;
}>;

export function trackPressedPointers(
  target: Window,
  callbacks: PressedPointerCallbacks = {},
): PressedPointers {
  const pressed = new Set<number>();
  let disposed = false;
  const press = (pointerId: number) => {
    pressed.add(pointerId);
    callbacks.onPress?.();
  };
  const release = (pointerId: number) => {
    pressed.delete(pointerId);
    callbacks.onRelease?.();
  };
  const onPointerDown = (event: PointerEvent) => press(event.pointerId);
  const onPointerReleased = (event: PointerEvent) => release(event.pointerId);
  const onCaptureLost = (event: PointerEvent) => {
    if (event.buttons === 0) release(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons === 0) {
      if (pressed.has(event.pointerId)) release(event.pointerId);
      return;
    }
    if (!pressed.has(event.pointerId)) press(event.pointerId);
  };
  const onWindowBlur = (event: Event) => {
    // Element blur does not bubble, but a capturing ancestor would still see
    // it; only the window's own focus loss means a release may be lost.
    if (event.target !== target || pressed.size === 0) return;
    pressed.clear();
    callbacks.onRelease?.();
  };
  // Option objects rather than a boolean: some EventTarget implementations
  // (Node's) ignore a boolean capture flag on removal.
  const capture = { capture: true } as const;
  target.addEventListener("pointerdown", onPointerDown, capture);
  target.addEventListener("pointerup", onPointerReleased, capture);
  target.addEventListener("pointercancel", onPointerReleased, capture);
  target.addEventListener("lostpointercapture", onCaptureLost, capture);
  target.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  target.addEventListener("blur", onWindowBlur);
  return Object.freeze({
    isPressed: () => pressed.size > 0,
    clear: () => pressed.clear(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pressed.clear();
      target.removeEventListener("pointerdown", onPointerDown, capture);
      target.removeEventListener("pointerup", onPointerReleased, capture);
      target.removeEventListener("pointercancel", onPointerReleased, capture);
      target.removeEventListener("lostpointercapture", onCaptureLost, capture);
      target.removeEventListener("pointermove", onPointerMove, capture);
      target.removeEventListener("blur", onWindowBlur);
    },
  });
}
