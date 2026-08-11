"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
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
  type AdmissionScope,
} from "./admission-driver";
import { createBrowserVoicePort } from "./browser-voice";
import { afterBaselineVisible } from "./repair-presentation-gate";
import { createTranscriptRepairPort } from "./transcript-repair-port";
import { requestTranscription } from "./transcription-client";
import { useRepairPresentation } from "./use-repair-presentation";

export type UseAdmissionInput = {
  commit: (
    anchor: RuntimeAdmissionAnchor,
    values: MatterAdmissionValues,
  ) => AdmissionStoreReceipt;
  settleRepair: (settlement: AdmissionRepairSettlement) => AdmissionRepairStoreReceipt;
  scope: AdmissionScope;
  locale?: MatterLocale;
  /**
   * Terms from the person's own visible material, for transcript repair. A
   * plain value rather than a callback: the caller already recomputes it when
   * the tree changes, and a ref keeps the driver itself stable.
   */
  vocabulary?: readonly string[];
};

export type AdmissionController = {
  state: AdmissionInteractionState;
  repairPresentations: ReadonlyMap<string, AdmissionRepairCommittedChange>;
  start: (anchor: AdmissionAnchor) => void;
  stop: () => void;
  cancel: () => void;
  retry: () => void;
  dismiss: () => void;
  discardPendingRepairs: () => void;
  clearRepairPresentations: () => void;
};

const NO_VOCABULARY: readonly string[] = Object.freeze([]);

export function useAdmission({
  commit,
  settleRepair,
  scope,
  locale = "zh-CN",
  vocabulary = NO_VOCABULARY,
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
      locale,
    }),
    [commit, settleRepair, repairPresentation.publish, locale],
  );
  const subscribe = useCallback(
    (listener: () => void) => driver.subscribe(listener),
    [driver],
  );
  const getSnapshot = useCallback(() => driver.getState(), [driver]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    driver.updateVocabulary(vocabulary);
  }, [driver, vocabulary]);

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

  return {
    state,
    repairPresentations: repairPresentation.byNode,
    start: (anchor) => driver.start(anchor),
    stop: () => driver.stop(),
    cancel: () => driver.cancel(),
    retry: () => driver.retry(),
    dismiss: () => driver.dismiss(),
    discardPendingRepairs: () => driver.discardPendingRepairs(),
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
