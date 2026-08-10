"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasLanguage } from "./canvas-preferences";
import { useInquiryDictation } from "./use-inquiry-dictation";
import { selectLineage } from "../tree/selectors";
import type { ThoughtTree } from "../tree/model";
import {
  parseTransformEnvelope,
  type TransformEnvelope,
  type TransformPlan,
} from "../protocol/transform-contract";
import type { SegmentSelection } from "../material/text-segments";
import { requestTransform } from "../interaction/transform-client";

export type TransformTurnState = Readonly<{
  phase: "idle" | "recording" | "transcribing" | "requesting" | "error";
  message: string | null;
}>;

type TransformBasis = Readonly<{
  tree: ThoughtTree;
  selection: SegmentSelection;
  amount: number;
}>;

export type TransformTurn = Readonly<{
  state: TransformTurnState;
  supported: boolean | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}>;

/** Owns voice direction and one cancellable HTTP turn; it never owns material. */
export function useTransformTurn(input: Readonly<{
  tree: ThoughtTree;
  selection: SegmentSelection | null;
  amount: number;
  locale: CanvasLanguage;
  enabled: boolean;
  commit: (envelope: TransformEnvelope, plan: TransformPlan) => boolean;
  onPhaseChange?: (phase: TransformTurnState["phase"]) => void;
}>): TransformTurn {
  const [state, setState] = useState<TransformTurnState>({ phase: "idle", message: null });
  const inputRef = useRef(input);
  const basisRef = useRef<TransformBasis | null>(null);
  const transcriptRef = useRef("");
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  useLayoutEffect(() => {
    inputRef.current = input;
  }, [input]);

  const setPhase = useCallback((next: TransformTurnState) => {
    setState(next);
    inputRef.current.onPhaseChange?.(next.phase);
  }, []);

  const settleTurn = useCallback(() => {
    const basis = basisRef.current;
    const transcript = transcriptRef.current.trim();
    if (basis === null || transcript.length === 0) {
      setPhase({ phase: "error", message: "No direction was heard." });
      return;
    }
    const current = inputRef.current;
    const envelope = makeEnvelope(basis, transcript, current.locale);
    if (envelope === null) {
      setPhase({ phase: "error", message: "This passage changed before Matter could use it." });
      return;
    }
    const generation = ++generationRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase({ phase: "requesting", message: null });
    void requestTransform(envelope, controller.signal).then((plan) => {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      requestRef.current = null;
      setPhase(current.commit(envelope, plan)
        ? { phase: "idle", message: null }
        : { phase: "error", message: "This material moved before Matter could change it." });
    }).catch((error: unknown) => {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      requestRef.current = null;
      setPhase({ phase: "error", message: error instanceof Error ? error.message : "Matter could not make this change." });
    });
  }, [setPhase]);

  const dictation = useInquiryDictation({
    onHeard: (transcript) => { transcriptRef.current = transcript; },
    onProcessing: () => setPhase({ phase: "transcribing", message: null }),
    onSettled: settleTurn,
    onFailed: () => setPhase({ phase: "error", message: "The direction could not be heard." }),
  }, input.locale);
  const {
    cancel: cancelDictation,
    start: startDictation,
    stop: stopDictation,
    supported,
  } = dictation;

  const cancel = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    cancelDictation();
    basisRef.current = null;
    transcriptRef.current = "";
    setPhase({ phase: "idle", message: null });
  }, [cancelDictation, setPhase]);

  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    if (!input.enabled) queueMicrotask(cancel);
  }, [cancel, input.enabled]);

  const start = useCallback(() => {
    const current = inputRef.current;
    if (!current.enabled || current.selection === null || current.amount <= 0) return;
    basisRef.current = Object.freeze({ tree: current.tree, selection: current.selection, amount: current.amount });
    transcriptRef.current = "";
    setPhase({ phase: "recording", message: null });
    startDictation();
  }, [setPhase, startDictation]);

  const stop = useCallback(() => {
    if (state.phase !== "recording") return;
    setPhase({ phase: "transcribing", message: null });
    stopDictation();
  }, [setPhase, state.phase, stopDictation]);

  return { state, supported, start, stop, cancel };
}

function makeEnvelope(basis: TransformBasis, transcript: string, locale: CanvasLanguage): TransformEnvelope | null {
  const { tree, selection } = basis;
  if (tree.rootId === null || tree.nodes[selection.nodeId] === undefined) return null;
  const materialLineage = selectLineage(tree, selection.nodeId);
  const root = tree.nodes[tree.rootId];
  if (materialLineage === null || root === undefined) return null;
  const lineage = materialLineage[0]?.id === root.id ? materialLineage : [root, ...materialLineage];
  const parsed = parseTransformEnvelope({
    protocolVersion: tree.protocolVersion,
    id: `turn_${crypto.randomUUID().replaceAll("-", "")}`,
    treeId: tree.id,
    mode: "transform",
    treeRevision: tree.revision,
    selection,
    gesture: { type: "stretch", axis: "vertical", amount: basis.amount },
    voice: { transcript, language: locale },
    context: { lineage },
  });
  return parsed.ok ? parsed.envelope : null;
}
