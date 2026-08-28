import { describe, expect, it } from "vitest";
import {
  sameInquiryContextOwner,
  type InquiryContextOwner,
} from "./inquiry-context-lifecycle";

function owner(overrides: Partial<InquiryContextOwner> = {}): InquiryContextOwner {
  return {
    treeId: "tree-1",
    documentEpoch: 7,
    ...overrides,
  };
}

describe("sameInquiryContextOwner", () => {
  it("keeps one document instance stable across material and selection changes", () => {
    expect(sameInquiryContextOwner(owner(), owner())).toBe(true);
  });

  it("rejects a different tree or a replacement instance with identical serialized material", () => {
    expect(sameInquiryContextOwner(owner(), owner({ treeId: "tree-2" }))).toBe(false);
    expect(sameInquiryContextOwner(owner(), owner({ documentEpoch: 8 }))).toBe(false);
  });
});
