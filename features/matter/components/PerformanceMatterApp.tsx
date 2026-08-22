"use client";

import { useCallback, useEffect, useState } from "react";
import { createPerformanceThoughtTree } from "../material/seeded-document";
import {
  createNavigationState,
  clearSelection,
  focusNode,
  selectNode,
  showFull,
  toggleFold,
  type NavigationState,
} from "../runtime/navigation";
import { RootedMaterial } from "./RootedMaterial";
import { createAdmissionInteractionState } from "../runtime/admission-interaction";
import type { AdmissionRepairCommittedChange } from "../store/matter-store";
import { useCanvasPreferences } from "./use-canvas-preferences";

const performanceTree = createPerformanceThoughtTree();

/**
 * The product passes a stable store action and a stable presentation snapshot
 * here. Rebuilding either one per render would break the `CanvasThoughtList`
 * memo that the shipped renderer relies on, so the harness would measure 2,000
 * row reconciles that production never performs — and the receipt would report
 * a cold-start cost the product does not have.
 */
const NO_REPAIR_PRESENTATIONS: ReadonlyMap<string, AdmissionRepairCommittedChange> = new Map();
const admissionState = createAdmissionInteractionState();
const VIEWPORT_RESEARCH = Object.freeze({
  batchSize: 32 as const,
  source: "viewport-research" as const,
});

type PerformanceNavigationBridge = Readonly<{
  focus: (nodeId: string) => void;
  select: (nodeId: string) => void;
  showFull: () => void;
  toggleFold: (nodeId: string) => void;
}>;

declare global {
  interface Window {
    __matterPerformanceNavigation?: PerformanceNavigationBridge;
  }
}

/** This harness exercises the real renderer without becoming product state. */
export function PerformanceMatterApp({
  rendererSource = "complete",
}: Readonly<{
  rendererSource?: "complete" | "viewport-research";
}>) {
  const canvasPreferences = useCanvasPreferences();
  const [navigation, setNavigation] = useState<NavigationState>(() =>
    createNavigationState(),
  );
  const exitFocus = useCallback(() => {
    setNavigation((current) => showFull(performanceTree, current));
  }, []);
  const select = useCallback((nodeId: string) => {
    setNavigation((current) => {
      const result = selectNode(performanceTree, current, nodeId);
      return result.ok ? result.navigation : current;
    });
  }, []);
  const focus = useCallback((nodeId: string) => {
    setNavigation((current) => {
      const result = focusNode(performanceTree, current, nodeId);
      return result.ok ? result.navigation : current;
    });
  }, []);
  const toggle = useCallback((nodeId: string) => {
    setNavigation((current) => {
      const result = toggleFold(performanceTree, current, nodeId);
      return result.ok ? result.navigation : current;
    });
  }, []);

  useEffect(() => {
    // The production-only receipt exercises retained navigation without
    // reintroducing test controls into the first-release presentation.
    const bridge = Object.freeze({ focus, select, showFull: exitFocus, toggleFold: toggle });
    window.__matterPerformanceNavigation = bridge;
    return () => {
      if (window.__matterPerformanceNavigation === bridge) {
        delete window.__matterPerformanceNavigation;
      }
    };
  }, [exitFocus, focus, select, toggle]);

  return (
    <RootedMaterial
      documentEpoch={0}
      canvasPreferences={canvasPreferences}
      locale="zh-CN"
      canUndo={false}
      canRedo={false}
      admission={{
        state: admissionState,
        repairPresentations: NO_REPAIR_PRESENTATIONS,
        start: () => undefined,
        stop: () => undefined,
        cancel: () => undefined,
        retry: () => undefined,
        dismiss: () => undefined,
        discardPendingRepairs: () => undefined,
        clearRepairPresentations: () => undefined,
      }}
      admissionAnchor={null}
      navigation={navigation}
      persistence={{
        status: { phase: "saved", persistedRevision: performanceTree.revision, dirtyRevision: null, errorCode: null },
        retry: () => undefined,
        resolveConflict: () => undefined,
      }}
      onExitFocus={exitFocus}
      onFocusNode={focus}
      onInsertChild={() => undefined}
      onRemoveSelected={() => undefined}
      onMoveNode={() => undefined}
      onRenameDocument={() => undefined}
      onClearSelection={() => setNavigation((current) => clearSelection(current))}
      onTransformCommit={() => null}
      onSelectNode={select}
      onToggleFold={toggle}
      onUndo={() => undefined}
      onRedo={() => undefined}
      performanceMarking
      performanceViewport={rendererSource === "viewport-research" ? VIEWPORT_RESEARCH : undefined}
      tree={performanceTree}
    />
  );
}
