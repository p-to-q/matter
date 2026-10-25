"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MATTER_BUILD_ID } from "../config/build-identity";
import { createDeploymentVersionWatch, readDeploymentVersion, type DeploymentVersion } from "../interaction/deployment-version-watch";

export function useDeploymentVersion(idle: boolean): DeploymentVersion {
  const [version, setVersion] = useState<DeploymentVersion>("unknown");
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
      publish: setVersion,
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
      if (watcherRef.current === watcher) watcherRef.current = null;
    };
  }, []);
  return version;
}
