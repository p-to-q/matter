"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createIndexedDbInquiryRecordRepository,
  type InquiryRecordRepository,
  type StoredInquiryExchange,
  type StoredInquiryRecord,
} from "../persistence/inquiry-record-repository";
import {
  appendInquiryExchange,
  mergeInquiryExchanges,
  type InquiryRecordVersion,
  inquiryRecordVersion,
} from "../persistence/inquiry-record-policy";
import type { RepositoryErrorCode } from "../persistence/document-repository";
import {
  createInquiryRecordWriter,
  loadInquiryRecord,
  type InquiryRecordAppendResult,
} from "./inquiry-record-writer";

export type InquiryRecordBinding = Readonly<{
  phase: "loading" | "saved" | "error";
  exchanges: readonly StoredInquiryExchange[];
  errorCode: RepositoryErrorCode | null;
  append: (exchange: StoredInquiryExchange) => void;
  clear: () => void;
}>;

type InquiryRecordState = Readonly<{
  treeId: string;
  version: InquiryRecordVersion;
  phase: InquiryRecordBinding["phase"];
  exchanges: readonly StoredInquiryExchange[];
  errorCode: RepositoryErrorCode | null;
}>;

/**
 * The presentation binding owns one local record session. Its retry policy is
 * deliberately limited to CAS rebases; provider work and material state never
 * enter this lifecycle. An optional port makes system/account adapters
 * replaceable without changing the UI contract.
 */
export function useInquiryRecord(
  treeId: string,
  enabled = true,
  providedRepository?: InquiryRecordRepository,
): InquiryRecordBinding {
  const [ownership] = useState(() => Object.freeze({
    provided: providedRepository,
    repository: providedRepository ?? createIndexedDbInquiryRecordRepository(),
  }));
  if (ownership.provided !== providedRepository) {
    throw new Error("Ask Matter repository ownership cannot change during a record session.");
  }
  const repository = ownership.repository;
  const ownedRepository = ownership.provided === undefined ? repository : null;
  const [writer] = useState(() => createInquiryRecordWriter(repository));
  const [state, setState] = useState<InquiryRecordState>(() => initialState(treeId, enabled));
  const stateRef = useRef(state);

  const replaceState = useCallback((next: InquiryRecordState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => () => {
    void writer.whenIdle().finally(() => ownedRepository?.close());
  }, [ownedRepository, writer]);

  const applyAppendResult = useCallback((targetTreeId: string, result: InquiryRecordAppendResult) => {
    if (stateRef.current.treeId !== targetTreeId) return;
    if (result.ok) {
      const visibleExchanges = mergeInquiryExchanges(result.value.exchanges, stateRef.current.exchanges);
      replaceState({
        ...stateRef.current,
        version: result.value.version,
        exchanges: visibleExchanges ?? result.value.exchanges,
        phase: "saved",
        errorCode: null,
      });
    } else {
      replaceState({ ...stateRef.current, phase: "error", errorCode: result.error });
    }
  }, [replaceState]);

  const persistAppend = useCallback((exchange: StoredInquiryExchange) => {
    const current = stateRef.current;
    if (!enabled || current.treeId !== treeId || current.phase === "loading") return;
    const exchanges = appendInquiryExchange(current.exchanges, exchange);
    if (exchanges === null) {
      replaceState({ ...current, phase: "error", errorCode: "PERSISTENCE_CORRUPT" });
      return;
    }
    replaceState({ ...current, exchanges, phase: "saved", errorCode: null });
    void writer.append(treeId, exchange, {
      version: current.version,
      exchanges: current.exchanges,
    }).then((result) => applyAppendResult(treeId, result));
  }, [applyAppendResult, enabled, replaceState, treeId, writer]);

  const append = useCallback((exchange: StoredInquiryExchange) => {
    if (!enabled) return;
    const current = stateRef.current;
    if (current.treeId === treeId && current.phase !== "loading") {
      persistAppend(exchange);
      return;
    }
    void writer.append(treeId, exchange, null)
      .then((result) => applyAppendResult(treeId, result));
  }, [applyAppendResult, enabled, persistAppend, treeId, writer]);

  useEffect(() => {
    // Keep asynchronous completions scoped to the new document without adding
    // a synchronous render solely to mirror the hook's derived loading view.
    stateRef.current = initialState(treeId, enabled);
    if (!enabled) return;
    let active = true;
    void loadInquiryRecord(repository, treeId).then((result) => {
      if (
        !active ||
        stateRef.current.treeId !== treeId ||
        stateRef.current.phase !== "loading"
      ) return;
      replaceState(result.ok
        ? loadedState(treeId, result.value)
        : failedState(treeId, result.error.code));
    });
    return () => { active = false; };
  }, [enabled, repository, replaceState, treeId]);

  const clear = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || current.treeId !== treeId || current.phase === "loading") return;
    const attemptedVersion = current.version;
    // A clear is a boundary, not another optimistic edit. Blocking additions
    // until its tombstone settles prevents a newly answered request from being
    // mistaken for an answer that predates the person's clear action.
    replaceState({ ...current, phase: "loading", errorCode: null });
    void writer.clear(treeId, attemptedVersion).then((result) => {
      if (stateRef.current.treeId !== treeId) return;
      if (result.ok) {
        replaceState({ treeId, version: result.value, phase: "saved", exchanges: [], errorCode: null });
      } else {
        replaceState({ ...stateRef.current, phase: "error", errorCode: result.error });
      }
    });
  }, [enabled, replaceState, treeId, writer]);

  const current = state.treeId === treeId ? state : initialState(treeId, enabled);
  return {
    phase: current.phase,
    exchanges: current.exchanges,
    errorCode: current.errorCode,
    append,
    clear,
  };
}

function initialState(treeId: string, enabled: boolean): InquiryRecordState {
  return Object.freeze({
    treeId,
    version: inquiryRecordVersion(null),
    phase: enabled ? "loading" : "saved",
    exchanges: Object.freeze([]),
    errorCode: null,
  });
}

function loadedState(treeId: string, record: StoredInquiryRecord | null): InquiryRecordState {
  return Object.freeze({
    treeId,
    version: inquiryRecordVersion(record),
    phase: "saved",
    exchanges: record?.exchanges ?? Object.freeze([]),
    errorCode: null,
  });
}

function failedState(treeId: string, errorCode: RepositoryErrorCode): InquiryRecordState {
  return Object.freeze({
    treeId,
    version: inquiryRecordVersion(null),
    phase: "error",
    exchanges: Object.freeze([]),
    errorCode,
  });
}
