"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { MatterLocale } from "../config/locales";
import type { MaterialTurnCommitResult } from "../interaction/material-turn-result";
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
import type { PointTalkCloseReason } from "./point-talk-close";
import type { PointTalkBounds, PointTalkOrigin } from "./point-talk-placement";
import { POINT_TALK_TIMING, type PresenceHandoff } from "./presence";
import { PointTalkComposer, type PointTalkSurfaceView } from "./PointTalkComposer";

/**
 * How submitted work ended when no field was left to show it. The field never
 * reopens for it; the host reports it once, quietly, outside the material.
 */
export type PointTalkReleasedOutcome = "unavailable" | "stale";

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
  onDeliveryParkedChange,
  onPhaseChange,
  onReleased,
  onReleasedOutcome,
  origin,
  penActive,
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
  ) => MaterialTurnCommitResult<TextSwapCommittedChange>;
  documentEpoch: number;
  deliveryVisibleNodeIds?: ReadonlySet<string>;
  enabled: boolean;
  exitHandoff?: PresenceHandoff<PointTalkSurfaceView>;
  geometryKey: string;
  interactionScopeKey: string;
  locale: MatterLocale;
  nodeId: string;
  /** The field leaves only through this, and only for a named reason. */
  onClose: (reason: PointTalkCloseReason) => void;
  onCommitted: (change: TextSwapCommittedChange) => void;
  /** Receives an explicit release while a resolved result is parked, else null. */
  onDeliveryParkedChange?: (release: (() => void) | null) => void;
  onPhaseChange?: (phase: TextSwapInteractionState["phase"]) => void;
  onReleased: () => void;
  onReleasedOutcome?: (outcome: PointTalkReleasedOutcome) => void;
  /** Where the person summoned the field, in client pixels; null for Voice. */
  origin: PointTalkOrigin | null;
  penActive: (timeStamp: number) => boolean;
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
    // A presented field stays visibly pending for a minimum time before its
    // result may change the passage, so a fast result never flashes it.
    // Detached work has no field to show and delivers as soon as it may.
    minimumPendingMs: presented ? POINT_TALK_TIMING.pendingMinMs : 0,
  });
  const appliedVoiceCommandIdRef = useRef<number | null>(null);
  const phase = controller.state.phase;
  useEffect(() => {
    if (!presented || selection === null || phase !== "idle" || controller.enter()) return;
    // The exact policy or a changed passage refused the summoned turn before
    // its field was ever painted; nothing was rewritten, and it says so.
    onReleasedOutcome?.("unavailable");
    onClose("target-changed");
  }, [controller, onClose, onReleasedOutcome, phase, presented, selection]);
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);
  const controllerRef = useRef(controller);
  useEffect(() => {
    controllerRef.current = controller;
  });
  const deliveryParked = controller.deliveryParked;
  useEffect(() => {
    // Discarding a parked result is an explicit person cancellation.
    onDeliveryParkedChange?.(deliveryParked ? () => controllerRef.current.cancel() : null);
  }, [deliveryParked, onDeliveryParkedChange]);
  useEffect(() => () => onDeliveryParkedChange?.(null), [onDeliveryParkedChange]);
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
    // A modal or hidden page: the one 0 ms cut. An unsubmitted draft ends.
    const retained = controller.detachPresentation();
    onClose("cut");
    if (!retained) onReleased();
  }, [controller, onClose, onReleased, presented, surfaceAvailable]);
  const releasedPhaseRef = useRef(phase);
  useEffect(() => {
    // Runs before the release below, which unmounts this turn.
    const previous = releasedPhaseRef.current;
    releasedPhaseRef.current = phase;
    const outcome = pointTalkReleasedOutcome(presented, previous, phase);
    if (outcome !== null) onReleasedOutcome?.(outcome);
    if (presented && phase === "stale" && previous !== "stale") onClose("target-changed");
  }, [onClose, onReleasedOutcome, phase, presented]);
  useEffect(() => {
    if (pointTalkTurnReleasesOwner(presented, phase)) onReleased();
  }, [onReleased, phase, presented]);
  // Bound to the driver's stable action, not the controller snapshot, so the
  // field's dismissal handlers survive every phase change.
  const detachPresentation = controller.detachPresentation;
  const close = useCallback(() => {
    const retained = detachPresentation();
    onClose("person");
    // Dismissal before submit owns no durable job. Release the host
    // synchronously so a stale idle effect cannot reopen the surface.
    if (!retained) onReleased();
  }, [detachPresentation, onClose, onReleased]);

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
      onRetry={controller.retry}
      onStartVoice={controller.startRecording}
      onStopVoice={controller.stopRecording}
      penActive={penActive}
      onSubmit={(direction) => {
        if (!controller.acceptDirection(direction)) return;
        controller.submit();
      }}
      origin={origin}
      positioningRef={positioningRef}
      presenceIdentity={presenceIdentity}
      surfaceAvailable={surfaceAvailable}
      targetBounds={targetBounds}
      voiceAvailable={voiceAvailable}
    />
  );
}

/**
 * Work that ends without a field to show it would otherwise end silently. A
 * failure is shown by a visible field itself, so it is reported only when the
 * field had been closed. Staleness always closes the field, so it is reported
 * whenever submitted work went stale, and whenever a visible field lost its
 * passage: the person sees the field leave and reads why. Only a transition
 * counts, so an outcome the person already saw is never reported twice.
 */
export function pointTalkReleasedOutcome(
  presented: boolean,
  previous: TextSwapController["state"]["phase"],
  phase: TextSwapController["state"]["phase"],
): PointTalkReleasedOutcome | null {
  const submitted = previous === "pending" || previous === "transcribing";
  if (phase === "stale") {
    return previous !== "stale" && previous !== "idle" && (submitted || presented) ? "stale" : null;
  }
  return submitted && phase === "error" && !presented ? "unavailable" : null;
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
