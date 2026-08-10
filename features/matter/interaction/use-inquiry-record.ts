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
import { reconcileInquiryAppend, reconcileInquiryClear } from "./inquiry-record-reconciliation";

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
  const [ownedRepository] = useState<InquiryRecordRepository | null>(() =>
    providedRepository === undefined ? createIndexedDbInquiryRecordRepository() : null,
  );
  const repository = providedRepository ?? ownedRepository;
  if (repository === null) {
    throw new Error("Ask Matter repository ownership cannot change during a record session.");
  }
  const [state, setState] = useState<InquiryRecordState>(() => initialState(treeId, enabled));
  const stateRef = useRef(state);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const replaceState = useCallback((next: InquiryRecordState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    // Keep asynchronous completions scoped to the new document without adding
    // a synchronous render solely to mirror the hook's derived loading view.
    stateRef.current = initialState(treeId, enabled);
    if (!enabled) {
      return;
    }
    let active = true;
    void repository.load(treeId).then((result) => {
      if (!active || stateRef.current.treeId !== treeId) return;
      if (!result.ok) {
        replaceState(failedState(treeId, result.error.code));
        return;
      }
      replaceState(loadedState(treeId, result.value));
    });
    return () => { active = false; };
  }, [enabled, repository, replaceState, treeId]);

  useEffect(() => () => ownedRepository?.close(), [ownedRepository]);

  const append = useCallback((exchange: StoredInquiryExchange) => {
    const current = stateRef.current;
    if (!enabled || current.treeId !== treeId || current.phase === "loading") return;
    const exchanges = appendInquiryExchange(current.exchanges, exchange);
    if (exchanges === null) {
      replaceState({ ...current, phase: "error", errorCode: "PERSISTENCE_CORRUPT" });
      return;
    }
    const attemptedVersion = current.version;
    replaceState({ ...current, exchanges, phase: "saved", errorCode: null });
    enqueue(queueRef, async () => {
      const result = await saveAppend(repository, treeId, exchange, exchanges, attemptedVersion);
      if (stateRef.current.treeId !== treeId) return;
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
    });
  }, [enabled, replaceState, repository, treeId]);

  const clear = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || current.treeId !== treeId || current.phase === "loading") return;
    const attemptedVersion = current.version;
    // A clear is a boundary, not another optimistic edit. Blocking additions
    // until its tombstone settles prevents a newly answered request from being
    // mistaken for an answer that predates the person's clear action.
    replaceState({ ...current, phase: "loading", errorCode: null });
    enqueue(queueRef, async () => {
      const result = await clearRecord(repository, treeId, attemptedVersion);
      if (stateRef.current.treeId !== treeId) return;
      if (result.ok) {
        replaceState({ treeId, version: result.value, phase: "saved", exchanges: [], errorCode: null });
      } else {
        replaceState({ ...stateRef.current, phase: "error", errorCode: result.error });
      }
    });
  }, [enabled, replaceState, repository, treeId]);

  const current = state.treeId === treeId ? state : initialState(treeId, enabled);
  return {
    phase: current.phase,
    exchanges: current.exchanges,
    errorCode: current.errorCode,
    append,
    clear,
  };
}

type WriteResult =
  | Readonly<{ ok: true; value: Readonly<{ version: InquiryRecordVersion; exchanges: readonly StoredInquiryExchange[] }> }>
  | Readonly<{ ok: false; error: RepositoryErrorCode }>;

async function saveAppend(
  repository: InquiryRecordRepository,
  treeId: string,
  exchange: StoredInquiryExchange,
  initialExchanges: readonly StoredInquiryExchange[],
  attemptedVersion: InquiryRecordVersion,
): Promise<WriteResult> {
  let record: StoredInquiryRecord | null = null;
  let draft = Object.freeze({ recordSchemaVersion: 1 as const, treeId, exchanges: initialExchanges });
  let version = attemptedVersion;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let saved;
    try {
      saved = await repository.save(draft, version);
    } catch {
      return { ok: false, error: "PERSISTENCE_WRITE_FAILED" };
    }
    if (saved.ok) return { ok: true, value: { version: saved.value, exchanges: draft.exchanges } };
    if (saved.error.code !== "PERSISTENCE_CONFLICT") return { ok: false, error: saved.error.code };
    let loaded;
    try {
      loaded = await repository.load(treeId);
    } catch {
      return { ok: false, error: "PERSISTENCE_UNAVAILABLE" };
    }
    if (!loaded.ok) return { ok: false, error: loaded.error.code };
    record = loaded.value;
    const reconciliation = reconcileInquiryAppend(record, attemptedVersion, exchange);
    if (reconciliation.kind === "discarded-after-clear") {
      return { ok: true, value: { version: inquiryRecordVersion(record), exchanges: record?.exchanges ?? [] } };
    }
    version = reconciliation.version;
    draft = reconciliation.draft;
  }
  return { ok: false, error: "PERSISTENCE_CONFLICT" };
}

async function clearRecord(
  repository: InquiryRecordRepository,
  treeId: string,
  attemptedVersion: InquiryRecordVersion,
): Promise<{ ok: true; value: InquiryRecordVersion } | { ok: false; error: RepositoryErrorCode }> {
  let version = attemptedVersion;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let cleared;
    try {
      cleared = await repository.clear(treeId, version);
    } catch {
      return { ok: false, error: "PERSISTENCE_WRITE_FAILED" };
    }
    if (cleared.ok) return cleared;
    if (cleared.error.code !== "PERSISTENCE_CONFLICT") return { ok: false, error: cleared.error.code };
    let loaded;
    try {
      loaded = await repository.load(treeId);
    } catch {
      return { ok: false, error: "PERSISTENCE_UNAVAILABLE" };
    }
    if (!loaded.ok) return { ok: false, error: loaded.error.code };
    const reconciliation = reconcileInquiryClear(loaded.value);
    if (reconciliation.kind === "already-cleared") return { ok: true, value: reconciliation.version };
    version = reconciliation.version;
  }
  return { ok: false, error: "PERSISTENCE_CONFLICT" };
}

function enqueue(ref: { current: Promise<void> }, operation: () => Promise<void>) {
  ref.current = ref.current.then(operation, operation);
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
