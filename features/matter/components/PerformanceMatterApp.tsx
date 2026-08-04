"use client";

import { useState } from "react";
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

/** This harness exercises the real renderer without becoming product state. */
export function PerformanceMatterApp() {
  const [navigation, setNavigation] = useState<NavigationState>(() =>
    createNavigationState(),
  );

  return (
    <RootedMaterial
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
      onApplyFixtureText={() => undefined}
      navigation={navigation}
      persistence={{
        status: { phase: "saved", persistedRevision: performanceTree.revision, dirtyRevision: null, errorCode: null },
        retry: () => undefined,
        resolveConflict: () => undefined,
      }}
      onExitFocus={() => setNavigation((current) => showFull(performanceTree, current))}
      onFocusNode={(nodeId) =>
        setNavigation((current) => {
          const result = focusNode(performanceTree, current, nodeId);
          return result.ok ? result.navigation : current;
        })
      }
      onInsertChild={() => undefined}
      onSelectNode={(nodeId) =>
        setNavigation((current) => {
          const result = selectNode(performanceTree, current, nodeId);
          return result.ok ? result.navigation : current;
        })
      }
      onToggleFold={(nodeId) =>
        setNavigation((current) => {
          const result = toggleFold(performanceTree, current, nodeId);
          return result.ok ? result.navigation : current;
        })
      }
      onUndo={() => undefined}
      tree={performanceTree}
    />
  );
}
