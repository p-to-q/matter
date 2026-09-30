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
  /** `holdsUnsavedPersonMaterial`: material the person made that no row holds. */
  unsavedPersonMaterial: boolean;
  /** No admission, AI turn, draft, name editor, or question is in progress. */
  materialIdle: boolean;
}>;

export type SupersededReload = Readonly<{
  update(input: SupersededReloadInput): void;
  dispose(): void;
}>;

const LAST_RELOAD_KEY = "matter.superseded-reload.v2";
/** The first automatic reload's quiet window; each consecutive one doubles it. */
export const SUPERSEDED_RELOAD_LOOP_MS = 60_000;
/** The longest wait between automatic reloads that keep serving an older build. */
export const SUPERSEDED_RELOAD_MAX_BACKOFF_MS = 60 * 60_000;
/**
 * A reload this long after the previous one starts a new episode: the tab ran
 * a build that was not superseded in between, so the count starts again.
 */
const SUPERSEDED_RELOAD_EPISODE_MS = 2 * SUPERSEDED_RELOAD_MAX_BACKOFF_MS;

type ReloadRecord = Readonly<{ atMs: number; count: number }>;

/**
 * Moves a tab onto the newer Matter only when nothing can be lost and nobody
 * is looking: nothing the person made is unsaved, no work is in progress, and
 * the page is hidden. An untouched seed the older build could not save is not
 * a reason to stay on it. A visible tab keeps the durability line and the
 * Archive's Reload.
 *
 * A reload that serves the same older build again (a rolled-back deployment)
 * must not become a loop. Consecutive automatic reloads, remembered across the
 * reload itself, back off exponentially from one minute to at most one hour,
 * so a tab left hidden reaches a fixed deployment eventually while a broken one
 * costs a handful of background loads a day. Without session storage it never
 * reloads by itself.
 */
export function createSupersededReload(
  environment: SupersededReloadEnvironment,
  loopWindowMs = SUPERSEDED_RELOAD_LOOP_MS,
  maxBackoffMs = SUPERSEDED_RELOAD_MAX_BACKOFF_MS,
): SupersededReload {
  let input: SupersededReloadInput = { superseded: false, unsavedPersonMaterial: true, materialIdle: false };
  let reloading = false;
  /** `undefined`: storage cannot be read, so nothing may reload by itself. */
  const readRecord = (): ReloadRecord | null | undefined => {
    if (environment.session === null) return undefined;
    try {
      return parseRecord(environment.session.getItem(LAST_RELOAD_KEY));
    } catch {
      return undefined;
    }
  };
  const quietWindowMs = (count: number) =>
    Math.min(maxBackoffMs, loopWindowMs * 2 ** Math.min(Math.max(0, count - 1), 30));
  const attempt = () => {
    if (
      reloading ||
      !input.superseded ||
      input.unsavedPersonMaterial ||
      !input.materialIdle ||
      environment.document.visibilityState !== "hidden"
    ) return;
    const previous = readRecord();
    if (previous === undefined) return;
    const nowMs = environment.now();
    const sincePrevious = previous === null ? Number.POSITIVE_INFINITY : nowMs - previous.atMs;
    // A clock that moved backwards cannot prove the quiet window has passed.
    if (sincePrevious < 0 || (previous !== null && sincePrevious < quietWindowMs(previous.count))) return;
    const count = previous === null || sincePrevious >= SUPERSEDED_RELOAD_EPISODE_MS
      ? 1
      : previous.count + 1;
    try {
      environment.session?.setItem(LAST_RELOAD_KEY, JSON.stringify({ atMs: nowMs, count }));
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

/** A malformed record is treated as none; the next automatic reload rewrites it. */
function parseRecord(value: string | null): ReloadRecord | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" || parsed === null ||
      !Number.isSafeInteger((parsed as { atMs?: unknown }).atMs) ||
      !Number.isSafeInteger((parsed as { count?: unknown }).count) ||
      (parsed as { count: number }).count < 1
    ) return null;
    const { atMs, count } = parsed as { atMs: number; count: number };
    return Object.freeze({ atMs, count });
  } catch {
    return null;
  }
}
