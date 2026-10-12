import type { PresenceClose, PresencePolicy } from "./presence";
import type { TrailStrength } from "./operation-target";

/**
 * When the canvas trail comes and goes. It fades in over `enterMs`, changes
 * weight between the selected and operating strengths over `weightMs` without
 * remounting, and leaves by one of the ways below. The CSS durations in
 * `app/globals.css` repeat these numbers and a test keeps them equal.
 */
export const OPERATION_TRAIL_TIMING = Object.freeze({
  enterMs: 120,
  weightMs: 120,
  exitMs: Object.freeze({
    /** A result landed or the person kept it: the success motion owns emphasis. */
    finished: 160,
    /** Selection cleared, Esc, cancel, a lasso, focus view. */
    person: 100,
    yielded: 100,
    /** The passage vanished or the operation went stale. */
    invalidated: 100,
  }),
});

/** Nothing holds the trail past its cause; reduced motion removes the fade. */
export function trailPresencePolicy(reducedMotion: boolean): PresencePolicy {
  const exitMs = OPERATION_TRAIL_TIMING.exitMs;
  const scaled = (ms: number) => reducedMotion ? 0 : ms;
  return Object.freeze({
    holdMs: Object.freeze({ person: 0, finished: 0, yielded: 0, invalidated: 0 }),
    exitMs: Object.freeze({
      person: scaled(exitMs.person),
      finished: scaled(exitMs.finished),
      yielded: scaled(exitMs.yielded),
      invalidated: scaled(exitMs.invalidated),
    }),
  });
}

/**
 * How a trail that is no longer live leaves. Geometry from another layout epoch
 * is cut at once, so it can never be seen trailing the passages it joined; a
 * passage that is gone, or an operation gone stale, leaves quickly; a result
 * that landed steps back a little more slowly; everything else is the person
 * moving on.
 */
export function trailClose(input: Readonly<{
  layoutCurrent: boolean;
  /** Whether the passage the trail was last joined to still exists. */
  passageExists: boolean;
  lastStrength: TrailStrength;
  pointTalkPhase: string;
}>): PresenceClose {
  if (!input.layoutCurrent) return "preempted";
  if (!input.passageExists || input.pointTalkPhase === "stale") return "invalidated";
  return input.lastStrength === "operating" ? "finished" : "person";
}
