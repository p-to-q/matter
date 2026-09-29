"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createStoragePersistence } from "./storage-persistence";

/**
 * Reads whether this origin's storage is persistent once, without prompting,
 * and exposes the one request an explicit Export, Retry, or Replace gesture
 * may make. `request` must be called synchronously inside that gesture.
 */
export function useStoragePersistence() {
  const [storage] = useState(() => createStoragePersistence());
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void storage.persisted().then((value) => {
      if (active) setPersisted(value);
    });
    return () => {
      active = false;
    };
  }, [storage]);

  const request = useCallback(() => {
    void storage.request().then((value) => {
      if (value !== null) setPersisted(value);
    });
  }, [storage]);

  return useMemo(() => Object.freeze({ persisted, request }), [persisted, request]);
}
