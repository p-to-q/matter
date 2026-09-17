import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controller = readFileSync(new URL("./use-lasso.ts", import.meta.url), "utf8");
const root = readFileSync(new URL("../components/RootedMaterial.tsx", import.meta.url), "utf8");

describe("lasso layout prefilter wiring", () => {
  it("passes the current pure layout and fails open before DOM range reads", () => {
    expect(root).toMatch(/useLasso\(\{[^]*?layout: activeLayout,/);
    expect(controller).toContain("visibleLassoLayoutNodeIds({");
    expect(controller).toContain("input.layout.layoutEpoch === latestEpochRef.current.layoutEpoch");
    expect(controller).toContain("layoutNodeIds: ReadonlySet<string> | null = null");
    expect(controller).toContain("if (layoutNodeIds !== null && !layoutNodeIds.has(nodeId)) continue;");
  });

  it("revalidates the exact pointer-down snapshot before resolving pointer-up", () => {
    expect(controller).toContain("targetSnapshotKeyRef.current !== currentSnapshotKey");
    expect(controller).toContain("targetSnapshotRef.current === null");
    expect(controller).not.toMatch(/targetSnapshotRef\.current \?\? measureLassoTargets/);
  });

  it("bounds raw capture separately and makes compaction saturation inert", () => {
    expect(controller).toContain("LASSO_THRESHOLDS.maximumCapturedPointCount");
    expect(controller).toContain('if (compacted.kind === "saturated") strokeSaturatedRef.current = true');
    expect(controller).toMatch(/const resolution = strokeSaturatedRef\.current \|\|/);
  });

  it("invalidates window and visual viewport scroll and resize geometry", () => {
    expect(controller).toContain('window.addEventListener("resize", invalidate)');
    expect(controller).toContain('window.addEventListener("scroll", invalidateRelevantScroll, true)');
    expect(controller).toContain('window.visualViewport?.addEventListener("resize", invalidate)');
    expect(controller).toContain('window.visualViewport?.addEventListener("scroll", invalidate)');
    expect(controller).toContain('window.visualViewport?.removeEventListener("resize", invalidate)');
    expect(controller).toContain('window.visualViewport?.removeEventListener("scroll", invalidate)');
  });
});
