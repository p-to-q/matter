"use client";

import { useMemo } from "react";
import { useThoughtLabels } from "../interaction/use-thought-labels";
import {
  MaterialFiles,
  type MaterialFilesProps,
} from "./MaterialFiles";
import { seededFixedLabels } from "../material/seeded-labels";
import { projectMaterialFileLabels } from "./material-file-label-projection";

export type MaterialFilesWithLabelsProps = Omit<
  MaterialFilesProps,
  "labelOrigins" | "labels" | "onRenameNode" | "onResetNodeName" | "onVisibleNodes"
> & Readonly<{ labelsEnabled?: boolean }>;

/**
 * The index owns semantic labels as one lazily delivered secondary surface.
 * The material canvas can become touchable without downloading persistence,
 * model-label scheduling, archive controls, and the complete index first.
 */
export function MaterialFilesWithLabels(props: MaterialFilesWithLabelsProps) {
  const { labelsEnabled, ...materialFilesProps } = props;
  const fixedLabels = useMemo(
    () => seededFixedLabels(props.tree, props.locale),
    [props.locale, props.tree],
  );
  const labels = useThoughtLabels({
    tree: props.tree,
    documentEpoch: props.documentEpoch,
    locale: props.locale,
    enabled: labelsEnabled,
    fixedLabels,
  });
  const projectedLabels = useMemo(
    () => projectMaterialFileLabels({
      documentEpoch: props.documentEpoch,
      fixedLabels,
      session: labels.session,
      treeId: props.tree.id,
    }),
    [fixedLabels, labels.session, props.documentEpoch, props.tree.id],
  );

  return (
    <MaterialFiles
      {...materialFilesProps}
      labelOrigins={projectedLabels.origins}
      labels={projectedLabels.labels}
      onRenameNode={labels.rename}
      onResetNodeName={labels.resetName}
      onVisibleNodes={labels.observe}
    />
  );
}
