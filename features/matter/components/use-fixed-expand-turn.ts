"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasLanguage } from "./canvas-preferences";
import { requestTransform, TransformClientError } from "../interaction/transform-client";
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

export type FixedExpandTurnState = Readonly<{
  phase: "idle" | "requesting" | "error";
  basis: StretchCommitBasis | null;
}>;

export type FixedExpandTurn = Readonly<{
  state: FixedExpandTurnState;
  start: (basis: StretchCommitBasis) => boolean;
  cancel: () => void;
  clearError: () => void;
}>;

type FixedExpandInput = Readonly<{
  tree: ThoughtTree;
  documentEpoch: number;
  selection: SegmentSelection | null;
  locale: CanvasLanguage;
  enabled: boolean;
  interactionScopeKey: string;
  commit: (envelope: TransformEnvelope, plan: TransformPlan) => TransformCommittedChange | null;
  onCommitted: (change: TransformCommittedChange) => void;
}>;

const IDLE: FixedExpandTurnState = Object.freeze({ phase: "idle", basis: null });

/** Owns one immutable fixed-expand request; material remains store-owned. */
export function useFixedExpandTurn(input: FixedExpandInput): FixedExpandTurn {
  const [state, setState] = useState<FixedExpandTurnState>(IDLE);
  const inputRef = useRef(input);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const scopeRef = useRef(scopeSignature(input));
  useLayoutEffect(() => {
    inputRef.current = input;
  }, [input]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort(new DOMException("Aborted", "AbortError"));
    requestRef.current = null;
    setState(IDLE);
  }, []);

  const clearError = useCallback(() => {
    setState((current) => current.phase === "error" ? IDLE : current);
  }, []);

  const start = useCallback((basis: StretchCommitBasis): boolean => {
    const current = inputRef.current;
    const envelope = current.enabled
      ? createFixedExpandEnvelope({
          tree: current.tree,
          documentEpoch: current.documentEpoch,
          selection: current.selection,
          locale: current.locale,
          basis,
        })
      : null;
    if (envelope === null) return false;

    generationRef.current += 1;
    requestRef.current?.abort(new DOMException("Superseded", "AbortError"));
    const generation = generationRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setState(Object.freeze({ phase: "requesting", basis }));
    void requestTransform(envelope, controller.signal).then((plan) => {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      requestRef.current = null;
      const change = inputRef.current.commit(envelope, plan);
      if (change === null) {
        // A stale response has no recovery action: current material wins.
        setState(IDLE);
        return;
      }
      inputRef.current.onCommitted(change);
      setState(IDLE);
    }).catch((error: unknown) => {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      requestRef.current = null;
      // Only a strict retryable refusal preserves the selected degree. A
      // malformed or non-retryable boundary fails closed and clears the turn.
      setState(error instanceof TransformClientError && error.retryable
        ? Object.freeze({ phase: "error", basis })
        : IDLE);
    });
    return true;
  }, []);

  useEffect(() => {
    const nextScope = scopeSignature(input);
    if (scopeRef.current === nextScope) return;
    scopeRef.current = nextScope;
    if (state.phase !== "idle") queueMicrotask(cancel);
  }, [cancel, input, state.phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || requestRef.current === null) return;
      event.preventDefault();
      cancel();
    };
    const onPageHide = () => cancel();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pagehide", onPageHide);
      cancel();
    };
  }, [cancel]);

  return { state, start, cancel, clearError };
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
      lineage: materialLineage.map((node, index) => ({
        id: node.id,
        text: node.text,
        // The invisible document-root is storage structure, not model context.
        // Normalize the first visible passage into the wire lineage root.
        parentId: index === 0 ? null : node.parentId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      })),
    },
  });
  return parsed.ok ? parsed.envelope : null;
}

function scopeSignature(input: FixedExpandInput): string {
  const selection = input.selection;
  return [
    input.documentEpoch,
    input.tree.id,
    input.tree.revision,
    input.enabled ? "enabled" : "disabled",
    input.interactionScopeKey,
    selection?.nodeId ?? "",
    selection?.start ?? "",
    selection?.end ?? "",
    selection?.selectedText ?? "",
  ].join(":");
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
