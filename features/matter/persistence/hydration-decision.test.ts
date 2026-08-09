import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../tree/model";
import type { ThoughtTree } from "../tree/model";
import { resolveHydrationDecision } from "./hydration-decision";

const FIXTURE: ThoughtTree = {
  protocolVersion: PROTOCOL_VERSION,
  id: "tree-1",
  rootId: null,
  nodes: {},
  revision: 1,
};

function atRevision(revision: number, id = "tree-1"): ThoughtTree {
  return { ...FIXTURE, id, revision };
}

describe("resolveHydrationDecision", () => {
  it("publishes the live tree when no stored material exists", () => {
    const live = atRevision(2);
    expect(resolveHydrationDecision(FIXTURE, live, null)).toEqual({ action: "publish", tree: live });
  });

  it("hydrates the stored tree when nothing was committed during the load window", () => {
    const stored = atRevision(6);
    expect(resolveHydrationDecision(FIXTURE, FIXTURE, stored)).toEqual({
      action: "hydrate",
      tree: stored,
    });
  });

  it("does not discard a mid-load commit that sits behind stored material", () => {
    // The old rule hydrated here, and the sentence just spoken disappeared.
    const stored = atRevision(6);
    const live = atRevision(4);
    expect(resolveHydrationDecision(FIXTURE, live, stored)).toEqual({ action: "conflict", tree: live });
  });

  it("does not treat equal revisions as the same material", () => {
    // The critical case: same number, different lineage. One is seed-derived
    // and one is the person's last session, and neither descends from the other.
    const stored = atRevision(6);
    const live = atRevision(6);
    expect(resolveHydrationDecision(FIXTURE, live, stored)).toEqual({ action: "conflict", tree: live });
  });

  it("does not overwrite a stored session with a newer seed-derived tree", () => {
    // The old rule published here, and the whole prior session was gone.
    const stored = atRevision(3);
    const live = atRevision(5);
    expect(resolveHydrationDecision(FIXTURE, live, stored)).toEqual({ action: "conflict", tree: live });
  });

  it("treats an identical-looking new object as diverged rather than guessing", () => {
    const stored = atRevision(6);
    const live = { ...FIXTURE };
    expect(resolveHydrationDecision(FIXTURE, live, stored)).toEqual({ action: "conflict", tree: live });
  });

  it("never publishes after a mid-load document switch", () => {
    expect(resolveHydrationDecision(FIXTURE, atRevision(2, "other"), atRevision(6))).toEqual({
      action: "none",
    });
  });
});
