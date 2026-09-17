"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AdmissionAnchor as RuntimeAdmissionAnchor } from "../runtime/admission";
import type { MatterLocale } from "../config/locales";
import {
  type AdmissionAnchor,
  type AdmissionInteractionState,
} from "../runtime/admission-interaction";
import type {
  AdmissionRepairCommittedChange,
  AdmissionRepairSettlement,
  AdmissionRepairStoreReceipt,
  AdmissionStoreReceipt,
  MatterAdmissionValues,
} from "../store/matter-store";
import {
  AdmissionDriver,
  type AdmissionSettlement,
  type AdmissionScope,
} from "./admission-driver";
import { createBrowserVoicePort } from "./browser-voice";
import { afterBaselineVisible } from "./repair-presentation-gate";
import { createTranscriptRepairPort } from "./transcript-repair-port";
import { requestTranscription } from "./transcription-client";
import { useRepairPresentation } from "./use-repair-presentation";
import { subscribePageExit, subscribePageSuspension } from "./page-suspension";

export type UseAdmissionInput = {
  commit: (
    anchor: RuntimeAdmissionAnchor,
    values: MatterAdmissionValues,
  ) => AdmissionStoreReceipt;
  settleRepair: (settlement: AdmissionRepairSettlement) => AdmissionRepairStoreReceipt;
  scope: AdmissionScope;
  locale?: MatterLocale;
};

export type AdmissionController = {
  state: AdmissionInteractionState;
  settlement: AdmissionSettlement | null;
  repairPresentations: ReadonlyMap<string, AdmissionRepairCommittedChange>;
  start: (anchor: AdmissionAnchor) => void;
  stop: () => void;
  cancel: () => void;
  retry: () => void;
  dismiss: () => void;
  /** Gates canvas presentation without cancelling work submitted at Stop. */
  setPresentationAvailable: (available: boolean) => void;
  setDeliveryTargetVisible: (visible: boolean) => void;
  setDeliveryVisibleNodeIds: (nodeIds: ReadonlySet<string>) => void;
  clearRepairPresentations: () => void;
};

export function useAdmission({
  commit,
  settleRepair,
  scope,
  locale = "zh-CN",
}: UseAdmissionInput): AdmissionController {
  const repairPresentation = useRepairPresentation({
    treeId: scope.treeId,
    documentEpoch: scope.documentEpoch ?? 0,
  });
  const driver = useMemo(
    () => new AdmissionDriver({
      commit,
      settleRepair,
      onRepairCommitted: repairPresentation.publish,
      createVoice: createBrowserVoicePort,
      transcribe: requestTranscription,
      repair: createTranscriptRepairPort(),
      afterBaselineVisible,
      createInteractionId,
      createMaterialId,
      canonicalNow,
      monotonicNow,
      // Locale is captured for each attempt at start/retry. Keeping the driver
      // stable prevents a settings change from disposing a finalized job.
      locale: "zh-CN",
    }),
    [commit, settleRepair, repairPresentation.publish],
  );
  const subscribe = useCallback(
    (listener: () => void) => driver.subscribe(listener),
    [driver],
  );
  const getSnapshot = useCallback(() => driver.getState(), [driver]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setDeliveryVisibleNodeIds = useCallback(
    (nodeIds: ReadonlySet<string>) => driver.setDeliveryVisibleNodeIds(nodeIds),
    [driver],
  );
  const activePointersRef = useRef(new Set<number>());
  const presentationAvailableRef = useRef(true);
  const syncDeliveryWindow = useCallback(() => {
    driver.setDeliveryWindowOpen(
      presentationAvailableRef.current &&
        document.visibilityState === "visible" &&
        activePointersRef.current.size === 0,
    );
  }, [driver]);
  const setPresentationAvailable = useCallback((available: boolean) => {
    presentationAvailableRef.current = available;
    if (!available) {
      // Modal chrome must never leave an unseen live microphone behind. Stop,
      // however, is already a submitted action: only its eventual delivery is
      // held until the exact material surface is perceivable again.
      driver.setDeliveryWindowOpen(false);
      driver.cancelRawCapture();
      return;
    }
    syncDeliveryWindow();
  }, [driver, syncDeliveryWindow]);

  useEffect(() => {
    driver.updateScope({
      treeId: scope.treeId,
      revision: scope.revision,
      documentEpoch: scope.documentEpoch,
    });
  }, [driver, scope.documentEpoch, scope.treeId, scope.revision]);

  useEffect(() => {
    driver.retain();
    return () => driver.release();
  }, [driver]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      activePointersRef.current.add(event.pointerId);
      driver.setDeliveryWindowOpen(false);
    };
    const onPointerDone = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
      syncDeliveryWindow();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerDone, true);
    window.addEventListener("pointercancel", onPointerDone, true);
    const unsubscribeSuspension = subscribePageSuspension(
      () => {
        activePointersRef.current.clear();
        driver.suspendCapture();
      },
      syncDeliveryWindow,
    );
    const unsubscribeExit = subscribePageExit(() => driver.exit());
    syncDeliveryWindow();
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerDone, true);
      window.removeEventListener("pointercancel", onPointerDone, true);
      unsubscribeSuspension();
      unsubscribeExit();
    };
  }, [driver, syncDeliveryWindow]);

  return {
    state,
    settlement: driver.getSettlement(),
    repairPresentations: repairPresentation.byNode,
    start: (anchor) => driver.start(anchor, locale),
    stop: () => driver.stop(),
    cancel: () => driver.cancel(),
    retry: () => driver.retry(locale),
    dismiss: () => driver.dismiss(),
    setPresentationAvailable,
    setDeliveryTargetVisible: (visible) => driver.setDeliveryTargetVisible(visible),
    setDeliveryVisibleNodeIds,
    clearRepairPresentations: repairPresentation.clearAll,
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
