import { describe, expect, it } from "vitest";
import { pointTalkDetachedOutcome, pointTalkTurnReleasesOwner } from "./PointTalkTurn";

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

  it("reports how detached submitted work ended, once, without reopening the field", () => {
    expect(pointTalkDetachedOutcome(false, "pending", "error")).toBe("unchanged");
    expect(pointTalkDetachedOutcome(false, "transcribing", "error")).toBe("unchanged");
    expect(pointTalkDetachedOutcome(false, "pending", "stale")).toBe("passage-changed");
    // The rewritten passage is its own outcome.
    expect(pointTalkDetachedOutcome(false, "pending", "success")).toBeNull();
    // A visible field shows its own failure.
    expect(pointTalkDetachedOutcome(true, "pending", "error")).toBeNull();
    // A failure already seen and then dismissed is not reported again.
    expect(pointTalkDetachedOutcome(false, "error", "error")).toBeNull();
    expect(pointTalkDetachedOutcome(false, "ready", "idle")).toBeNull();
  });
});
