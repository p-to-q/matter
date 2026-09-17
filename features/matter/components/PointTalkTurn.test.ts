import { describe, expect, it } from "vitest";
import { pointTalkTurnReleasesOwner } from "./PointTalkTurn";

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
});
