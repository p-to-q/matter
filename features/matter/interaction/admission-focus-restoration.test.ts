import { describe, expect, it } from "vitest";
import type { ThoughtTree } from "../tree/model";
import {
  admissionFocusRestorationIsCurrent,
  type AdmissionFocusRestorationBasis,
} from "./admission-focus-restoration";

const TREE: ThoughtTree = {
  protocolVersion: "0.2",
  id: "tree_1",
  rootId: "thought_1",
  revision: 4,
  nodes: {
    thought_1: {
      id: "thought_1",
      text: "Material",
      parentId: null,
      children: [],
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    },
  },
};

const BASIS: AdmissionFocusRestorationBasis = Object.freeze({
  anchor: Object.freeze({
    kind: "child",
    treeId: "tree_1",
    baseRevision: 4,
    parentNodeId: "thought_1",
  }),
  attempt: 1,
  documentEpoch: 3,
  outcome: "released",
  token: "voice_1",
});

describe("admission focus restoration", () => {
  it("accepts only the visible originating document, revision, and parent", () => {
    expect(admissionFocusRestorationIsCurrent(BASIS, TREE, 3, true)).toBe(true);
    expect(admissionFocusRestorationIsCurrent(BASIS, TREE, 3, false)).toBe(false);
    expect(admissionFocusRestorationIsCurrent(BASIS, TREE, 4, true)).toBe(false);
    expect(admissionFocusRestorationIsCurrent(BASIS, { ...TREE, id: "tree_2" }, 3, true)).toBe(false);
    expect(admissionFocusRestorationIsCurrent(BASIS, { ...TREE, revision: 6 }, 3, true)).toBe(false);
    expect(admissionFocusRestorationIsCurrent(BASIS, { ...TREE, nodes: {} }, 3, true)).toBe(false);
  });

  it("allows a newer revision only when the admission explicitly committed it", () => {
    expect(admissionFocusRestorationIsCurrent(BASIS, { ...TREE, revision: 5 }, 3, true)).toBe(false);
    const committed = Object.freeze({ ...BASIS, outcome: "committed" as const });
    expect(admissionFocusRestorationIsCurrent(committed, { ...TREE, revision: 5 }, 3, true)).toBe(true);
    expect(admissionFocusRestorationIsCurrent(committed, { ...TREE, revision: 6 }, 3, true)).toBe(false);
    expect(admissionFocusRestorationIsCurrent(
      { ...committed, anchor: { kind: "root", treeId: TREE.id, baseRevision: Number.MAX_SAFE_INTEGER } },
      TREE,
      3,
      true,
    )).toBe(false);
  });
});
