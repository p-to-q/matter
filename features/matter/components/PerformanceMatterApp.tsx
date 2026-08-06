"use client";

import { useCallback, useEffect, useState } from "react";
import { createPerformanceThoughtTree } from "../fixtures/rooted-material";
import {
  createNavigationState,
  focusNode,
  selectNode,
  showFull,
  toggleFold,
  type NavigationState,
} from "../runtime/navigation";
import { RootedMaterial } from "./RootedMaterial";
import { createAdmissionInteractionState } from "../runtime/admission-interaction";

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
      canUndo={false}
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
      onSelectNode={(nodeId) =>
        setNavigation((current) => {
          const result = selectNode(performanceTree, current, nodeId);
          return result.ok ? result.navigation : current;
        })
      }
      onToggleFold={toggle}
      onUndo={() => undefined}
      performanceMarking
      tree={performanceTree}
    />
  );
}
