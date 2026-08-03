import { describe, expect, it } from "vitest";
import { createInitialScene, INITIAL_SAMPLE } from "./protocol";

describe("initial Matter scene", () => {
  it("opens with the sample as revision zero", () => {
    const scene = createInitialScene();
    const sample = scene.objects.thought_sample;

    expect(scene.revision).toBe(0);
    expect(scene.order).toEqual(["thought_sample"]);
    expect(sample).toMatchObject({
      type: "thought",
      text: INITIAL_SAMPLE,
      revisions: [{ text: INITIAL_SAMPLE, source: "fixture" }],
    });
  });
});
