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
  type AdmissionTargetStatus,
} from "./admission-driver";
import { createBrowserVoicePort } from "./browser-voice";
import { afterBaselineVisible } from "./repair-presentation-gate";
import { preloadNow, preloadWhenIdle } from "./idle-preload";
import {
  createLazyTranscriptRepairPort,
  loadTranscriptRepairRuntime,
} from "./transcript-repair-runtime";
import { requestTranscription } from "./transcription-client";
import { useDeliveryWindow } from "./use-delivery-window";
import { useRepairPresentation } from "./use-repair-presentation";

export type UseAdmissionInput = {
  commit: (
    anchor: RuntimeAdmissionAnchor,
    values: MatterAdmissionValues,
  ) => AdmissionStoreReceipt;
  settleRepair: (settlement: AdmissionRepairSettlement) => AdmissionRepairStoreReceipt;
  scope: AdmissionScope;
  locale?: MatterLocale;
};

/**
 * Stable between admission state changes, so rendering-edge effects that
 * depend on it run once per lifecycle change rather than once per render.
 */
export type AdmissionController = Readonly<{
  state: AdmissionInteractionState;
  settlement: AdmissionSettlement | null;
  repairPresentations: ReadonlyMap<string, AdmissionRepairCommittedChange>;
  start: (anchor: AdmissionAnchor) => void;
  stop: () => void;
  cancel: () => void;
  retry: () => void;
  /** Commits held words at an explicit current admission target. */
  place: (anchor: AdmissionAnchor) => void;
  dismiss: () => void;
  /** Gates canvas presentation without cancelling work submitted at Stop. */
  setPresentationAvailable: (available: boolean) => void;
  setDeliveryTarget: (anchor: AdmissionAnchor, status: AdmissionTargetStatus) => void;
  setDeliveryVisibleNodeIds: (nodeIds: ReadonlySet<string>) => void;
  clearRepairPresentations: () => void;
}>;

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
      repair: createLazyTranscriptRepairPort(),
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
  const presentationAvailableRef = useRef(true);
  const refreshDeliveryWindow = useDeliveryWindow({
    isAvailable: () => presentationAvailableRef.current,
    onChange: (open) => driver.setDeliveryWindowOpen(open),
    onSuspend: () => driver.suspendCapture(),
    onExit: () => driver.exit(),
  }, driver);
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
    refreshDeliveryWindow();
  }, [driver, refreshDeliveryWindow]);

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

  // The late repair runs only after a transcript returns from the network;
  // its runtime loads after first paint, and again when recording starts.
  useEffect(() => preloadWhenIdle([loadTranscriptRepairRuntime]), []);

  const setDeliveryTarget = useCallback(
    (anchor: AdmissionAnchor, status: AdmissionTargetStatus) =>
      driver.setDeliveryTarget(anchor, status),
    [driver],
  );
  const setDeliveryVisibleNodeIds = useCallback(
    (nodeIds: ReadonlySet<string>) => driver.setDeliveryVisibleNodeIds(nodeIds),
    [driver],
  );
  const repairPresentations = repairPresentation.byNode;
  const clearRepairPresentations = repairPresentation.clearAll;
  // The settlement changes only in the same driver step as the state, so it
  // is read once per state snapshot rather than on every render.
  return useMemo((): AdmissionController => ({
    state,
    settlement: driver.getSettlement(),
    repairPresentations,
    start: (anchor: AdmissionAnchor) => {
      preloadNow(loadTranscriptRepairRuntime);
      driver.start(anchor, locale);
    },
    stop: () => driver.stop(),
    cancel: () => driver.cancel(),
    retry: () => {
      preloadNow(loadTranscriptRepairRuntime);
      driver.retry(locale);
    },
    place: (anchor: AdmissionAnchor) => driver.place(anchor),
    dismiss: () => driver.dismiss(),
    setPresentationAvailable,
    setDeliveryTarget,
    setDeliveryVisibleNodeIds,
    clearRepairPresentations,
  }), [
    clearRepairPresentations,
    driver,
    locale,
    repairPresentations,
    setDeliveryTarget,
    setDeliveryVisibleNodeIds,
    setPresentationAvailable,
    state,
  ]);
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
