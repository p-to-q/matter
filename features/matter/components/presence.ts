/**
 * Owns when a transient surface, and a status label inside it, may appear,
 * stay, and leave. Time enters only as values, so every rule here is a pure
 * function; the timed store below is the one place that reads a clock and owns
 * a timer. Motion itself is CSS: this module only decides stages.
 *
 * A surface is `present` while its live value exists. When the live value
 * goes away, the last content stays frozen: `holding` keeps a surface that
 * closed because work finished for at least `minVisibleMs` after it first
 * appeared, then `exiting` gives CSS `exitMs` to leave before unmount. A
 * person's own close skips the hold; a preemption cuts at once. A live value
 * returning under the same identity reverses to `present`; a new identity
 * replaces the old surface immediately, so two never coexist.
 */

export const PRESENCE_TIMING = Object.freeze({
  /** A system-changed status label must last this long before it appears. */
  statusDelayMs: 150,
  /** A shown label, or a surface closing because work finished, stays this long. */
  minVisibleMs: 400,
  /** CSS exit duration; zero under reduced motion. */
  exitMs: 140,
});

export type PresenceClose =
  /** The person closed it: Cancel, Dismiss, Escape, or an outside press. */
  | "person"
  /** The work it reported on finished. */
  | "finished"
  /** Another owner, modal, document, or hidden page took the surface. */
  | "preempted";

export type PresenceStage = "present" | "holding" | "exiting";

export type PresenceState<T> = Readonly<{
  identity: string;
  stage: PresenceStage;
  /** Live content while present; the frozen last live content otherwise. */
  view: T;
  shownAtMs: number;
  close: Exclude<PresenceClose, "preempted"> | null;
  deadlineMs: number | null;
}> | null;

export type PresenceLive<T> = Readonly<{ identity: string; view: T }> | null;

export type PresencePolicy = Readonly<{ minVisibleMs: number; exitMs: number }>;

export function syncPresence<T>(
  state: PresenceState<T>,
  live: PresenceLive<T>,
  close: PresenceClose,
  nowMs: number,
  policy: PresencePolicy,
): PresenceState<T> {
  if (live !== null) {
    if (state === null || state.identity !== live.identity) {
      return Object.freeze({
        identity: live.identity,
        stage: "present",
        view: live.view,
        shownAtMs: nowMs,
        close: null,
        deadlineMs: null,
      });
    }
    if (state.stage === "present" && state.view === live.view) return state;
    // Same identity: an update while present, or a reversal while leaving.
    return Object.freeze({ ...state, stage: "present", view: live.view, close: null, deadlineMs: null });
  }
  if (state === null || close === "preempted") return null;
  if (state.stage !== "present") return state;
  if (close === "person") return beginExit(state, "person", nowMs, policy);
  const holdUntilMs = state.shownAtMs + policy.minVisibleMs;
  return nowMs < holdUntilMs
    ? Object.freeze({ ...state, stage: "holding", close: "finished", deadlineMs: holdUntilMs })
    : beginExit(state, "finished", nowMs, policy);
}

export function advancePresence<T>(
  state: PresenceState<T>,
  nowMs: number,
  policy: PresencePolicy,
): PresenceState<T> {
  if (state === null || state.deadlineMs === null || nowMs < state.deadlineMs) return state;
  if (state.stage === "holding") return beginExit(state, state.close ?? "finished", nowMs, policy);
  return state.stage === "exiting" ? null : state;
}

/** What one render shows. */
export type PresenceFrame<T> = Readonly<{
  identity: string;
  stage: PresenceStage;
  view: T;
  close: Exclude<PresenceClose, "preempted"> | null;
}> | null;

/**
 * The frame a render may show before the layout-phase sync catches up. A live
 * value always renders present with its live content; a surface whose live
 * value just went away renders frozen at once, or not at all when preempted.
 */
export function projectPresence<T>(
  state: PresenceState<T>,
  live: PresenceLive<T>,
  close: PresenceClose,
): PresenceFrame<T> {
  if (live !== null) {
    return { identity: live.identity, stage: "present", view: live.view, close: null };
  }
  if (state === null || close === "preempted") return null;
  return state.stage === "present"
    ? { identity: state.identity, stage: "holding", view: state.view, close }
    : { identity: state.identity, stage: state.stage, view: state.view, close: state.close };
}

/** Whether a leaving surface still owns the layout space it reserved. */
export function presenceReservesSpace(frame: PresenceFrame<unknown>): boolean {
  // Work that finished releases its space as the exit starts, so material it
  // produced never moves after first paint; a person's close keeps the space
  // until unmount so the only jump happens after the surface is invisible.
  return frame !== null && frame.close !== "finished";
}

function beginExit<T>(
  state: NonNullable<PresenceState<T>>,
  close: Exclude<PresenceClose, "preempted">,
  nowMs: number,
  policy: PresencePolicy,
): PresenceState<T> {
  if (policy.exitMs <= 0) return null;
  return Object.freeze({ ...state, stage: "exiting", close, deadlineMs: nowMs + policy.exitMs });
}

export type SettledStatus<K> = Readonly<{
  /** The surface identity these labels belong to. */
  scope: string | null;
  shown: K | null;
  shownAtMs: number | null;
  shownLingers: boolean;
  pending: K | null;
  pendingSinceMs: number | null;
  pendingLingers: boolean;
}>;

export type SettledStatusInput<K> = Readonly<{
  scope: string | null;
  value: K | null;
  /** Live capture, the person's own action, or an error. */
  urgent: boolean;
  /**
   * Whether this label stays true enough to remain while a later system label
   * settles. Progress may; an error no longer applies once its recovery began.
   */
  lingers: boolean;
}>;

const EMPTY_STATUS: SettledStatus<never> = Object.freeze({
  scope: null,
  shown: null,
  shownAtMs: null,
  shownLingers: false,
  pending: null,
  pendingSinceMs: null,
  pendingLingers: false,
});

export function emptySettledStatus<K>(): SettledStatus<K> {
  return EMPTY_STATUS;
}

/**
 * Settles which status label is shown. An urgent label replaces the shown one
 * at once, because the label must stay honest about what the system is doing
 * to the person. A system-changed label waits `statusDelayMs` so a phase that
 * lasts a frame is never painted, and never replaces a label shown for less
 * than `minVisibleMs`; until then the previous label stays if it lingers, and
 * nothing is shown if it does not. A new scope starts empty, so one surface
 * never inherits another's label.
 */
export function syncSettledStatus<K>(
  state: SettledStatus<K>,
  input: SettledStatusInput<K>,
  nowMs: number,
  timing: Readonly<{ statusDelayMs: number; minVisibleMs: number }> = PRESENCE_TIMING,
): SettledStatus<K> {
  const { scope, value, urgent, lingers } = input;
  if (value === null || scope === null) return EMPTY_STATUS;
  const current = state.scope === scope ? state : Object.freeze({ ...EMPTY_STATUS, scope });
  if (value === current.shown) {
    return current.pending === null
      ? current
      : Object.freeze({ ...current, pending: null, pendingSinceMs: null, pendingLingers: false });
  }
  if (urgent) {
    return Object.freeze({
      scope,
      shown: value,
      shownAtMs: nowMs,
      shownLingers: lingers,
      pending: null,
      pendingSinceMs: null,
      pendingLingers: false,
    });
  }
  const kept = current.shown === null || current.shownLingers
    ? current
    : Object.freeze({ ...current, shown: null, shownAtMs: null, shownLingers: false });
  const waiting = value === kept.pending
    ? kept
    : Object.freeze({ ...kept, pending: value, pendingSinceMs: nowMs, pendingLingers: lingers });
  return advanceSettledStatus(waiting, nowMs, timing);
}

/** The label one render shows before the layout-phase sync catches up. */
export function projectSettledStatus<K>(
  state: SettledStatus<K>,
  input: SettledStatusInput<K>,
): K | null {
  if (input.value === null || input.scope === null) return null;
  if (input.urgent) return input.value;
  if (state.scope !== input.scope) return null;
  if (input.value === state.shown) return input.value;
  return state.shownLingers ? state.shown : null;
}

export function advanceSettledStatus<K>(
  state: SettledStatus<K>,
  nowMs: number,
  timing: Readonly<{ statusDelayMs: number; minVisibleMs: number }> = PRESENCE_TIMING,
): SettledStatus<K> {
  const deadline = settledStatusDeadline(state, timing);
  if (deadline === null || nowMs < deadline) return state;
  return Object.freeze({
    scope: state.scope,
    shown: state.pending,
    shownAtMs: nowMs,
    shownLingers: state.pendingLingers,
    pending: null,
    pendingSinceMs: null,
    pendingLingers: false,
  });
}

export function settledStatusDeadline<K>(
  state: SettledStatus<K>,
  timing: Readonly<{ statusDelayMs: number; minVisibleMs: number }> = PRESENCE_TIMING,
): number | null {
  if (state.pending === null || state.pendingSinceMs === null) return null;
  const settled = state.pendingSinceMs + timing.statusDelayMs;
  return state.shown === null || state.shownAtMs === null
    ? settled
    : Math.max(settled, state.shownAtMs + timing.minVisibleMs);
}

export type PresenceHandoffRecord<T> = Readonly<{
  identity: string;
  /** Live content while the owner shows it; null before first paint or after release. */
  view: T | null;
  /** The owner's final content, kept for the frozen exit. */
  lastView: T | null;
  /** How the released surface left; `preempted` unless its closer said otherwise. */
  close: PresenceClose;
}> | null;

export type PresenceHandoff<T> = Readonly<{
  getSnapshot: () => PresenceHandoffRecord<T>;
  subscribe: (listener: () => void) => () => void;
  /** A surface mounted; any other surface's exit is preempted by it. */
  enter: (identity: string) => void;
  show: (identity: string, view: T) => void;
  /** Declares how the next release of `identity` leaves. */
  intend: (identity: string, close: Exclude<PresenceClose, "preempted">) => void;
  release: (identity: string, finalView: T | null) => void;
  /** Another owner took the slot: cut any exit and ignore the pending release. */
  preempt: () => void;
}>;

/**
 * Lets a live owner that unmounts at its close hand its last content to a
 * presence host that outlives it. The owner's effects, listeners, and focus
 * leave with the owner; the host renders only the frozen copy. A close is a
 * preemption unless the closer declared otherwise before the release.
 */
export function createPresenceHandoff<T>(): PresenceHandoff<T> {
  const listeners = new Set<() => void>();
  let record: PresenceHandoffRecord<T> = null;
  let intent: Readonly<{ identity: string; close: PresenceClose }> | null = null;
  const publish = (next: PresenceHandoffRecord<T>) => {
    record = next;
    for (const listener of [...listeners]) listener();
  };
  const enter = (identity: string) => {
    if (record?.identity === identity) return;
    intent = null;
    publish(Object.freeze({ identity, view: null, lastView: null, close: "preempted" }));
  };
  return Object.freeze({
    getSnapshot: () => record,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter,
    show: (identity: string, view: T) => {
      enter(identity);
      if (record === null || (record.view === view && record.close === "preempted")) return;
      publish(Object.freeze({ identity, view, lastView: view, close: "preempted" }));
    },
    intend: (identity: string, close: Exclude<PresenceClose, "preempted">) => {
      intent = Object.freeze({ identity, close });
    },
    release: (identity: string, finalView: T | null) => {
      if (record === null || record.identity !== identity) return;
      const close = intent?.identity === identity ? intent.close : "preempted";
      intent = null;
      publish(Object.freeze({
        identity,
        view: null,
        lastView: finalView ?? record.lastView,
        close,
      }));
    },
    preempt: () => {
      intent = null;
      if (record !== null) publish(null);
    },
  });
}

export type TimedStore<S> = Readonly<{
  getState: () => S;
  subscribe: (listener: () => void) => () => void;
  /** Applies one pure transition at the current time and arms its deadline. */
  update: (transition: (state: S, nowMs: number) => S) => void;
  /** Re-arms a pending deadline; React Strict Mode may detach and re-attach. */
  attach: () => void;
  /** Clears the timer without touching state; idempotent. */
  detach: () => void;
}>;

/**
 * The single clock and timer owner for one presence or status value.
 * `notifies` lets a caller store a change silently when no render depends on
 * it, such as fresh live content that is rendered from props anyway.
 */
export function createTimedStore<S>(initial: S, options: Readonly<{
  deadline: (state: S) => number | null;
  advance: (state: S, nowMs: number) => S;
  notifies?: (previous: S, next: S) => boolean;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}>): TimedStore<S> {
  const now = options.now ?? (() => performance.now());
  const setTimer = options.setTimer ??
    ((callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ??
    ((timer: unknown) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>));
  const notifies = options.notifies ?? ((previous: S, next: S) => previous !== next);
  const listeners = new Set<() => void>();
  let state = initial;
  let timer: unknown = null;
  let attached = true;

  const disarm = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };
  const commit = (next: S) => {
    const previous = state;
    state = next;
    arm();
    if (!notifies(previous, next)) return;
    for (const listener of [...listeners]) listener();
  };
  const arm = () => {
    disarm();
    if (!attached) return;
    const deadline = options.deadline(state);
    if (deadline === null) return;
    timer = setTimer(() => {
      timer = null;
      commit(options.advance(state, now()));
    }, Math.max(0, deadline - now()));
  };

  return Object.freeze({
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (transition: (current: S, nowMs: number) => S) => {
      const next = transition(state, now());
      if (next !== state) commit(next);
    },
    attach: () => {
      attached = true;
      arm();
    },
    detach: () => {
      attached = false;
      disarm();
    },
  });
}
