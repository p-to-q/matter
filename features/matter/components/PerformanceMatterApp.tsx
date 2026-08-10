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
import { useCanvasPreferences } from "./use-canvas-preferences";

const performanceTree = createPerformanceThoughtTree();

type PerformanceNavigationBridge = Readonly<{
  focus: (nodeId: string) => void;
  showFull: () => void;
  toggleFold: (nodeId: string) => void;
}>;

declare global {
  interface Window {
    __matterPerformanceNavigation?: PerformanceNavigationBridge;
  }
}

/** This harness exercises the real renderer without becoming product state. */
export function PerformanceMatterApp() {
  const canvasPreferences = useCanvasPreferences();
  const [navigation, setNavigation] = useState<NavigationState>(() =>
    createNavigationState(),
  );
  const exitFocus = useCallback(() => {
    setNavigation((current) => showFull(performanceTree, current));
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
    const bridge = Object.freeze({ focus, showFull: exitFocus, toggleFold: toggle });
    window.__matterPerformanceNavigation = bridge;
    return () => {
      if (window.__matterPerformanceNavigation === bridge) {
        delete window.__matterPerformanceNavigation;
      }
    };
  }, [exitFocus, focus, toggle]);

  return (
    <RootedMaterial
      documentEpoch={0}
      canvasPreferences={canvasPreferences}
      locale="zh-CN"
      canUndo={false}
      canRedo={false}
      admission={{
        state: createAdmissionInteractionState(),
        start: () => undefined,
        stop: () => undefined,
        cancel: () => undefined,
        retry: () => undefined,
        dismiss: () => undefined,
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
      onTransformCommit={() => false}
      onSelectNode={(nodeId) =>
        setNavigation((current) => {
          const result = selectNode(performanceTree, current, nodeId);
          return result.ok ? result.navigation : current;
        })
      }
      onToggleFold={toggle}
      onUndo={() => undefined}
      onRedo={() => undefined}
      performanceMarking
      tree={performanceTree}
    />
  );
}
