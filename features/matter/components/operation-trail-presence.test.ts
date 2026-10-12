import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advancePresence, syncPresence, markPresencePainted } from "./presence";
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
    for (const property of ["stroke", "background-color"]) {
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

  it("is one SVG, aria-hidden, without a tab stop or a pointer, and its element count does not grow with depth", () => {
    expect(source.match(/<svg/gu)).toHaveLength(1);
    // Three paths a weight (line, dots, arrows) and one for the "more" dots: no element per edge or per dot.
    expect(source.match(/<path/gu)).toHaveLength(4);
    expect(source.match(/<(?:span|div)/gu)).toHaveLength(3);
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('focusable="false"');
    expect(source).not.toMatch(/tabIndex|onClick|onPointer/u);
    expect(source).not.toMatch(/<marker|\.map\(\([a-z]+\) => \(\s*<path/u);
  });

  it("stores neither the target nor the geometry: only measurements of the rendering edge", () => {
    // The measurements, and the strength the trail last had (read only once nothing is drawn).
    expect(source.match(/useState</gu)).toHaveLength(2);
    expect(source).toContain("const [frame, setFrame] = useState<Frame | null>(null);");
    expect(source).not.toMatch(/useRef/u);
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
    expect(wrapper).toContain("--trail-line: 55%");
    expect(rule('.operation-trail[data-strength="operating"]')).toContain("--trail-line: 80%");
    const path = rule(".operation-trail__path");
    expect(path).toContain("stroke-width: 1.75px");
    expect(path).toContain("stroke-linecap: round");
    expect(path).toContain("stroke-linejoin: round");
    expect(path).toContain("vector-effect: non-scaling-stroke");
    expect(path).toContain("var(--ink) var(--trail-line)");
  });

  it("draws everything below the selected passage a little lighter than the path above it", () => {
    expect(rule(".operation-trail__path--down, .operation-trail__dots--down, .operation-trail__arrows--down")).toContain("opacity: .85");
  });

  it("sizes dots, target and ring in screen pixels, and the ring by strength", () => {
    expect(rule(".operation-trail__dots")).toContain("stroke-width: 7px");
    expect(rule(".operation-trail__dots")).toContain("stroke-linecap: round");
    expect(rule(".operation-trail__bead")).toContain("width: 11px; height: 11px;");
    expect(rule(".operation-trail__bead::before")).toContain("inset: -4.5px;");
    expect(rule(".operation-trail")).toContain("--trail-ring: 8%");
    expect(rule('.operation-trail[data-strength="operating"]')).toContain("--trail-ring: 14%");
    expect(rule('.operation-trail[data-strength="operating"][data-working]')).toContain("--trail-ring: 20%");
    expect(rule('.operation-trail[data-strength="operating"]')).toContain("--trail-target: 95%");
  });

  it("draws in CanvasText under forced colours", () => {
    expect(css).toMatch(/forced-colors: active\)\s*\{[\s\S]*?\.operation-trail__path, \.operation-trail__dots, \.operation-trail__more \{ stroke: CanvasText; \}/u);
    expect(css).toMatch(/\.operation-trail__arrows \{ fill: CanvasText; \}/u);
    expect(css).toMatch(/\.operation-trail__bead \{[^}]*background: CanvasText;/u);
  });
});
