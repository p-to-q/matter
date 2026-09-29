import { describe, expect, it } from "vitest";
import { pointTalkReleasedOutcome, pointTalkTurnReleasesOwner } from "./PointTalkTurn";

describe("Point Talk host ownership", () => {
  it("releases a visible turn whose material scope became terminal", () => {
    expect(pointTalkTurnReleasesOwner(true, "stale")).toBe(true);
    expect(pointTalkTurnReleasesOwner(true, "success")).toBe(true);
    expect(pointTalkTurnReleasesOwner(true, "eligible")).toBe(false);
    expect(pointTalkTurnReleasesOwner(true, "error")).toBe(false);
  });

  it("retains only submitted work after presentation detaches", () => {
    expect(pointTalkTurnReleasesOwner(false, "pending")).toBe(false);
    expect(pointTalkTurnReleasesOwner(false, "transcribing")).toBe(false);
    expect(pointTalkTurnReleasesOwner(false, "idle")).toBe(true);
    expect(pointTalkTurnReleasesOwner(false, "error")).toBe(true);
    expect(pointTalkTurnReleasesOwner(false, "stale")).toBe(true);
    expect(pointTalkTurnReleasesOwner(false, "success")).toBe(true);
  });

  it("reports submitted work that ends without a field to show it, once", () => {
    expect(pointTalkReleasedOutcome(false, "pending", "error")).toBe("unavailable");
    expect(pointTalkReleasedOutcome(false, "transcribing", "error")).toBe("unavailable");
    expect(pointTalkReleasedOutcome(false, "pending", "stale")).toBe("stale");
    // The rewritten passage is its own outcome.
    expect(pointTalkReleasedOutcome(false, "pending", "success")).toBeNull();
    // A visible field shows its own failure, but staleness always closes it.
    expect(pointTalkReleasedOutcome(true, "pending", "error")).toBeNull();
    expect(pointTalkReleasedOutcome(true, "pending", "stale")).toBe("stale");
    // A visible draft whose passage changed leaves and says why.
    expect(pointTalkReleasedOutcome(true, "ready", "stale")).toBe("stale");
    expect(pointTalkReleasedOutcome(true, "eligible", "stale")).toBe("stale");
    // A closed draft was never submitted and is nobody's outcome.
    expect(pointTalkReleasedOutcome(false, "ready", "stale")).toBeNull();
    expect(pointTalkReleasedOutcome(true, "stale", "stale")).toBeNull();
    // A failure already seen and then dismissed is not reported again.
    expect(pointTalkReleasedOutcome(false, "error", "error")).toBeNull();
    expect(pointTalkReleasedOutcome(false, "ready", "idle")).toBeNull();
  });
});
