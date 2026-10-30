"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { MATTER_BUILD_ID } from "../config/build-identity";
import { createDeploymentVersionWatch, readDeploymentVersion, type DeploymentVersion } from "../interaction/deployment-version-watch";

/**
 * Loaded through a dynamic import from MatterApp: the observer and the watch
 * module behind it must stay out of the initial deployment bundle, whose
 * frozen gzip budget a platform build id otherwise pushes over the cap.
 */
export function DeploymentVersionWatcher(options: Readonly<{
  idle: boolean;
  onVersion: (version: DeploymentVersion) => void;
}>): null {
  useDeploymentVersionLifecycle(options.idle, options.onVersion);
  return null;
}

export function useDeploymentVersionLifecycle(idle: boolean, onVersion: (version: DeploymentVersion) => void): void {
  const idleRef = useRef(idle);
  const watcherRef = useRef<ReturnType<typeof createDeploymentVersionWatch> | null>(null);
  const checkClockRef = useRef({ lastAttempt: Number.NEGATIVE_INFINITY });
  useLayoutEffect(() => {
    idleRef.current = idle;
    watcherRef.current?.setIdle(idle);
  }, [idle]);
  useEffect(() => {
    if (MATTER_BUILD_ID === null) return;
    let entered = true;
    const watcher = createDeploymentVersionWatch({
      buildId: MATTER_BUILD_ID,
      clock: checkClockRef.current,
      read: (id, signal) => readDeploymentVersion(id, { signal }),
      publish: onVersion,
      host: {
        now: () => performance.now(),
        isAvailable: () => entered && document.visibilityState === "visible" && document.hasFocus() && navigator.onLine,
        subscribe(demand, suspend) {
          const hide = () => { entered = false; suspend(); };
          const show = () => { entered = true; demand(); };
          const availability = () => {
            if (document.visibilityState !== "visible" || !document.hasFocus() || !navigator.onLine) suspend();
            else demand();
          };
          for (const event of ["focus", "blur", "online", "offline"]) window.addEventListener(event, availability);
          window.addEventListener("pagehide", hide);
          window.addEventListener("pageshow", show);
          document.addEventListener("visibilitychange", availability);
          return () => {
            for (const event of ["focus", "blur", "online", "offline"]) window.removeEventListener(event, availability);
            window.removeEventListener("pagehide", hide);
            window.removeEventListener("pageshow", show);
            document.removeEventListener("visibilitychange", availability);
          };
        },
      },
    });
    watcherRef.current = watcher;
    watcher.setIdle(idleRef.current);
    return () => {
      watcher.dispose();
      watcherRef.current = null;
    };
  }, [onVersion]);
}

// Capability identity for the runtime-artifact budget checker; the property
// keeps the export alive through tree shaking and marks this module as the
// single source owner of the deployment-version capability.
Object.defineProperty(DeploymentVersionWatcher, "matterCapability", {
  value: "matter-capability:deployment-version",
});
