"use client";

import { useCallback, useEffect, useMemo, type RefObject } from "react";
import type { MatterLocale } from "../config/locales";
import type { TextSwapCommitResult } from "../interaction/text-swap-driver";
import {
  useTextSwap,
  type TextSwapController,
} from "../interaction/use-text-swap";
import type { SegmentSelection } from "../material/text-segments";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import type { TextSwapCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import type { PointTalkBounds } from "./point-talk-placement";
import { PointTalkComposer } from "./PointTalkComposer";

/** The complete generative turn stays out of the initial canvas bundle. */
export function PointTalkTurn({
  boundaryRef,
  canvasRef,
  canvasZoom,
  commit,
  documentEpoch,
  deliveryVisibleNodeIds,
  enabled,
  geometryKey,
  interactionScopeKey,
  locale,
  nodeId,
  onClose,
  onCommitted,
  onReleased,
  presented,
  surfaceAvailable,
  positioningRef,
  targetBounds,
  tree,
  voiceAvailable,
}: Readonly<{
  boundaryRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  canvasZoom: number;
  commit: (
    envelope: TextSwapEnvelope,
    plan: TextSwapPlan,
    expectedDocumentEpoch: number,
  ) => TextSwapCommitResult<TextSwapCommittedChange>;
  documentEpoch: number;
  deliveryVisibleNodeIds?: ReadonlySet<string>;
  enabled: boolean;
  geometryKey: string;
  interactionScopeKey: string;
  locale: MatterLocale;
  nodeId: string;
  onClose: () => void;
  onCommitted: (change: TextSwapCommittedChange) => void;
  onReleased: () => void;
  presented: boolean;
  surfaceAvailable: boolean;
  positioningRef: RefObject<HTMLElement | null>;
  targetBounds: PointTalkBounds | null;
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
    deliveryVisibleNodeIds,
    commit,
    onCommitted,
    deliveryWindowAvailable: surfaceAvailable,
  });
  const phase = controller.state.phase;
  useEffect(() => {
    if (presented && selection !== null && phase === "idle" && !controller.enter()) onClose();
  }, [controller, onClose, phase, presented, selection]);
  useEffect(() => {
    if (!presented) controller.detachPresentation();
  }, [controller, presented]);
  useEffect(() => {
    if (pointTalkTurnReleasesOwner(presented, phase)) onReleased();
  }, [onReleased, phase, presented]);
  const close = useCallback(() => {
    const retained = controller.detachPresentation();
    onClose();
    // Geometry failure or dismissal before submit owns no durable job. Release
    // the host synchronously so a stale idle effect cannot reopen the surface.
    if (!retained) onReleased();
  }, [controller, onClose, onReleased]);

  if (selection === null || !presented) return null;
  return (
    <PointTalkComposer
      boundaryRef={boundaryRef}
      canvasRef={canvasRef}
      canvasZoom={canvasZoom}
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
      positioningRef={positioningRef}
      surfaceAvailable={surfaceAvailable}
      targetBounds={targetBounds}
      voiceAvailable={voiceAvailable}
    />
  );
}

export function pointTalkTurnReleasesOwner(
  presented: boolean,
  phase: TextSwapController["state"]["phase"],
): boolean {
  // A scope loss can make a still-presented draft stale before its geometry
  // callback runs. Terminal work has no reason to keep the host reserved.
  if (presented) return phase === "success" || phase === "stale";
  return phase === "idle" || phase === "error" || phase === "stale" || phase === "success";
}
