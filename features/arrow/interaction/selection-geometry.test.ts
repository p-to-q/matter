import { describe, expect, it } from "vitest";
import type { ThoughtObject } from "../engine/protocol";
import { resolveLassoSelection, type TokenBox } from "./selection-geometry";
import { segmentText } from "./text-segments";

const thought: ThoughtObject = {
  id: "thought_1",
  type: "thought",
  kind: "primary",
  text: "过去仍然允许我们想象其他生活。",
  position: { x: 0, y: 0 },
  width: 400,
  revisions: [],
  style: { emphasis: 1, opacity: 1 },
};

describe("elastic-language geometry", () => {
  it("segments text without changing offsets or content", () => {
    const segments = segmentText(thought.text);
    expect(segments.map((segment) => segment.text).join("")).toBe(thought.text);
    expect(segments.at(-1)?.end).toBe(thought.text.length);
  });

  it("resolves a rough lasso to one contiguous semantic range", () => {
    const tokens: TokenBox[] = [
      { objectId: thought.id, start: 0, end: 2, text: "过去", rect: { x: 10, y: 10, width: 30, height: 20 } },
      { objectId: thought.id, start: 2, end: 4, text: "仍然", rect: { x: 44, y: 10, width: 30, height: 20 } },
      { objectId: thought.id, start: 4, end: 6, text: "允许", rect: { x: 78, y: 10, width: 30, height: 20 } },
      { objectId: thought.id, start: 6, end: 8, text: "我们", rect: { x: 112, y: 10, width: 30, height: 20 } },
    ];
    const selection = resolveLassoSelection(
      [
        { x: 38, y: 3 },
        { x: 113, y: 3 },
        { x: 113, y: 37 },
        { x: 38, y: 37 },
      ],
      tokens,
      { [thought.id]: thought },
    );

    expect(selection).toMatchObject({
      objectId: thought.id,
      start: 2,
      end: 6,
      selectedText: "仍然允许",
    });
    expect(selection?.screenRects).toHaveLength(1);
  });

  it("rejects a click-sized path", () => {
    expect(
      resolveLassoSelection(
        [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 1, y: 2 },
        ],
        [],
        { [thought.id]: thought },
      ),
    ).toBeNull();
  });
});
