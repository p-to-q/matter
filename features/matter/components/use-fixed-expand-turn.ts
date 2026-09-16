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
import type { TransformCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import { selectLineage } from "../tree/selectors";
import { subscribePageExit, subscribePageSuspension } from "../interaction/page-suspension";

export type FixedExpandTurnState = Readonly<{
  phase: "idle" | "requesting";
  basis: StretchCommitBasis | null;
}>;

export type FixedExpandTurn = Readonly<{
  state: FixedExpandTurnState;
  start: (basis: StretchCommitBasis) => boolean;
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
  ) => TransformCommittedChange | null;
  onCommitted: (change: TransformCommittedChange) => void;
  onUnavailable?: () => void;
}>;

const IDLE: FixedExpandTurnState = Object.freeze({ phase: "idle", basis: null });

type OwnedFixedExpandRequest = {
  readonly controller: AbortController;
  readonly documentEpoch: number;
  readonly envelope: TransformEnvelope;
  readonly basis: StretchCommitBasis;
  plan?: TransformPlan;
};

/** Owns one immutable fixed-expand request; material remains store-owned. */
export function useFixedExpandTurn(input: FixedExpandInput): FixedExpandTurn {
  const [state, setState] = useState<FixedExpandTurnState>(IDLE);
  const [invariantFailure, setInvariantFailure] = useState<Readonly<{ error: unknown }> | null>(null);
  const inputRef = useRef(input);
  const requestRef = useRef<OwnedFixedExpandRequest | null>(null);
  const activePointersRef = useRef(new Set<number>());
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

  const deliver = useCallback((request: OwnedFixedExpandRequest) => {
    if (
      requestRef.current !== request ||
      request.controller.signal.aborted ||
      request.plan === undefined ||
      !deliveryWindowOpenRef.current
    ) return;
    const current = inputRef.current;
    if (!fixedExpandRequestIsCurrent(request, current)) {
      requestRef.current = null;
      setState(IDLE);
      current.onUnavailable?.();
      return;
    }
    if (
      current.deliveryVisibleNodeIds !== undefined &&
      !current.deliveryVisibleNodeIds.has(request.basis.selection.nodeId)
    ) return;
    requestRef.current = null;
    try {
      const change = current.commit(
        request.envelope,
        request.plan,
        request.documentEpoch,
      );
      if (change === null) {
        current.onUnavailable?.();
        setState(IDLE);
        return;
      }
      current.onCommitted(change);
      setState(IDLE);
    } catch (error) {
      setState(IDLE);
      setInvariantFailure(Object.freeze({ error }));
    }
  }, []);

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
      // A release can race a bounded-context or scope refusal. It is not a new
      // material state: reopen the same local degree without vendor chrome.
      current.onUnavailable?.();
      setState(IDLE);
      return false;
    }

    const controller = new AbortController();
    const request: OwnedFixedExpandRequest = {
      controller,
      documentEpoch: basis.documentEpoch,
      envelope,
      basis,
    };
    requestRef.current = request;
    setState(Object.freeze({ phase: "requesting", basis }));
    void requestTransform(envelope, controller.signal).then(
      (plan) => {
        if (requestRef.current !== request || controller.signal.aborted) return;
        request.plan = plan;
        deliver(request);
      },
      () => {
        if (requestRef.current !== request || controller.signal.aborted) return;
        requestRef.current = null;
        if (!fixedExpandRequestIsCurrent(request, inputRef.current)) {
          setState(IDLE);
          return;
        }
        // Provider and transport availability are operational facts, not new
        // material. Leave the selection and document untouched without drawing
        // a vendor failure into the paper.
        inputRef.current.onUnavailable?.();
        setState(IDLE);
      },
    );
    return true;
  }, [deliver]);

  useEffect(() => {
    const request = requestRef.current;
    if (request === null) return;
    if (!fixedExpandRequestIsCurrent(request, input)) queueMicrotask(cancel);
    else deliver(request);
  }, [cancel, deliver, input]);

  useEffect(() => {
    deliveryWindowOpenRef.current = deliveryAvailableRef.current &&
      document.visibilityState === "visible" && activePointersRef.current.size === 0;
    const request = requestRef.current;
    if (request !== null) deliver(request);
  }, [deliver, input.deliveryWindowAvailable]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !deliveryAvailableRef.current || event.key !== "Escape" ||
        requestRef.current === null
      ) return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    const openDeliveryIfUsable = () => {
      deliveryWindowOpenRef.current =
        deliveryAvailableRef.current && document.visibilityState === "visible" &&
          activePointersRef.current.size === 0;
      const request = requestRef.current;
      if (request !== null) deliver(request);
    };
    const onPointerDown = (event: PointerEvent) => {
      activePointersRef.current.add(event.pointerId);
      deliveryWindowOpenRef.current = false;
    };
    const onPointerDone = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
      openDeliveryIfUsable();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerDone, true);
    window.addEventListener("pointercancel", onPointerDone, true);
    const unsubscribePageSuspension = subscribePageSuspension(
      () => {
        activePointersRef.current.clear();
        deliveryWindowOpenRef.current = false;
      },
      openDeliveryIfUsable,
    );
    const unsubscribePageExit = subscribePageExit(cancel);
    openDeliveryIfUsable();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerDone, true);
      window.removeEventListener("pointercancel", onPointerDone, true);
      unsubscribePageSuspension();
      unsubscribePageExit();
      cancel();
    };
  }, [cancel, deliver]);

  return { state, start, cancel };
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
