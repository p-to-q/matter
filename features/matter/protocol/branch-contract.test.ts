import { describe, expect, it } from "vitest";
import { BRANCH_VERSION, parseBranchRequest, parseBranchAnswer, validateBranchText } from "./branch-contract";

export const input = { version: BRANCH_VERSION, requestId: "request_1", treeId: "tree_1", revision: 1,
  parentId: "parent_1", locale: "en-US" as const, parentText: "Time for other possible lives",
  children: ["A slower daily rhythm"] };
describe("branch/1", () => {
  it("admits only the exact bounded reference envelope", () => {
    expect(parseBranchRequest(input)).toEqual(input);
    for (const invalid of [{ ...input, wiki: [] }, { ...input, revision: -1 },
      { ...input, locale: "xx" }, { ...input, parentText: "" },
      { ...input, children: Array(33).fill("heading") }]) expect(parseBranchRequest(invalid)).toBeNull();
  });
  it("refuses duplicate headings, wrappers, controls and multi-line answers", () => {
    for (const value of ["A slower daily rhythm.", input.parentText, "# New angle", "1. New angle",
      "New\nangle", "<answer>New</answer>", " leading", "x", "bad\u0000word", "x".repeat(161)]) {
      expect(validateBranchText(value, input)).toBe(false);
    }
    expect(validateBranchText("A place for unplanned encounters", input)).toBe(true);
  });
  it("binds the answer to its request and forbids model-chosen mutations", () => {
    const answer = { version: BRANCH_VERSION, requestId: input.requestId, treeId: input.treeId,
      revision: input.revision, parentId: input.parentId, text: "A place for unplanned encounters" };
    expect(parseBranchAnswer(answer, input)).toEqual(answer);
    expect(parseBranchAnswer({ ...answer, parentId: "other" }, input)).toBeNull();
    expect(parseBranchAnswer({ ...answer, mutation: {} }, input)).toBeNull();
  });
});
