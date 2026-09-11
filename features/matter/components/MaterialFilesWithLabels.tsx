"use client";

import { useMemo } from "react";
import { useThoughtLabels } from "../interaction/use-thought-labels";
import {
  MaterialFiles,
  type MaterialFilesProps,
} from "./MaterialFiles";

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
  const labels = useThoughtLabels({
    tree: props.tree,
    documentEpoch: props.documentEpoch,
    locale: props.locale,
    enabled: labelsEnabled,
  });
  const labelByNodeId = useMemo(() => {
    const values = new Map<string, string>();
    if (
      labels.session.treeId !== props.tree.id ||
      labels.session.documentEpoch !== props.documentEpoch
    ) return values;
    for (const [nodeId, entry] of labels.session.entries) values.set(nodeId, entry.label);
    return values;
  }, [labels.session, props.documentEpoch, props.tree.id]);
  const labelOriginByNodeId = useMemo(() => {
    const values = new Map<string, string>();
    if (
      labels.session.treeId !== props.tree.id ||
      labels.session.documentEpoch !== props.documentEpoch
    ) return values;
    for (const [nodeId, entry] of labels.session.entries) values.set(nodeId, entry.origin);
    return values;
  }, [labels.session, props.documentEpoch, props.tree.id]);

  return (
    <MaterialFiles
      {...materialFilesProps}
      labelOrigins={labelOriginByNodeId}
      labels={labelByNodeId}
      onRenameNode={labels.rename}
      onResetNodeName={labels.resetName}
      onVisibleNodes={labels.observe}
    />
  );
}
