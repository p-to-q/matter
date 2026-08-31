import { describe, expect, it } from "vitest";
import type { InquiryContextPayload } from "../protocol/inquiry-contract";
import {
  inquiryContextOwnerChanged,
  inquiryContextScopeChanged,
  type InquiryContextOwner,
} from "./inquiry-context-lifecycle";

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
    expect(inquiryContextScopeChanged(context(), context({ scope: "selection" }))).toBe(true);
    expect(inquiryContextScopeChanged(
      context(),
      context({ lineage: [{ nodeId: "other", depth: 0, text: "A thought", truncated: false }] }),
    )).toBe(true);
    expect(inquiryContextScopeChanged(context(), context({ treeId: "tree-2" }))).toBe(true);
    expect(inquiryContextScopeChanged(context(), undefined)).toBe(true);
  });

  it("keeps the record while the same material is edited underneath it", () => {
    // Admission, repair, a derived label, undo and redo all raise the revision
    // while the person is still reading the passage they asked about. Looking
    // back over earlier questions is the point of the surface, so a revision
    // bump must not empty it.
    expect(inquiryContextScopeChanged(context(), context({ revision: 4 }))).toBe(false);
    expect(inquiryContextScopeChanged(context(), context({ thoughtCount: 2 }))).toBe(false);
    expect(inquiryContextScopeChanged(
      context(),
      context({ lineage: [{ nodeId: "root", depth: 0, text: "A repaired thought", truncated: false }] }),
    )).toBe(false);
  });
});

describe("inquiryContextOwnerChanged", () => {
  it("keeps an answer for its captured snapshot until the document owner changes", () => {
    const owner = (overrides: Partial<InquiryContextOwner> = {}): InquiryContextOwner => ({
      treeId: "tree-1",
      documentEpoch: 7,
      ...overrides,
    });
    expect(inquiryContextOwnerChanged(owner(), owner())).toBe(false);
    expect(inquiryContextOwnerChanged(owner(), owner({ treeId: "tree-2" }))).toBe(true);
    expect(inquiryContextOwnerChanged(owner(), owner({ documentEpoch: 8 }))).toBe(true);
    expect(inquiryContextOwnerChanged(owner(), undefined)).toBe(true);
  });
});
