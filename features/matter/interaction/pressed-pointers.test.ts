import { describe, expect, it, vi } from "vitest";
import { trackPressedPointers } from "./pressed-pointers";

function pointer(type: string, pointerId: number, buttons = 0): Event {
  return Object.assign(new Event(type), { pointerId, buttons });
}

function track() {
  const target = new EventTarget() as unknown as Window;
  const onPress = vi.fn();
  const onRelease = vi.fn();
  const pressed = trackPressedPointers(target, { onPress, onRelease });
  return { target, pressed, onPress, onRelease };
}

describe("pressed pointers", () => {
  it("holds while any pointer is pressed and releases on up or cancel", () => {
    const h = track();
    h.target.dispatchEvent(pointer("pointerdown", 1, 1));
    h.target.dispatchEvent(pointer("pointerdown", 2, 1));
    h.target.dispatchEvent(pointer("pointerup", 1));
    expect(h.pressed.isPressed()).toBe(true);
    h.target.dispatchEvent(pointer("pointercancel", 2));
    expect(h.pressed.isPressed()).toBe(false);
    h.pressed.dispose();
  });

  it.each([
    ["a buttonless move of the pressed pointer", (target: Window) =>
      target.dispatchEvent(pointer("pointermove", 1, 0))],
    ["capture lost with no button held", (target: Window) =>
      target.dispatchEvent(pointer("lostpointercapture", 1, 0))],
    ["the window losing focus", (target: Window) => {
      const blur = new Event("blur");
      target.dispatchEvent(blur);
    }],
  ])("recovers a release that never arrived from %s", (_label, lose) => {
    const h = track();
    h.target.dispatchEvent(pointer("pointerdown", 1, 1));
    expect(h.pressed.isPressed()).toBe(true);
    lose(h.target);
    expect(h.pressed.isPressed()).toBe(false);
    expect(h.onRelease).toHaveBeenCalled();
    h.pressed.dispose();
  });

  it("keeps a pointer pressed when capture is released mid-press, and learns one from its move", () => {
    const h = track();
    h.target.dispatchEvent(pointer("pointerdown", 1, 1));
    h.target.dispatchEvent(pointer("lostpointercapture", 1, 1));
    expect(h.pressed.isPressed()).toBe(true);
    h.pressed.clear();
    expect(h.pressed.isPressed()).toBe(false);
    // Pressed before this owner saw it: its pressed move is the evidence.
    h.target.dispatchEvent(pointer("pointermove", 1, 1));
    expect(h.pressed.isPressed()).toBe(true);
    // Another pointer hovering does not speak for the pressed one.
    h.target.dispatchEvent(pointer("pointermove", 2, 0));
    expect(h.pressed.isPressed()).toBe(true);
    h.pressed.dispose();
  });

  it("stops listening once disposed", () => {
    const h = track();
    h.pressed.dispose();
    h.pressed.dispose();
    h.target.dispatchEvent(pointer("pointerdown", 1, 1));
    expect(h.pressed.isPressed()).toBe(false);
    expect(h.onPress).not.toHaveBeenCalled();
  });
});
