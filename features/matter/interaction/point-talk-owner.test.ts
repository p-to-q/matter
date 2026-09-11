import { describe, expect, it } from "vitest";
import { createPointTalkOwner, currentPointTalkNodeId } from "./point-talk-owner";

describe("Point Talk operation owner", () => {
  const eligible = new Set(["same-id"]);

  it("keeps a turn only inside its exact loaded document instance", () => {
    const owner = createPointTalkOwner(3, "tree-a", "same-id");
    expect(currentPointTalkNodeId(owner, 3, "tree-a", eligible)).toBe("same-id");
    expect(currentPointTalkNodeId(owner, 4, "tree-a", eligible)).toBeNull();
    expect(currentPointTalkNodeId(owner, 3, "tree-b", eligible)).toBeNull();
  });

  it("revokes a removed or newly ineligible target even when the document remains", () => {
    const owner = createPointTalkOwner(3, "tree-a", "same-id");
    expect(currentPointTalkNodeId(owner, 3, "tree-a", new Set())).toBeNull();
    expect(currentPointTalkNodeId(null, 3, "tree-a", eligible)).toBeNull();
  });
});
