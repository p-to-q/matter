import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advancePresence, syncPresence, markPresencePainted } from "./presence";
import { trailBasisCurrent } from "./OperationTrail";
import { layoutColumnarTree } from "../layout/columnar-layout";
import { operationTrailGeometry } from "../layout/operation-trail";
import {
  OPERATION_TRAIL_TIMING,
  trailClose,
  trailPresencePolicy,
} from "./operation-trail-presence";

describe("trailPresencePolicy", () => {
  it("holds nothing past its cause and fades 160ms for a landed result, 100ms for everything else", () => {
    const policy = trailPresencePolicy(false);
    expect(policy.holdMs).toEqual({ person: 0, finished: 0, yielded: 0, invalidated: 0 });
    expect(policy.exitMs).toEqual({ person: 100, finished: 160, yielded: 100, invalidated: 100 });
  });

  it("removes the fade under reduced motion", () => {
    expect(trailPresencePolicy(true).exitMs).toEqual({ person: 0, finished: 0, yielded: 0, invalidated: 0 });
  });

  it("drives the repo's presence machine: present, then exiting for exactly the close's fade, then gone", () => {
    const policy = trailPresencePolicy(false);
    const live = { identity: "operation-trail", view: "a" };
    let state = syncPresence(null, live, "person", 0, policy);
    state = markPresencePainted(state, 10);
    // Selected passage A to B is an update of the same identity: still present, no exit.
    expect(syncPresence(state, { ...live, view: "b" }, "person", 20, policy)?.stage).toBe("present");
    // Gone: a settled result exits over 160ms.
    const gone = syncPresence(state, null, "finished", 100, policy);
    expect(gone?.stage).toBe("exiting");
    expect(gone?.deadlineMs).toBe(260);
    expect(advancePresence(gone, 259, policy)?.stage).toBe("exiting");
    expect(advancePresence(gone, 260, policy)).toBeNull();
    // A cancel, a stale target or a deleted passage: 100ms.
    expect(syncPresence(state, null, "person", 100, policy)?.deadlineMs).toBe(200);
    expect(syncPresence(state, null, "invalidated", 100, policy)?.deadlineMs).toBe(200);
    // A stale layout epoch, a document switch or a hidden page cut at once.
    expect(syncPresence(state, null, "preempted", 100, policy)).toBeNull();
    // Reduced motion: no fade at all.
    expect(syncPresence(state, null, "finished", 100, trailPresencePolicy(true))).toBeNull();
  });

  it("never fades a trail that was never painted", () => {
    const policy = trailPresencePolicy(false);
    const state = syncPresence(null, { identity: "operation-trail", view: "a" }, "person", 0, policy);
    expect(syncPresence(state, null, "person", 5, policy)).toBeNull();
  });

  it("repeats its numbers in the stylesheet", () => {
    const css = readFileSync(new URL("./OperationTrail.css", import.meta.url), "utf8");
    const { enterMs, weightMs, exitMs } = OPERATION_TRAIL_TIMING;
    expect(css).toContain(`animation: operation-trail-enter ${enterMs}ms ease-out backwards;`);
    expect(css).toContain(`.operation-trail[data-presence="exiting"] { opacity: 0; transition: opacity ${exitMs.person}ms ease-out; }`);
    expect(css).toContain(
      `.operation-trail[data-presence="exiting"][data-presence-close="finished"] { transition-duration: ${exitMs.finished}ms; }`,
    );
    for (const property of ["stroke", "fill"]) {
      expect(css).toContain(`transition: ${property} ${weightMs}ms ease;`);
    }
    // A layout from another epoch is never held: the css has no hold for "preempted".
    expect(css).not.toMatch(/data-presence-close="preempted"/u);
  });
});

describe("trailClose", () => {
  const base = { layoutCurrent: true, passageExists: true, lastStrength: "selected" as const, pointTalkPhase: "idle" };

  it("cuts at once when the layout epoch is not the published one", () => {
    expect(trailClose({ ...base, layoutCurrent: false })).toBe("preempted");
    expect(trailClose({ ...base, layoutCurrent: false, passageExists: false })).toBe("preempted");
  });

  it("leaves quickly when the passage is gone or the operation went stale", () => {
    expect(trailClose({ ...base, passageExists: false })).toBe("invalidated");
    expect(trailClose({ ...base, lastStrength: "operating", pointTalkPhase: "stale" })).toBe("invalidated");
  });

  it("steps back a little slower when a result landed", () => {
    expect(trailClose({ ...base, lastStrength: "operating", pointTalkPhase: "success" })).toBe("finished");
    expect(trailClose({ ...base, lastStrength: "operating" })).toBe("finished");
  });

  it("is the person moving on for a cleared selection", () => {
    expect(trailClose(base)).toBe("person");
  });
});

describe("active trail basis", () => {
  const result = layoutColumnarTree({ nodes: [
    { id: "a", parentId: null, depth: 0, size: { width: 200, height: 40 } },
    { id: "b", parentId: "a", depth: 1, size: { width: 200, height: 40 } },
  ], origin: { x: 0, y: 0 }, layoutEpoch: 5, columnWidth: 200, columnGap: 40, siblingGap: 20 });
  if (!result.ok) throw new Error(result.error.code);
  const layout = result.layout;
  const materialBounds = { layoutEpoch: 5, passages: layout.boxes.map((box) => {
    const bounds = { x: box.x, y: box.y, width: box.width, height: box.height };
    return { nodeId: box.nodeId, bounds, firstRow: bounds, bottomExtent: 0 };
  }) };
  const input = { layout, currentLayoutEpoch: 5, lineages: [["a", "b"]], materialBounds,
    zoom: 1, window: { x: -100, y: -100, width: 1000, height: 1000 } };
  const trail = operationTrailGeometry(input);

  it("cuts a painted A+B trail when an active target loses its lineage/bounds or its published bridge", () => {
    const policy = trailPresencePolicy(false);
    const multi = { ...input, lineages: [["a"], ["a", "b"]] };
    const oldTrail = operationTrailGeometry(multi)!;
    expect(oldTrail.targets.map((target) => target.nodeId)).toEqual(["a", "b"]);
    const old = markPresencePainted(syncPresence(null,
      { identity: "operation-trail", view: oldTrail }, "person", 0, policy), 10);
    expect(trail).not.toBeNull();
    const invalid = [
      operationTrailGeometry({ ...multi, lineages: [["a"], ["a", "vanished-b"]] }),
      operationTrailGeometry({ ...input, lineages: null }),
      operationTrailGeometry({ ...input, materialBounds: null }),
      operationTrailGeometry({ ...input, layout: { ...layout, edges: [] } }),
      operationTrailGeometry({ ...input, zoom: Number.NaN }),
    ];
    for (const derived of invalid) for (const strength of ["selected", "operating"] as const) {
      expect(derived).toBeNull();
      const close = trailClose({ layoutCurrent: trailBasisCurrent({ layout, currentLayoutEpoch: 5, strength, trail: derived }),
        // A still exists: a surviving target must not authorize fading stale A+B geometry.
        passageExists: true, lastStrength: strength, pointTalkPhase: "idle" });
      expect(close).toBe("preempted");
      expect(syncPresence(old, null, close, 20, policy)).toBeNull();
    }
  });

  it("preserves normal off departures, while stale publications always cut", () => {
    const policy = trailPresencePolicy(false);
    const basis = { layout, currentLayoutEpoch: 5, trail: null, strength: "off" as const };
    expect(trailBasisCurrent(basis)).toBe(true);
    expect(trailBasisCurrent({ ...basis, strength: "selected", trail })).toBe(true);
    expect(trailBasisCurrent({ ...basis, currentLayoutEpoch: 6 })).toBe(false);
    expect(trailBasisCurrent({ ...basis, layout: null })).toBe(false);
    for (const [lastStrength, duration] of [["selected", 100], ["operating", 160]] as const) {
      const old = markPresencePainted(syncPresence(null,
        { identity: "operation-trail", view: "A+B" }, "person", 0, policy), 10);
      const close = trailClose({ layoutCurrent: trailBasisCurrent(basis), passageExists: true,
        lastStrength, pointTalkPhase: "idle" });
      expect(syncPresence(old, null, close, 20, policy)?.deadlineMs).toBe(20 + duration);
    }
  });
});

describe("the layer's wiring", () => {
  const source = readFileSync(new URL("./OperationTrail.tsx", import.meta.url), "utf8");

  it("loads its stylesheet and its code with the layer, not with the first paint", () => {
    expect(source).toContain('import "./OperationTrail.css";');
    const globals = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
    expect(globals).not.toContain("operation-trail");
    const composition = readFileSync(new URL("./RootedMaterial.tsx", import.meta.url), "utf8");
    expect(composition).toContain('import("./OperationTrail").then((module) => module.OperationTrailLayer)');
    expect(composition).not.toMatch(/^import .* from "\.\/OperationTrail";$/mu);
  });

  it("uses the shared presence hook and owns no timer", () => {
    expect(source).toContain('import { prefersReducedMotion, usePresence } from "./use-presence";');
    expect(source).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/u);
  });

  it("is one identity, so moving the selection updates the drawing in place", () => {
    expect(source).toContain('const TRAIL_IDENTITY = "operation-trail";');
    expect(source).toMatch(/key=\{target\.nodeId\}/u);
  });

  it("projects the dimensional owner once and inverse-scales only point and cue coordinates", () => {
    for (const [name, metric] of [["stroke", "stroke"], ["bead", "bead"], ["more-dot", "moreDot"]]) {
      expect(source).toContain(`"--operation-trail-${name}": \`\${OPERATION_TRAIL_PX.${metric}}px\``);
    }
    expect(source).toContain("r={OPERATION_TRAIL_PX.target * unit / 2}");
    expect(source).toContain("const chevronHalf = OPERATION_TRAIL_PX.chevron * unit / 2;");
    expect(source).toContain("d={`M${-chevronHalf} ${-chevronHalf}L0 0L${-chevronHalf} ${chevronHalf}`}");
  });

  it("is one SVG, aria-hidden, without a tab stop or a pointer, and its element count does not grow with depth", () => {
    expect(source.match(/<svg/gu)).toHaveLength(1);
    // Bounded batched paths, target circles and continuation all share one clipped SVG.
    expect(source.match(/<path/gu)).toHaveLength(5);
    expect(source.match(/<circle/gu)).toHaveLength(1);
    expect(source.match(/<(?:span|div)/gu)).toHaveLength(2);
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('focusable="false"');
    expect(source).not.toMatch(/tabIndex|onClick|onPointer/u);
    expect(source).not.toMatch(/<marker|\.map\(\([a-z]+\) => \(\s*<path/u);
  });

  it("keeps disposable material geometry tied to the current canvas, tree and layout owners", () => {
    expect(source).toContain("const [frame, setFrame] = useState<Frame | null>(null);");
    expect(source).toContain("receipt.canvas === canvasElement && receipt.tree === tree");
    expect(source).toContain("receipt.layout === layout && receipt.nodes === nodes");
    expect(source).toContain("layoutCurrent: trailBasisCurrent({ layout, currentLayoutEpoch: props.currentLayoutEpoch, strength, trail })");
    expect(source).toContain('if (view === null) return <div aria-hidden="true" className="operation-trail"');
    expect(source).toContain('fonts?.addEventListener("loading", loading)');
    expect(source).toContain("resize?.disconnect()");
    expect(source).toContain("mutation?.disconnect()");
    expect(source).not.toMatch(/useRef/u);
  });

  it("wires source/font/drag invalidation before remeasurement, without a camera dependency or RO self-loop", () => {
    expect(source).toContain("const invalidateAndMeasure = () => { if (disposed) return; flushSync(invalidate); measure(); };");
    expect(source).toContain('const loading = () => { if (disposed) return; fontLoading = true; flushSync(invalidate); };');
    expect(source).toContain('const loaded = () => { if (disposed) return; fontLoading = fonts?.status === "loading"; invalidateAndMeasure(); };');
    expect(source).toContain('attributeFilter: ["data-node-dragging"]');
    expect(source).toContain('shell?.dataset.nodeDragging === "true"');
    expect(source).toContain("for (const element of nextSizes) if (!observedSizes.has(element)) resize?.observe(element);");
    expect(source).toContain("for (const element of observedSizes) if (!nextSizes.has(element)) resize?.unobserve(element);");
    expect(source).toContain("}, [canvasElement, canvasRef, layout, nodes, tree]);");
    expect(source).toContain("drag?.disconnect()");
    const hook = source.slice(source.indexOf("function useTrailMaterialBounds("));
    expect(hook).not.toContain("viewport");
    const measurement = hook.slice(hook.indexOf("const measure ="), hook.indexOf("const loading ="));
    expect(measurement).not.toContain("resize?.disconnect()");
  });

  it("fences late observer/font callbacks before they can invalidate a replacement owner", () => {
    const callbacks = ["invalidateAndMeasure", "loading", "loaded"];
    for (const callback of callbacks) {
      // This is a source ownership invariant, not a simulation of native callback scheduling.
      expect(source).toContain(`const ${callback} = () => { if (disposed) return;`);
    }
    expect(source).toContain("const measure = () => {\n      if (disposed) return;");
    expect(source).toContain("return () => {\n      disposed = true;\n      resize?.disconnect();");
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(new URL("./OperationTrail.css", import.meta.url), "utf8");
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*\\{([^}]*)\\}`, "u").exec(css)?.[1] ?? "";

  it("is quiet, still, non-interactive and one weight change apart between strengths", () => {
    const wrapper = rule(".operation-trail");
    expect(wrapper).toContain("pointer-events: none");
    expect(wrapper).toContain("position: absolute");
    expect(wrapper).toContain("--trail-ink-share: 48%");
    expect(wrapper).toContain("var(--paper)");
    expect(rule('.operation-trail[data-strength="operating"]')).toContain("--trail-ink-share: 68%");
    const path = rule(".operation-trail__path");
    expect(path).toContain("stroke-width: var(--operation-trail-stroke)");
    expect(path).toContain("stroke-linecap: round");
    expect(path).toContain("stroke-linejoin: round");
    expect(path).toContain("vector-effect: non-scaling-stroke");
    expect(path).toContain("stroke: var(--trail-ink)");
  });

  it("draws everything below the selected passage a little lighter than the path above it", () => {
    expect(rule(".operation-trail__path--down, .operation-trail__dots--down, .operation-trail__arrows--down")).toContain("stroke: var(--trail-child-ink)");
  });

  it("uses small screen-sized points, with no halo or solid arrow stacking", () => {
    expect(rule(".operation-trail__dots")).toContain("stroke-width: var(--operation-trail-bead)");
    expect(rule(".operation-trail__dots")).toContain("stroke-linecap: round");
    expect(rule(".operation-trail__bead")).toContain("fill: var(--trail-ink)");
    expect(css).not.toContain(".operation-trail__bead::before");
    expect(rule(".operation-trail__arrows")).toContain("display: none");
    expect(rule(".operation-trail__arrows")).toContain("fill: none");
  });

  it("draws in CanvasText under forced colours", () => {
    expect(css).toMatch(/forced-colors: active\)\s*\{[\s\S]*?\.operation-trail__chevron \{ stroke: CanvasText; \}/u);
    expect(css).toMatch(/\.operation-trail__bead \{[^}]*fill: CanvasText;/u);
  });
});
