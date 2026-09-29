"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { MatterLocale } from "../config/locales";
import type { TextSwapCommitResult } from "../interaction/text-swap-driver";
import {
  useTextSwap,
  type TextSwapController,
} from "../interaction/use-text-swap";
import type { SegmentSelection } from "../material/text-segments";
import type { TextSwapEnvelope, TextSwapPlan } from "../protocol/text-swap-contract";
import {
  textSwapActionWasSubmitted,
  type TextSwapInteractionState,
} from "../runtime/text-swap-interaction";
import type { TextSwapCommittedChange } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import type { PointTalkBounds } from "./point-talk-placement";
import type { PresenceHandoff } from "./presence";
import { PointTalkComposer, type PointTalkSurfaceView } from "./PointTalkComposer";

/**
 * How submitted work ended after its field had been closed. The field never
 * reopens for it; the host reports it once, quietly, outside the material.
 */
export type PointTalkDetachedOutcome = "unchanged" | "passage-changed";

/** The complete generative turn stays out of the initial canvas bundle. */
export function PointTalkTurn({
  boundaryRef,
  canvasRef,
  canvasZoom,
  commit,
  documentEpoch,
  deliveryVisibleNodeIds,
  enabled,
  exitHandoff,
  geometryKey,
  interactionScopeKey,
  locale,
  nodeId,
  onClose,
  onCommitted,
  onDetachedOutcome,
  onPhaseChange,
  onReleased,
  presenceIdentity,
  presented,
  surfaceAvailable,
  positioningRef,
  targetBounds,
  tree,
  voiceCommand,
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
  exitHandoff?: PresenceHandoff<PointTalkSurfaceView>;
  geometryKey: string;
  interactionScopeKey: string;
  locale: MatterLocale;
  nodeId: string;
  onClose: () => void;
  onCommitted: (change: TextSwapCommittedChange) => void;
  onDetachedOutcome?: (outcome: PointTalkDetachedOutcome) => void;
  onPhaseChange?: (phase: TextSwapInteractionState["phase"]) => void;
  onReleased: () => void;
  presenceIdentity: string;
  presented: boolean;
  surfaceAvailable: boolean;
  positioningRef: RefObject<HTMLElement | null>;
  targetBounds: PointTalkBounds | null;
  tree: ThoughtTree;
  voiceCommand?: Readonly<{ id: number; type: "start" | "stop" }> | null;
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
  const committed = useCallback((change: TextSwapCommittedChange) => {
    // The rewritten passage is the result; the field leaves as finished work.
    exitHandoff?.intend(presenceIdentity, "finished");
    onCommitted(change);
  }, [exitHandoff, onCommitted, presenceIdentity]);
  const controller = useTextSwap<TextSwapCommittedChange>({
    tree,
    documentEpoch,
    selection,
    locale,
    enabled: selection !== null,
    interactionScopeKey,
    deliveryVisibleNodeIds,
    commit,
    onCommitted: committed,
    deliveryWindowAvailable: surfaceAvailable,
  });
  const appliedVoiceCommandIdRef = useRef<number | null>(null);
  const phase = controller.state.phase;
  useEffect(() => {
    if (presented && selection !== null && phase === "idle" && !controller.enter()) onClose();
  }, [controller, onClose, phase, presented, selection]);
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);
  useEffect(() => {
    if (!presented || voiceCommand === null || voiceCommand === undefined) return;
    if (appliedVoiceCommandIdRef.current === voiceCommand.id) return;
    if (voiceCommand.type === "start") {
      if (phase !== "eligible" && phase !== "ready" && phase !== "error") return;
      if (!controller.startRecording()) return;
    } else {
      if (phase !== "recording") return;
      controller.stopRecording();
    }
    appliedVoiceCommandIdRef.current = voiceCommand.id;
  }, [controller, phase, presented, voiceCommand]);
  useEffect(() => {
    if (!presented) controller.detachPresentation();
  }, [controller, presented]);
  useEffect(() => {
    if (surfaceAvailable || !presented || textSwapActionWasSubmitted(controller.state)) return;
    const retained = controller.detachPresentation();
    onClose();
    if (!retained) onReleased();
  }, [controller, onClose, onReleased, presented, surfaceAvailable]);
  const detachedPhaseRef = useRef(phase);
  useEffect(() => {
    // Runs before the release below, which unmounts this turn.
    const previous = detachedPhaseRef.current;
    detachedPhaseRef.current = phase;
    const outcome = pointTalkDetachedOutcome(presented, previous, phase);
    if (outcome !== null) onDetachedOutcome?.(outcome);
  }, [onDetachedOutcome, phase, presented]);
  useEffect(() => {
    if (pointTalkTurnReleasesOwner(presented, phase)) onReleased();
  }, [onReleased, phase, presented]);
  const closeFor = useCallback((reason: "person" | "placement") => {
    if (reason === "person") exitHandoff?.intend(presenceIdentity, "person");
    const retained = controller.detachPresentation();
    onClose();
    // Geometry failure or dismissal before submit owns no durable job. Release
    // the host synchronously so a stale idle effect cannot reopen the surface.
    if (!retained) onReleased();
  }, [controller, exitHandoff, onClose, onReleased, presenceIdentity]);
  const close = useCallback(() => closeFor("person"), [closeFor]);
  const closeForPlacement = useCallback(() => closeFor("placement"), [closeFor]);

  // Keep the controller alive while submitted work settles, but mount its
  // status/recovery surface only when it can actually be perceived. A failure
  // reached behind a modal or hidden tab is then announced and focused once,
  // when the material surface returns.
  if (selection === null || !presented || !surfaceAvailable) return null;
  return (
    <PointTalkComposer
      boundaryRef={boundaryRef}
      canvasRef={canvasRef}
      canvasZoom={canvasZoom}
      controller={controller}
      exitHandoff={exitHandoff}
      geometryKey={geometryKey}
      locale={locale}
      nodeId={nodeId}
      onCancel={close}
      onPlacementLost={closeForPlacement}
      onRetry={controller.retry}
      onStartVoice={controller.startRecording}
      onStopVoice={controller.stopRecording}
      onSubmit={(direction) => {
        if (!controller.acceptDirection(direction)) return;
        controller.submit();
      }}
      positioningRef={positioningRef}
      presenceIdentity={presenceIdentity}
      surfaceAvailable={surfaceAvailable}
      targetBounds={targetBounds}
      voiceAvailable={voiceAvailable}
    />
  );
}

/**
 * A submitted turn whose field was closed ends silently unless reported: a
 * failure leaves the passage unchanged, and staleness means the passage itself
 * changed first. Only a transition observed while detached counts, so a
 * failure the person already saw and dismissed is never reported twice.
 */
export function pointTalkDetachedOutcome(
  presented: boolean,
  previous: TextSwapController["state"]["phase"],
  phase: TextSwapController["state"]["phase"],
): PointTalkDetachedOutcome | null {
  if (presented || (previous !== "pending" && previous !== "transcribing")) return null;
  if (phase === "error") return "unchanged";
  return phase === "stale" ? "passage-changed" : null;
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
