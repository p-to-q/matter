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

  it("hydrates the stored tree when the live tree still matches the mount fixture", () => {
    const stored = atRevision(6);
    expect(resolveHydrationDecision(FIXTURE, atRevision(1), stored)).toEqual({
      action: "hydrate",
      tree: stored,
    });
  });

  it("hydrates the stored tree when a mid-load edit stays behind stored material", () => {
    const stored = atRevision(6);
    const live = atRevision(4);
    expect(resolveHydrationDecision(FIXTURE, live, stored)).toEqual({ action: "hydrate", tree: stored });
  });

  it("hydrates the stored tree when live and stored revisions tie", () => {
    const stored = atRevision(6);
    expect(resolveHydrationDecision(FIXTURE, atRevision(6), stored)).toEqual({
      action: "hydrate",
      tree: stored,
    });
  });

  it("publishes the live tree only when it is strictly newer than the stored tree", () => {
    const stored = atRevision(3);
    const live = atRevision(5);
    expect(resolveHydrationDecision(FIXTURE, live, stored)).toEqual({ action: "publish", tree: live });
  });

  it("never publishes after a mid-load document switch", () => {
    expect(resolveHydrationDecision(FIXTURE, atRevision(2, "other"), atRevision(6))).toEqual({
      action: "none",
    });
  });
});
