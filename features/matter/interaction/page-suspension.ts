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
