"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { AdmissionAnchor as RuntimeAdmissionAnchor } from "../runtime/admission";
import {
  type AdmissionAnchor,
  type AdmissionInteractionState,
} from "../runtime/admission-interaction";
import type { MatterStoreReceipt } from "../store/matter-store";
import {
  AdmissionDriver,
  type AdmissionScope,
} from "./admission-driver";
import { createBrowserVoicePort } from "./browser-voice";
import { requestTranscription } from "./transcription-client";

export type UseAdmissionInput = {
  commit: (
    anchor: RuntimeAdmissionAnchor,
    values: {
      interactionId: string;
      commandId: string;
      nodeId: string;
      createdAt: string;
      transcript: string;
    },
  ) => MatterStoreReceipt;
  scope: AdmissionScope;
  locale?: string;
};

export type AdmissionController = {
  state: AdmissionInteractionState;
  start: (anchor: AdmissionAnchor) => void;
  stop: () => void;
  cancel: () => void;
  retry: () => void;
  dismiss: () => void;
};

export function useAdmission({
  commit,
  scope,
  locale = "zh-CN",
}: UseAdmissionInput): AdmissionController {
  const driver = useMemo(
    () => new AdmissionDriver({
      commit,
      createVoice: createBrowserVoicePort,
      transcribe: requestTranscription,
      createInteractionId,
      createMaterialId,
      canonicalNow,
      monotonicNow,
      locale,
    }),
    [commit, locale],
  );
  const subscribe = useCallback(
    (listener: () => void) => driver.subscribe(listener),
    [driver],
  );
  const getSnapshot = useCallback(() => driver.getState(), [driver]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    driver.updateScope({
      treeId: scope.treeId,
      revision: scope.revision,
    });
  }, [driver, scope.treeId, scope.revision]);

  useEffect(() => {
    driver.retain();
    return () => driver.release();
  }, [driver]);

  return {
    state,
    start: (anchor) => driver.start(anchor),
    stop: () => driver.stop(),
    cancel: () => driver.cancel(),
    retry: () => driver.retry(),
    dismiss: () => driver.dismiss(),
  };
}

function createInteractionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `voice_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function createMaterialId(): string {
  return `thought_${createInteractionId().replaceAll("-", "")}`;
}

function canonicalNow(): string {
  return new Date().toISOString();
}

function monotonicNow(): number {
  return performance.now();
}
