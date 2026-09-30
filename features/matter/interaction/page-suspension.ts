"use client";

/**
 * Binds transient browser work to the page's usable lifetime. Browsers do not
 * guarantee that hidden documents will promptly suspend microphone, workers,
 * or fetch, so each focused lifecycle still owns its own idempotent release.
 */
export function subscribePageSuspension(
  onSuspend: () => void,
  onResume?: () => void,
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }
  const pageWindow = window;
  const pageDocument = document;
  let suspended = false;
  const suspend = () => {
    if (suspended) return;
    suspended = true;
    onSuspend();
  };
  const resume = () => {
    if (pageDocument.visibilityState === "hidden" || !suspended) return;
    suspended = false;
    onResume?.();
  };
  const syncVisibility = () => {
    if (pageDocument.visibilityState === "hidden") suspend();
    else resume();
  };
  pageWindow.addEventListener("pagehide", suspend);
  pageWindow.addEventListener("pageshow", resume);
  pageDocument.addEventListener("visibilitychange", syncVisibility);
  // A hook may mount after the document was hidden. Subscribe before the
  // synchronous check so a concurrent lifecycle signal is still coalesced.
  syncVisibility();
  return () => {
    pageWindow.removeEventListener("pagehide", suspend);
    pageWindow.removeEventListener("pageshow", resume);
    pageDocument.removeEventListener("visibilitychange", syncVisibility);
  };
}

/**
 * How the page was left. `persisted` means the browser kept it in the
 * back-forward cache: it may be shown again with its memory intact.
 */
export type PageExit = Readonly<{ persisted: boolean }>;

/**
 * Releases work only when the page itself leaves its usable lifetime. A hidden
 * tab is still allowed to finish bounded, non-recording network work; this is
 * intentionally narrower than subscribePageSuspension. The exit says whether
 * the page entered the back-forward cache, so an owner of something the
 * person already submitted can keep it for the page's return.
 */
export function subscribePageExit(onExit: (exit: PageExit) => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function" ||
    typeof window.removeEventListener !== "function"
  ) {
    return () => undefined;
  }
  const pageWindow = window;
  const onPageHide = (event: Event) => onExit(Object.freeze({
    persisted: (event as PageTransitionEvent).persisted === true,
  }));
  pageWindow.addEventListener("pagehide", onPageHide);
  return () => pageWindow.removeEventListener("pagehide", onPageHide);
}
