import { describe, expect, it } from "vitest";
import { recordWikiProducerVotes } from "./producer-votes";

describe("recordWikiProducerVotes", () => {
  it("tells an abstention from votes that apply nothing", () => {
    expect(recordWikiProducerVotes("abstained", [])).toEqual({
      caseId: "abstained",
      voteActionIds: [],
      appliedActionId: null,
    });
    expect(recordWikiProducerVotes("competing", [
      { actionId: "relation:b", competesFor: "form" },
      { actionId: "relation:a", competesFor: "form" },
    ])).toEqual({
      caseId: "competing",
      voteActionIds: ["relation:a", "relation:b"],
      appliedActionId: null,
    });
  });

  it("applies a vote that has its source to itself", () => {
    expect(recordWikiProducerVotes("one", [{ actionId: "relation:a", competesFor: "form" }]))
      .toMatchObject({ appliedActionId: "relation:a" });
    expect(recordWikiProducerVotes("mixed", [
      { actionId: "relation:x", competesFor: "one" },
      { actionId: "relation:y", competesFor: "one" },
      { actionId: "relation:z", competesFor: "two" },
    ])).toMatchObject({ appliedActionId: "relation:z" });
  });

  it("never hides two independent votes behind an abstention", () => {
    expect(recordWikiProducerVotes("two", [
      { actionId: "term:b" },
      { actionId: "term:a" },
    ])).toEqual({
      caseId: "two",
      voteActionIds: ["term:a", "term:b"],
      appliedActionId: "term:a + term:b",
    });
  });
});
