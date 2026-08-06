"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  CanvasPreferencesController,
  createBrowserCanvasPreferencesPort,
  type CanvasAppearance,
  type CanvasLanguage,
  type CanvasPreferencesSnapshot,
} from "./canvas-preferences";

export type CanvasPreferencesBinding = CanvasPreferencesSnapshot & Readonly<{
  setLanguage: (language: CanvasLanguage) => void;
  setLeafFx: (enabled: boolean) => void;
  setAppearance: (appearance: CanvasAppearance) => void;
}>;

export function useCanvasPreferences(): CanvasPreferencesBinding {
  const controller = useMemo(
    () => new CanvasPreferencesController(createBrowserCanvasPreferencesPort()),
    [],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.retain();
    return () => controller.release();
  }, [controller]);

  const setLanguage = useCallback(
    (language: CanvasLanguage) => controller.setLanguage(language),
    [controller],
  );
  const setLeafFx = useCallback(
    (enabled: boolean) => controller.setLeafFx(enabled),
    [controller],
  );
  const setAppearance = useCallback(
    (appearance: CanvasAppearance) => controller.setAppearance(appearance),
    [controller],
  );

  return useMemo(() => Object.freeze({
    ...snapshot,
    setLanguage,
    setLeafFx,
    setAppearance,
  }), [setAppearance, setLanguage, setLeafFx, snapshot]);
}
