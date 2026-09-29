import type { DocumentGeneration } from "./document-generation-channel";
import type { StoredGenerationDecision } from "./persistence-controller";

export type StoredGenerationWatchEnvironment = Readonly<{
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Readonly<{
    visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  }>;
}>;

/** What applying a newer row did: nothing newer, applied, or not idle any more. */
export type StoredRefreshOutcome = "none" | "applied" | "deferred";

export type StoredGenerationWatchPort = Readonly<{
  /** The first load has been reconciled; earlier signals are meaningless. */
  ready(): boolean;
  observe(generation: DocumentGeneration): StoredGenerationDecision;
  check(): Promise<StoredGenerationDecision>;
  /** Reads and applies the newer row, asking `stillIdle` again before it hydrates. */
  refresh(stillIdle: () => boolean): Promise<StoredRefreshOutcome>;
}>;

export type StoredGenerationWatch = Readonly<{
  receive(generation: DocumentGeneration): void;
  setMaterialIdle(idle: boolean): void;
  dispose(): void;
}>;

/**
 * Meets rows other tabs commit: from their broadcast, and from one read when
 * this page becomes visible again or returns from the back-forward cache (a
 * frozen page misses broadcasts). A newer row replaces this tab's material only
 * while nothing here is in progress (`setMaterialIdle`) and, when visible, no
 * pointer is down; a hidden tab waits for the same idleness. A refresh asked
 * for while another runs is applied after it.
 *
 * A pointer whose release never arrives cannot pin the wait forever: window
 * blur, a lost capture with no button held, or a move with no button held all
 * end it, as the delivery window for AI results does.
 */
export function createStoredGenerationWatch(
  environment: StoredGenerationWatchEnvironment,
  port: StoredGenerationWatchPort,
): StoredGenerationWatch {
  const { document: page, window: view } = environment;
  const pointers = new Set<number>();
  let refreshWanted = false;
  let refreshing = false;
  let materialIdle = false;
  let disposed = false;

  const hidden = () => page.visibilityState === "hidden";
  const canApply = () => !disposed && materialIdle && (hidden() || pointers.size === 0);
  const attempt = () => {
    if (!refreshWanted || refreshing || !canApply()) return;
    refreshWanted = false;
    refreshing = true;
    void port.refresh(canApply).then(
      (outcome) => {
        if (outcome === "deferred") refreshWanted = true;
      },
      () => undefined,
    ).finally(() => {
      refreshing = false;
      attempt();
    });
  };
  const handle = (decision: StoredGenerationDecision) => {
    if (disposed || decision !== "refresh") return;
    refreshWanted = true;
    attempt();
  };
  const check = () => {
    if (!disposed && port.ready()) void port.check().then(handle, () => undefined);
  };

  const onVisibility = () => {
    if (hidden()) {
      pointers.clear();
      attempt();
    } else {
      check();
    }
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) check();
  };
  const onPointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
  };
  const releasePointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    attempt();
  };
  const onLostCapture = (event: PointerEvent) => {
    if (event.buttons === 0) releasePointer(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.buttons !== 0 || pointers.size === 0) return;
    pointers.clear();
    attempt();
  };
  const onBlur = () => {
    pointers.clear();
    attempt();
  };
  const windowListeners: readonly (readonly [string, EventListener])[] = [
    ["pageshow", onPageShow as EventListener],
    ["pointerdown", onPointerDown as EventListener],
    ["pointerup", releasePointer as EventListener],
    ["pointercancel", releasePointer as EventListener],
    ["lostpointercapture", onLostCapture as EventListener],
    ["pointermove", onPointerMove as EventListener],
    ["blur", onBlur as EventListener],
  ];
  page.addEventListener("visibilitychange", onVisibility);
  for (const [type, listener] of windowListeners) view.addEventListener(type, listener, true);

  return Object.freeze({
    receive(generation) {
      if (!disposed && port.ready()) handle(port.observe(generation));
    },
    setMaterialIdle(idle) {
      materialIdle = idle;
      attempt();
    },
    dispose() {
      disposed = true;
      pointers.clear();
      page.removeEventListener("visibilitychange", onVisibility);
      for (const [type, listener] of windowListeners) view.removeEventListener(type, listener, true);
    },
  });
}
