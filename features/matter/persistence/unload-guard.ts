import type { PersistenceStatus } from "./persistence-controller";

export type UnloadGuardEnvironment = Readonly<{
  addEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
}>;

export type UnloadRisk = Readonly<{
  status: PersistenceStatus;
  /** The material differs from the seed this page started with. */
  materialDiverged: boolean;
}>;

export type UnloadGuard = Readonly<{
  update(risk: UnloadRisk): void;
  isArmed(): boolean;
  dispose(): void;
}>;

/** A save still in flight after this long puts unsaved material at risk. */
export const SLOW_SAVE_MS = 1_000;

/**
 * Owns the one `beforeunload` listener. It is attached only while material the
 * person made is at risk — refused by storage, still writing after
 * `SLOW_SAVE_MS`, or changed while stored material is still loading — and
 * removed the moment that ends, so ordinary navigation keeps the page eligible
 * for the back-forward cache. An untouched seed is never at risk: a browser
 * that blocks storage must not prompt on every exit.
 */
export function createUnloadGuard(
  environment: UnloadGuardEnvironment,
  slowSaveMs = SLOW_SAVE_MS,
): UnloadGuard {
  let armed = false;
  let slowTimer: number | null = null;
  let slowSaveReached = false;
  let risk: UnloadRisk | null = null;
  const guard = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Legacy engines still read the return value to show the prompt.
    event.returnValue = true;
  };
  const setArmed = (next: boolean) => {
    if (next === armed) return;
    armed = next;
    if (next) environment.addEventListener("beforeunload", guard);
    else environment.removeEventListener("beforeunload", guard);
  };
  const stopSlowTimer = () => {
    if (slowTimer !== null) environment.clearTimeout(slowTimer);
    slowTimer = null;
    slowSaveReached = false;
  };
  const evaluate = () => {
    if (risk === null || !risk.materialDiverged) {
      stopSlowTimer();
      setArmed(false);
      return;
    }
    const { status } = risk;
    if (status.phase !== "saving") stopSlowTimer();
    if (status.phase === "loading" || (status.unsaved && status.phase === "error")) {
      setArmed(true);
      return;
    }
    if (status.unsaved && status.phase === "saving") {
      if (!slowSaveReached && slowTimer === null) {
        slowTimer = environment.setTimeout(() => {
          slowTimer = null;
          slowSaveReached = true;
          evaluate();
        }, slowSaveMs);
      }
      setArmed(slowSaveReached);
      return;
    }
    setArmed(false);
  };
  return Object.freeze({
    update(next) {
      risk = next;
      evaluate();
    },
    isArmed: () => armed,
    dispose() {
      risk = null;
      evaluate();
    },
  });
}
