"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { createIndexedDbLabelRepository } from "../persistence/label-repository";
import type { LabelSessionState } from "../runtime/label-session";
import type { ThoughtTree } from "../tree/model";
import { LabelDriver } from "./label-driver";
import { requestLabel } from "./label-client";

export type ThoughtLabels = Readonly<{
  session: LabelSessionState;
  /** Declares the nodes worth labelling now. Safe to call from an effect. */
  observe: (nodeIds: readonly string[]) => void;
  /** Replaces one node's label with a name the person typed. */
  rename: (nodeId: string, label: string) => Promise<void>;
  /** Returns one node to automatic naming. */
  resetName: (nodeId: string) => Promise<void>;
}>;

export function useThoughtLabels(input: Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  locale?: string;
  /**
   * Off for the performance receipt, which measures the material path and must
   * not have label work attributed to it.
   */
  enabled?: boolean;
}>): ThoughtLabels {
  const locale = input.locale ?? "zh-CN";
  const enabled = input.enabled ?? true;
  const repository = useMemo(
    () => (enabled ? createIndexedDbLabelRepository() : undefined),
    [enabled],
  );
  const driver = useMemo(
    () => new LabelDriver(
      { tree: input.tree, documentEpoch: input.documentEpoch },
      { request: requestLabel, createOperationId, locale, repository },
    ),
    // The driver owns the whole session; a new tree revision is scope, not
    // identity, and is delivered through `observe`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, repository],
  );
  const subscribe = useCallback((listener: () => void) => driver.subscribe(listener), [driver]);
  const getSnapshot = useCallback(() => driver.getState(), [driver]);
  const session = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    driver.retain();
    return () => driver.release();
  }, [driver]);

  useEffect(() => () => repository?.close(), [repository]);

  const observe = useCallback(
    (nodeIds: readonly string[]) => {
      if (!enabled) return;
      driver.observe({ tree: input.tree, documentEpoch: input.documentEpoch }, nodeIds);
    },
    [driver, enabled, input.documentEpoch, input.tree],
  );
  const rename = useCallback(
    (nodeId: string, label: string) => driver.rename(nodeId, label),
    [driver],
  );
  const resetName = useCallback((nodeId: string) => driver.resetName(nodeId), [driver]);

  return useMemo(
    () => Object.freeze({ session, observe, rename, resetName }),
    [observe, rename, resetName, session],
  );
}

function createOperationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `label_${crypto.randomUUID().replaceAll("-", "")}`
    : `label_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
