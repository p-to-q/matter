"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasLanguage } from "./canvas-preferences";
import { requestTransform } from "../interaction/transform-client";
import type { SegmentSelection } from "../material/text-segments";
import {
  parseTransformEnvelope,
  TRANSFORM_REQUEST_VERSION,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import type { StretchCommitBasis } from "../runtime/stretch-interaction";
import type { MaterialTurnCommitResult } from "../interaction/material-turn-result";
import type { TransformCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import { useDeliveryWindow } from "../interaction/use-delivery-window";

/**
 * How a submitted turn ended without changing material. `unavailable` covers
 * provider, transport, and admissibility failures; `stale` means its exact
 * passage changed first.
 */
export type FixedExpandTurnOutcome = "unavailable" | "stale";

export type FixedExpandTurnState = Readonly<{
  phase: "idle" | "requesting";
  basis: StretchCommitBasis | null;
  /** A resolved result is held only because its exact passage is not laid out. */
  parked: boolean;
}>;

export type FixedExpandTurn = Readonly<{
  state: FixedExpandTurnState;
  start: (basis: StretchCommitBasis) => boolean;
  /** Explicitly releases the submitted or parked turn without an outcome. */
  cancel: () => void;
}>;

type FixedExpandInput = Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  locale: CanvasLanguage;
  enabled: boolean;
  deliveryVisibleNodeIds?: ReadonlySet<string>;
  /** False holds a resolved plan until the material surface is usable again. */
  deliveryWindowAvailable?: boolean;
  commit: (
    envelope: TransformEnvelope,
    plan: TransformPlan,
    expectedDocumentEpoch: number,
  ) => MaterialTurnCommitResult<TransformCommittedChange>;
  onCommitted: (change: TransformCommittedChange) => void;
  /** Reports, once, a turn that ended without the change the person asked for. */
  onOutcome?: (outcome: FixedExpandTurnOutcome) => void;
  onUnavailable?: () => void;
}>;

const IDLE: FixedExpandTurnState = Object.freeze({
  phase: "idle",
  basis: null,
  parked: false,
});

type OwnedFixedExpandRequest = {
  readonly controller: AbortController;
  readonly documentEpoch: number;
  readonly envelope: TransformEnvelope;
  readonly basis: StretchCommitBasis;
  plan?: TransformPlan;
  parked: boolean;
};

/** Owns one immutable fixed-expand request; material remains store-owned. */
export function useFixedExpandTurn(input: FixedExpandInput): FixedExpandTurn {
  const [state, setState] = useState<FixedExpandTurnState>(IDLE);
  const [invariantFailure, setInvariantFailure] = useState<Readonly<{ error: unknown }> | null>(null);
  const inputRef = useRef(input);
  const requestRef = useRef<OwnedFixedExpandRequest | null>(null);
  const deliveryAvailableRef = useRef(input.deliveryWindowAvailable !== false);
  const deliveryWindowOpenRef = useRef(
    typeof document === "undefined" || document.visibilityState === "visible",
  );
  useLayoutEffect(() => {
    inputRef.current = input;
    deliveryAvailableRef.current = input.deliveryWindowAvailable !== false;
    if (!deliveryAvailableRef.current) deliveryWindowOpenRef.current = false;
  }, [input]);
  if (invariantFailure !== null) throw invariantFailure.error;

  const cancel = useCallback(() => {
    requestRef.current?.controller.abort(new DOMException("Aborted", "AbortError"));
    requestRef.current = null;
    setState(IDLE);
  }, []);

  /**
   * Returns to idle after a turn that changed nothing. A failure the person
   * should know about reports one quiet outcome; a replaced document reports
   * none, because its passage no longer exists for them.
   */
  const publishUnchanged = useCallback((outcome: FixedExpandTurnOutcome | null) => {
    setState(IDLE);
    if (outcome !== null) inputRef.current.onOutcome?.(outcome);
  }, []);

  const settleUnchanged = useCallback((
    request: OwnedFixedExpandRequest,
    outcome: FixedExpandTurnOutcome | null,
  ) => {
    if (requestRef.current !== request) return;
    request.controller.abort(new DOMException("Settled", "AbortError"));
    requestRef.current = null;
    publishUnchanged(outcome);
  }, [publishUnchanged]);

  const settleConflict = useCallback((request: OwnedFixedExpandRequest) => {
    const current = inputRef.current;
    const sameDocument = request.documentEpoch === current.documentEpoch &&
      request.envelope.treeId === current.tree.id;
    settleUnchanged(request, sameDocument ? "stale" : null);
  }, [settleUnchanged]);

  const deliver = useCallback((request: OwnedFixedExpandRequest) => {
    if (
      requestRef.current !== request ||
      request.controller.signal.aborted ||
      request.plan === undefined
    ) return;
    const current = inputRef.current;
    if (!fixedExpandRequestIsCurrent(request, current)) {
      settleConflict(request);
      current.onUnavailable?.();
      return;
    }
    const targetLaidOut = current.deliveryVisibleNodeIds === undefined ||
      current.deliveryVisibleNodeIds.has(request.basis.selection.nodeId);
    if (request.parked === targetLaidOut) {
      // Parking is a visible state with an explicit release, never an
      // invisible block on every later stretch.
      request.parked = !targetLaidOut;
      setState(requestingState(request));
    }
    if (!targetLaidOut || !deliveryWindowOpenRef.current) return;
    requestRef.current = null;
    try {
      const result = current.commit(
        request.envelope,
        request.plan,
        request.documentEpoch,
      );
      if (result.status !== "committed") {
        publishUnchanged(result.status === "stale" ? "stale" : "unavailable");
        current.onUnavailable?.();
        return;
      }
      current.onCommitted(result.change);
      setState(IDLE);
    } catch (error) {
      setState(IDLE);
      setInvariantFailure(Object.freeze({ error }));
    }
  }, [publishUnchanged, settleConflict]);

  const start = useCallback((basis: StretchCommitBasis): boolean => {
    const current = inputRef.current;
    // One bounded owner means a second gesture cannot silently replace a
    // submitted request. The surface stays unavailable until it settles.
    if (requestRef.current !== null) return false;
    const envelope = current.enabled
      ? createFixedExpandEnvelope({
          tree: current.tree,
          documentEpoch: current.documentEpoch,
          selection: current.selection,
          locale: current.locale,
          basis,
        })
      : null;
    if (envelope === null) {
      // A release can race a bounded-context or scope refusal. Reopen the same
      // local degree and say quietly that nothing was sent.
      current.onUnavailable?.();
      publishUnchanged("unavailable");
      return false;
    }

    const controller = new AbortController();
    const request: OwnedFixedExpandRequest = {
      controller,
      documentEpoch: basis.documentEpoch,
      envelope,
      basis,
      parked: false,
    };
    requestRef.current = request;
    setState(requestingState(request));
    void requestTransform(envelope, controller.signal).then(
      (plan) => {
        if (requestRef.current !== request || controller.signal.aborted) return;
        request.plan = plan;
        deliver(request);
      },
      () => {
        if (requestRef.current !== request || controller.signal.aborted) return;
        if (!fixedExpandRequestIsCurrent(request, inputRef.current)) {
          settleConflict(request);
          return;
        }
        // Provider and transport availability are operational facts, not new
        // material. Leave the selection and document untouched, reopen the
        // degree, and announce only that the text is unchanged.
        settleUnchanged(request, "unavailable");
        inputRef.current.onUnavailable?.();
      },
    );
    return true;
  }, [deliver, publishUnchanged, settleConflict, settleUnchanged]);

  useEffect(() => {
    const request = requestRef.current;
    if (request === null) return;
    if (!fixedExpandRequestIsCurrent(request, input)) {
      queueMicrotask(() => settleConflict(request));
    } else deliver(request);
  }, [deliver, input, settleConflict]);

  const refreshDeliveryWindow = useDeliveryWindow({
    isAvailable: () => deliveryAvailableRef.current,
    onChange: (open) => {
      deliveryWindowOpenRef.current = open;
      // Delivery also reflects whether a resolved plan is parked, so it runs
      // on every evaluation and commits only when the window is open.
      const request = requestRef.current;
      if (request !== null) deliver(request);
    },
    // A back-forward-cache hide keeps a submitted expansion for the page's
    // return, where delivery revalidates as usual; only a real unload ends it.
    onExit: (exit) => {
      if (!exit.persisted) cancel();
    },
  }, deliver);

  useEffect(() => {
    refreshDeliveryWindow();
  }, [input.deliveryWindowAvailable, refreshDeliveryWindow]);

  // Escape never reaches this owner: after submit it may only remove the
  // committed degree from the paper, which the composition's Escape layer does.
  useEffect(() => () => cancel(), [cancel]);

  return { state, start, cancel };
}

function requestingState(request: OwnedFixedExpandRequest): FixedExpandTurnState {
  return Object.freeze({
    phase: "requesting",
    basis: request.basis,
    parked: request.parked,
  });
}

export function createFixedExpandEnvelope(input: Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  locale: CanvasLanguage;
  basis: StretchCommitBasis;
  id?: string;
}>): TransformEnvelope | null {
  const { basis, tree } = input;
  if (
    input.selection === null ||
    input.documentEpoch !== basis.documentEpoch ||
    tree.id !== basis.treeId ||
    tree.revision !== basis.baseRevision ||
    !sameSelection(input.selection, basis.selection) ||
    tree.rootId === null ||
    tree.nodes[basis.selection.nodeId] === undefined
  ) return null;
  const materialLineage = selectLineage(tree, basis.selection.nodeId);
  if (materialLineage === null || materialLineage.length === 0) return null;
  const parsed = parseTransformEnvelope({
    protocolVersion: tree.protocolVersion,
    requestVersion: TRANSFORM_REQUEST_VERSION,
    id: input.id ?? createTurnId(),
    treeId: tree.id,
    mode: "transform",
    operation: "expand-in-place",
    treeRevision: tree.revision,
    selection: basis.selection,
    gesture: { type: "stretch", axis: "vertical", amount: basis.amount },
    locale: input.locale,
    context: {
      lineage: wireLineage(materialLineage),
    },
  });
  return parsed.ok ? parsed.envelope : null;
}

function fixedExpandRequestIsCurrent(
  request: OwnedFixedExpandRequest,
  input: FixedExpandInput,
): boolean {
  if (
    request.documentEpoch !== input.documentEpoch ||
    request.envelope.treeId !== input.tree.id
  ) return false;
  const node = input.tree.nodes[request.basis.selection.nodeId];
  if (
    node === undefined ||
    node.text.slice(request.basis.selection.start, request.basis.selection.end) !==
      request.basis.selection.selectedText
  ) return false;
  const lineage = selectLineage(input.tree, request.basis.selection.nodeId);
  return lineage !== null && sameWireLineage(
    request.envelope.context.lineage,
    wireLineage(lineage),
  );
}

function wireLineage(lineage: NonNullable<ReturnType<typeof selectLineage>>) {
  return lineage.map((node, index) => ({
    id: node.id,
    text: node.text,
    // The invisible document-root is storage structure, not model context.
    parentId: index === 0 ? null : node.parentId,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }));
}

function sameWireLineage(
  left: TransformEnvelope["context"]["lineage"],
  right: TransformEnvelope["context"]["lineage"],
): boolean {
  return left.length === right.length && left.every((node, index) => {
    const other = right[index];
    return other !== undefined && node.id === other.id && node.text === other.text &&
      node.parentId === other.parentId && node.createdAt === other.createdAt &&
      node.updatedAt === other.updatedAt;
  });
}

function sameSelection(left: SegmentSelection, right: SegmentSelection): boolean {
  return left.type === right.type &&
    left.nodeId === right.nodeId &&
    left.start === right.start &&
    left.end === right.end &&
    left.selectedText === right.selectedText;
}

function createTurnId(): string {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `turn_${unique}`;
}
