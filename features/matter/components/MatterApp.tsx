"use client";

import { RootedMaterial } from "./RootedMaterial";
import { useMatterStore } from "../store/matter-store";
import { createAdmissionAnchor } from "../runtime/admission";
import { useAdmission } from "../interaction/use-admission";
import { useMaterialPersistence } from "../persistence/use-material-persistence";

export function MatterApp() {
  const tree = useMatterStore((state) => state.tree);
  const history = useMatterStore((state) => state.history);
  const navigation = useMatterStore((state) => state.navigation);
  const insertFixtureChild = useMatterStore((state) => state.insertFixtureChild);
  const applyFixtureText = useMatterStore((state) => state.applyFixtureText);
  const undo = useMatterStore((state) => state.undo);
  const select = useMatterStore((state) => state.select);
  const focus = useMatterStore((state) => state.focus);
  const showFull = useMatterStore((state) => state.showFull);
  const toggleFold = useMatterStore((state) => state.toggleFold);
  const admitHumanTranscript = useMatterStore((state) => state.admitHumanTranscript);
  const hydrateSnapshot = useMatterStore((state) => state.hydrateSnapshot);
  const persistence = useMaterialPersistence(tree, hydrateSnapshot);
  const admission = useAdmission({
    commit: admitHumanTranscript,
    scope: { treeId: tree.id, revision: tree.revision },
  });
  const admissionAnchor = createAdmissionAnchor(tree, navigation);

  return (
    <RootedMaterial
      canUndo={history.entries.length > 0}
      admission={admission}
      admissionAnchor={
        admissionAnchor.ok
          ? admissionAnchor.anchor.target === "root"
            ? {
                kind: "root",
                treeId: admissionAnchor.anchor.treeId,
                baseRevision: admissionAnchor.anchor.baseRevision,
              }
            : {
                kind: "child",
                treeId: admissionAnchor.anchor.treeId,
                baseRevision: admissionAnchor.anchor.baseRevision,
                parentNodeId: admissionAnchor.anchor.parentNodeId,
              }
          : null
      }
      onApplyFixtureText={applyFixtureText}
      navigation={navigation}
      persistence={persistence}
      onExitFocus={showFull}
      onFocusNode={focus}
      onInsertChild={insertFixtureChild}
      onSelectNode={select}
      onToggleFold={toggleFold}
      onUndo={undo}
      tree={tree}
    />
  );
}
