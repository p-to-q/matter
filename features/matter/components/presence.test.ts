import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advancePresence,
  advanceSettledStatus,
  createTimedStore,
  emptySettledStatus,
  PRESENCE_TIMING,
  presenceReservesSpace,
  projectPresence,
  projectSettledStatus,
  settledStatusDeadline,
  syncPresence,
  syncSettledStatus,
  type PresenceClose,
  type PresenceLive,
  type PresencePolicy,
  type PresenceState,
  type SettledStatus,
} from "./presence";

const MOTION: PresencePolicy = { minVisibleMs: 400, exitMs: 140 };
const REDUCED: PresencePolicy = { minVisibleMs: 400, exitMs: 0 };

function live(view: string, identity = "voice_1"): PresenceLive<string> {
  return { identity, view };
}

function shownAt(ms: number, view = "Listening"): PresenceState<string> {
  return syncPresence(null, live(view), "preempted", ms, MOTION);
}

describe("surface presence", () => {
  it("enters present at once and follows live content without a new first paint", () => {
    const entered = shownAt(1_000);
    expect(entered).toMatchObject({ stage: "present", view: "Listening", shownAtMs: 1_000 });
    const updated = syncPresence(entered, live("Listening, a partial"), "finished", 1_050, MOTION);
    expect(updated).toMatchObject({ stage: "present", view: "Listening, a partial", shownAtMs: 1_000 });
    expect(syncPresence(updated, live("Listening, a partial"), "finished", 1_060, MOTION))
      .toBe(updated);
  });

  it("holds a surface that closed because work finished for at least 400 ms after first paint", () => {
    const entered = shownAt(1_000, "Placing the thought");
    const holding = syncPresence(entered, null, "finished", 1_120, MOTION);
    expect(holding).toMatchObject({
      stage: "holding",
      view: "Placing the thought",
      close: "finished",
      deadlineMs: 1_400,
    });
    expect(advancePresence(holding, 1_399, MOTION)).toBe(holding);
    const exiting = advancePresence(holding, 1_400, MOTION);
    expect(exiting).toMatchObject({ stage: "exiting", close: "finished", deadlineMs: 1_540 });
    expect(advancePresence(exiting, 1_539, MOTION)).toBe(exiting);
    expect(advancePresence(exiting, 1_540, MOTION)).toBeNull();
  });

  it("starts the exit at once when a finished surface has already been seen long enough", () => {
    const exiting = syncPresence(shownAt(1_000), null, "finished", 5_000, MOTION);
    expect(exiting).toMatchObject({ stage: "exiting", deadlineMs: 5_140 });
  });

  it("lets the person's own close skip the hold", () => {
    const exiting = syncPresence(shownAt(1_000), null, "person", 1_010, MOTION);
    expect(exiting).toMatchObject({ stage: "exiting", close: "person", deadlineMs: 1_150 });
  });

  it("cuts a preempted surface at 0 ms", () => {
    expect(syncPresence(shownAt(1_000), null, "preempted", 1_010, MOTION)).toBeNull();
    const holding = syncPresence(shownAt(1_000), null, "finished", 1_010, MOTION);
    expect(syncPresence(holding, null, "preempted", 1_020, MOTION)).toBeNull();
    const exiting = syncPresence(shownAt(1_000), null, "person", 1_010, MOTION);
    expect(syncPresence(exiting, null, "preempted", 1_020, MOTION)).toBeNull();
  });

  it.each([
    ["holding", "finished"],
    ["exiting", "person"],
  ] as const)("reverses a %s surface when the same identity returns", (stage, close) => {
    const leaving = syncPresence(shownAt(1_000), null, close, 1_010, MOTION);
    expect(leaving?.stage).toBe(stage);
    const reversed = syncPresence(leaving, live("Record again"), close, 1_050, MOTION);
    expect(reversed).toEqual({
      identity: "voice_1",
      stage: "present",
      view: "Record again",
      shownAtMs: 1_000,
      close: null,
      deadlineMs: null,
    });
  });

  it("replaces a leaving surface immediately when another identity arrives", () => {
    const exiting = syncPresence(shownAt(1_000), null, "person", 1_010, MOTION);
    const next = syncPresence(exiting, live("Waiting", "voice_2"), "person", 1_020, MOTION);
    expect(next).toMatchObject({ identity: "voice_2", stage: "present", shownAtMs: 1_020 });
  });

  it("removes motion but keeps the hold under reduced motion", () => {
    expect(syncPresence(shownAt(1_000), null, "person", 1_010, REDUCED)).toBeNull();
    const holding = syncPresence(shownAt(1_000), null, "finished", 1_010, REDUCED);
    expect(holding).toMatchObject({ stage: "holding", deadlineMs: 1_400 });
    expect(advancePresence(holding, 1_400, REDUCED)).toBeNull();
    expect(syncPresence(shownAt(1_000), null, "finished", 1_500, REDUCED)).toBeNull();
  });

  it("projects a frozen frame in the same render the live value disappears", () => {
    const present = shownAt(1_000);
    expect(projectPresence(present, live("new partial"), "finished")).toEqual({
      identity: "voice_1",
      stage: "present",
      view: "new partial",
      close: null,
    });
    expect(projectPresence(present, null, "preempted")).toBeNull();
    const frozen = projectPresence(present, null, "finished");
    expect(frozen).toEqual({ identity: "voice_1", stage: "holding", view: "Listening", close: "finished" });
    expect(presenceReservesSpace(frozen)).toBe(false);
    expect(presenceReservesSpace(projectPresence(present, null, "person"))).toBe(true);
    expect(presenceReservesSpace(projectPresence(present, live("x"), "finished"))).toBe(true);
    expect(presenceReservesSpace(null)).toBe(false);
  });
});

describe("settled status labels", () => {
  const scope = "voice_1";
  function sync(
    state: SettledStatus<string>,
    value: string | null,
    urgent: boolean,
    nowMs: number,
    nextScope: string | null = scope,
  ) {
    return syncSettledStatus(
      state,
      { scope: nextScope, value, urgent, lingers: value !== "error" },
      nowMs,
    );
  }

  it("never paints a system label that lasts less than 150 ms", () => {
    const requesting = sync(emptySettledStatus(), "requesting", false, 0);
    expect(requesting.shown).toBeNull();
    expect(settledStatusDeadline(requesting)).toBe(150);
    // Permission was already granted: capture begins a frame later.
    const recording = sync(requesting, "recording", true, 16);
    expect(recording).toMatchObject({ shown: "recording", pending: null });
  });

  it("shows a system label that lasts, then keeps it at least 400 ms", () => {
    const requesting = sync(emptySettledStatus(), "transcribing", false, 0);
    const shown = advanceSettledStatus(requesting, 150);
    expect(shown).toMatchObject({ shown: "transcribing", shownAtMs: 150 });
    const committing = sync(shown, "committing", false, 200);
    expect(committing.shown).toBe("transcribing");
    expect(settledStatusDeadline(committing)).toBe(550);
    expect(advanceSettledStatus(committing, 549).shown).toBe("transcribing");
    expect(advanceSettledStatus(committing, 550).shown).toBe("committing");
  });

  it("lets urgent labels replace a shown label at once to stay honest", () => {
    const waiting = advanceSettledStatus(sync(emptySettledStatus(), "requesting", false, 0), 150);
    expect(sync(waiting, "recording", true, 170)).toMatchObject({ shown: "recording", shownAtMs: 170 });
    expect(sync(waiting, "error", true, 170).shown).toBe("error");
  });

  it("never keeps an error on screen after its recovery began", () => {
    const error = sync(emptySettledStatus(), "error", true, 0);
    // Record again: the permission label is still settling, the error is over.
    const retrying = sync(error, "requesting", false, 1_000);
    expect(retrying).toMatchObject({ shown: null, pending: "requesting" });
    expect(projectSettledStatus(error, {
      scope,
      value: "requesting",
      urgent: false,
      lingers: true,
    })).toBeNull();
    expect(advanceSettledStatus(retrying, 1_150).shown).toBe("requesting");
  });

  it("drops a pending label when the shown one becomes current again", () => {
    const shown = sync(emptySettledStatus(), "recording", true, 0);
    const pending = sync(shown, "stopping", false, 10);
    expect(pending.pending).toBe("stopping");
    expect(sync(pending, "recording", false, 20)).toMatchObject({ shown: "recording", pending: null });
  });

  it("starts a new surface without inheriting another surface's label", () => {
    const shown = sync(emptySettledStatus(), "recording", true, 0);
    const next = sync(shown, "requesting", false, 10, "voice_2");
    expect(next).toMatchObject({ scope: "voice_2", shown: null, pending: "requesting" });
    // Even the same key belongs to the old surface.
    const previousSurface = advanceSettledStatus(sync(emptySettledStatus(), "requesting", false, 0), 150);
    expect(projectSettledStatus(previousSurface, {
      scope: "voice_2",
      value: "requesting",
      urgent: false,
      lingers: true,
    })).toBeNull();
    expect(sync(shown, null, false, 10)).toEqual(emptySettledStatus());
  });

  it("projects the label a render may show before its layout-phase sync", () => {
    const shown = sync(emptySettledStatus(), "recording", true, 0);
    const input = (value: string | null, urgent: boolean) =>
      ({ scope, value, urgent, lingers: true });
    expect(projectSettledStatus(shown, input("stopping", true))).toBe("stopping");
    expect(projectSettledStatus(shown, input("transcribing", false))).toBe("recording");
    expect(projectSettledStatus(shown, input(null, false))).toBeNull();
  });
});

describe("timed presence store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function presenceStore(policy: PresencePolicy = MOTION) {
    const listener = vi.fn();
    const store = createTimedStore<PresenceState<string>>(null, {
      deadline: (state) => state?.deadlineMs ?? null,
      advance: (state, nowMs) => advancePresence(state, nowMs, policy),
      notifies: (previous, next) =>
        previous?.identity !== next?.identity || previous?.stage !== next?.stage,
      now: () => Date.now(),
    });
    store.subscribe(listener);
    const sync = (value: PresenceLive<string>, close: PresenceClose) =>
      store.update((state, nowMs) => syncPresence(state, value, close, nowMs, policy));
    return { listener, store, sync };
  }

  it("runs hold, exit, and unmount on one timer", async () => {
    const h = presenceStore();
    h.sync(live("Placing"), "finished");
    await vi.advanceTimersByTimeAsync(100);
    h.sync(null, "finished");
    expect(h.store.getState()?.stage).toBe("holding");
    await vi.advanceTimersByTimeAsync(299);
    expect(h.store.getState()?.stage).toBe("holding");
    await vi.advanceTimersByTimeAsync(1);
    expect(h.store.getState()?.stage).toBe("exiting");
    await vi.advanceTimersByTimeAsync(PRESENCE_TIMING.exitMs);
    expect(h.store.getState()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stores fresh live content silently and notifies only stage or identity changes", () => {
    const h = presenceStore();
    h.sync(live("a"), "finished");
    h.sync(live("ab"), "finished");
    h.sync(live("abc"), "finished");
    expect(h.store.getState()?.view).toBe("abc");
    expect(h.listener).toHaveBeenCalledTimes(1);
    h.sync(null, "person");
    expect(h.listener).toHaveBeenCalledTimes(2);
  });

  it("clears its timer on detach and re-arms it on a Strict Mode re-attach", async () => {
    const h = presenceStore();
    h.sync(live("Placing"), "finished");
    h.sync(null, "finished");
    h.store.detach();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.store.getState()?.stage).toBe("holding");

    h.store.attach();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.store.getState()?.stage).toBe("exiting");
    await vi.advanceTimersByTimeAsync(PRESENCE_TIMING.exitMs);
    expect(h.store.getState()).toBeNull();
  });

  it("cancels a pending exit when the surface reverses or is preempted", async () => {
    const reversed = presenceStore();
    reversed.sync(live("Retry"), "person");
    reversed.sync(null, "person");
    await vi.advanceTimersByTimeAsync(70);
    reversed.sync(live("Retry"), "person");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reversed.store.getState()?.stage).toBe("present");

    const preempted = presenceStore();
    preempted.sync(live("Placing"), "finished");
    preempted.sync(null, "finished");
    preempted.sync(null, "preempted");
    expect(preempted.store.getState()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the hold but skips the fade under reduced motion", async () => {
    const h = presenceStore(REDUCED);
    h.sync(live("Placing"), "finished");
    h.sync(null, "finished");
    await vi.advanceTimersByTimeAsync(399);
    expect(h.store.getState()?.stage).toBe("holding");
    await vi.advanceTimersByTimeAsync(1);
    expect(h.store.getState()).toBeNull();
  });
});
