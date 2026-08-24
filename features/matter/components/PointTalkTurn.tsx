"use client";

import { useCallback, useEffect, useMemo, type RefObject } from "react";
import type { MatterLocale } from "../config/locales";
import type { TextSwapCommitResult } from "../interaction/text-swap-driver";
import { useTextSwap } from "../interaction/use-text-swap";
import type { SegmentSelection } from "../material/text-segments";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import type { TextSwapCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import { PointTalkComposer } from "./PointTalkComposer";

/** The complete generative turn stays out of the initial canvas bundle. */
export function PointTalkTurn({
  canvasRef,
  commit,
  documentEpoch,
  enabled,
  geometryKey,
  interactionScopeKey,
  locale,
  nodeId,
  onClose,
  onCommitted,
  tree,
  voiceAvailable,
}: Readonly<{
  canvasRef: RefObject<HTMLDivElement | null>;
  commit: (
    envelope: TextSwapEnvelope,
    plan: TextSwapPlan,
    expectedDocumentEpoch: number,
  ) => TextSwapCommitResult<TextSwapCommittedChange>;
  documentEpoch: number;
  enabled: boolean;
  geometryKey: string;
  interactionScopeKey: string;
  locale: MatterLocale;
  nodeId: string;
  onClose: () => void;
  onCommitted: (change: TextSwapCommittedChange) => void;
  tree: ThoughtTree;
  voiceAvailable: boolean;
}>) {
  const selection = useMemo<SegmentSelection | null>(() => {
    const node = tree.nodes[nodeId];
    if (!enabled || node === undefined || node.role === "document-root" || node.text.length === 0) {
      return null;
    }
    return Object.freeze({
      type: "segment-range",
      nodeId: node.id,
      start: 0,
      end: node.text.length,
      selectedText: node.text,
    });
  }, [enabled, nodeId, tree]);
  const controller = useTextSwap<TextSwapCommittedChange>({
    tree,
    documentEpoch,
    selection,
    locale,
    enabled: selection !== null,
    interactionScopeKey,
    commit,
    onCommitted,
  });
  const phase = controller.state.phase;
  useEffect(() => {
    if (selection !== null && phase === "idle") controller.enter();
  }, [controller, phase, selection]);
  const close = useCallback(() => {
    controller.cancel();
    onClose();
  }, [controller, onClose]);

  if (selection === null) return null;
  return (
    <PointTalkComposer
      canvasRef={canvasRef}
      controller={controller}
      geometryKey={geometryKey}
      locale={locale}
      nodeId={nodeId}
      onCancel={close}
      onRetry={controller.retry}
      onStartVoice={controller.startRecording}
      onStopVoice={controller.stopRecording}
      onSubmit={(direction) => {
        if (!controller.acceptDirection(direction)) return;
        controller.submit();
      }}
      voiceAvailable={voiceAvailable}
    />
  );
}
