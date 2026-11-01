import { describe, expect, it } from "vitest";
import { createMatterStore } from "./matter-store";
import { prepareBranchIngress } from "../application/branch-ingress";
import { BRANCH_VERSION, type BranchRequest } from "../protocol/branch-contract";

describe("generated child commit", () => {
  it("inserts one real heading, preserves the parent, and undoes exactly", () => {
    const store = createMatterStore(undefined, { branchIngress: () => prepareBranchIngress });
    const before = store.getState().tree;
    const parent = before.nodes[before.rootId!];
    const request: BranchRequest = { version: BRANCH_VERSION, requestId: "request_1", treeId: before.id,
      revision: before.revision, parentId: parent.id, parentText: parent.text, locale: "zh-CN",
      children: parent.children.map((id) => before.nodes[id].text) };
    const answer = { version: BRANCH_VERSION, requestId: request.requestId, treeId: request.treeId,
      revision: request.revision, parentId: parent.id, text: "给尚未发生的生活留出余地" };
    const values = { nodeId: "generated_child", createdAt: "2026-11-02T00:00:00.000Z" };
    expect(store.getState().commitBranch(request, answer, values, 0).status).toBe("committed");
    expect(store.getState().tree.nodes[parent.id].text).toBe(parent.text);
    expect(store.getState().tree.nodes.generated_child.text).toBe(answer.text);
    expect(store.getState().commitBranch(request, answer, values, 0).status).toBe("rejected");
    store.getState().undo();
    expect(store.getState().tree.nodes.generated_child).toBeUndefined();
    expect(store.getState().tree.nodes[parent.id].children).toEqual(parent.children);
    expect(store.getState().commitBranch(request, answer, values, 1).status).toBe("rejected");
  });
});
