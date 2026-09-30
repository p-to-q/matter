import type { PersistenceStatus } from "./persistence-controller";

export type UnloadGuardEnvironment = Readonly<{
  addEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
}>;

export type UnloadRisk = Readonly<{
  phase: PersistenceStatus["phase"];
  /** `holdsUnsavedPersonMaterial`: material the person made that no row holds. */
  unsavedPersonMaterial: boolean;
  /**
   * Spoken words the person submitted that no material holds yet (in flight
   * after Stop, or held after a failed commit). No storage phase keeps them,
   * so they are at risk for as long as they exist.
   */
  unplacedSpokenWords: boolean;
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
 * person made is at risk — unsaved material refused by storage, still writing
 * after `SLOW_SAVE_MS`, or changed while stored material is still loading, or
 * spoken words submitted but not yet placed — and removed the moment that ends, so ordinary navigation keeps the page eligible
 * for the back-forward cache. Untouched material (the seed, a stored row, their
 * relocalization) is never at risk: a browser that blocks storage must not
 * prompt on every exit.
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
  /** Whether stored-material durability alone puts the person's work at risk. */
  const storageAtRisk = (): boolean => {
    if (risk === null || !risk.unsavedPersonMaterial) {
      stopSlowTimer();
      return false;
    }
    const { phase } = risk;
    if (phase !== "saving") stopSlowTimer();
    if (phase === "loading" || phase === "error") return true;
    if (phase !== "saving") return false;
    if (!slowSaveReached && slowTimer === null) {
      slowTimer = environment.setTimeout(() => {
        slowTimer = null;
        slowSaveReached = true;
        evaluate();
      }, slowSaveMs);
    }
    return slowSaveReached;
  };
  function evaluate() {
    const storage = storageAtRisk();
    setArmed(storage || risk?.unplacedSpokenWords === true);
  }
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
