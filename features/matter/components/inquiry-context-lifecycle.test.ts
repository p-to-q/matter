import { describe, expect, it } from "vitest";
import type { InquiryContextPayload } from "../server/inquiry-contract";
import { inquiryContextScopeChanged } from "./inquiry-context-lifecycle";

function context(overrides: Partial<InquiryContextPayload> = {}): InquiryContextPayload {
  return {
    treeId: "tree-1",
    revision: 3,
    scope: "tree",
    lineage: [{ nodeId: "root", depth: 0, text: "A thought", truncated: false }],
    thoughtCount: 1,
    clipped: false,
    ...overrides,
  };
}

describe("inquiryContextScopeChanged", () => {
  it("does not discard a transient answer when a new callback projects the same material", () => {
    expect(inquiryContextScopeChanged(context(), context())).toBe(false);
  });

  it("clears only when the bounded material scope actually changes", () => {
    expect(inquiryContextScopeChanged(context(), context({ revision: 4 }))).toBe(true);
    expect(inquiryContextScopeChanged(context(), context({ scope: "selection" }))).toBe(true);
    expect(inquiryContextScopeChanged(context(), undefined)).toBe(true);
  });
});
