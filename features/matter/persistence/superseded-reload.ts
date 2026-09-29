export type SupersededReloadEnvironment = Readonly<{
  document: Readonly<{
    visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  }>;
  reload(): void;
  /** Survives the reload; `null` where the browser refuses session storage. */
  session: Pick<Storage, "getItem" | "setItem"> | null;
  now(): number;
}>;

export type SupersededReloadInput = Readonly<{
  superseded: boolean;
  unsaved: boolean;
  /** No admission, AI turn, draft, name editor, or question is in progress. */
  materialIdle: boolean;
}>;

export type SupersededReload = Readonly<{
  update(input: SupersededReloadInput): void;
  dispose(): void;
}>;

const LAST_RELOAD_KEY = "matter.superseded-reload.v1";
/** A second automatic reload inside this window would be a loop, not an update. */
export const SUPERSEDED_RELOAD_LOOP_MS = 60_000;

/**
 * Moves a tab onto the newer Matter only when nothing can be lost and nobody
 * is looking: nothing unsaved, no work in progress, and the page hidden. A
 * visible tab keeps the durability line and the Archive's Reload. One reload
 * per loop window, remembered across the reload itself, so an older build
 * served again cannot reload forever; without session storage it never reloads
 * by itself.
 */
export function createSupersededReload(
  environment: SupersededReloadEnvironment,
  loopWindowMs = SUPERSEDED_RELOAD_LOOP_MS,
): SupersededReload {
  let input: SupersededReloadInput = { superseded: false, unsaved: true, materialIdle: false };
  let reloading = false;
  const recentlyReloaded = (): boolean => {
    if (environment.session === null) return true;
    try {
      const last = Number(environment.session.getItem(LAST_RELOAD_KEY));
      return Number.isFinite(last) && last > 0 && environment.now() - last < loopWindowMs;
    } catch {
      return true;
    }
  };
  const attempt = () => {
    if (
      reloading ||
      !input.superseded ||
      input.unsaved ||
      !input.materialIdle ||
      environment.document.visibilityState !== "hidden" ||
      recentlyReloaded()
    ) return;
    try {
      environment.session?.setItem(LAST_RELOAD_KEY, String(environment.now()));
    } catch {
      return;
    }
    reloading = true;
    environment.reload();
  };
  environment.document.addEventListener("visibilitychange", attempt);
  return Object.freeze({
    update(next) {
      input = next;
      attempt();
    },
    dispose() {
      environment.document.removeEventListener("visibilitychange", attempt);
    },
  });
}
