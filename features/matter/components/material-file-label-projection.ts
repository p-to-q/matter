import type { LabelSessionState } from "../runtime/label-session";

export type MaterialFileLabelProjection = Readonly<{
  labels: ReadonlyMap<string, string>;
  origins: ReadonlyMap<string, string>;
}>;

/**
 * Projects product-owned names synchronously, before lazy label restoration.
 * A person's explicit name is the only session value allowed to outrank one.
 */
export function projectMaterialFileLabels(input: Readonly<{
  documentEpoch: number;
  fixedLabels: ReadonlyMap<string, string>;
  session: LabelSessionState;
  treeId: string;
}>): MaterialFileLabelProjection {
  const labels = new Map(input.fixedLabels);
  const origins = new Map<string, string>();
  for (const nodeId of input.fixedLabels.keys()) origins.set(nodeId, "fixed");

  if (
    input.session.treeId !== input.treeId ||
    input.session.documentEpoch !== input.documentEpoch
  ) return Object.freeze({ labels, origins });

  for (const [nodeId, entry] of input.session.entries) {
    if (input.fixedLabels.has(nodeId) && entry.origin !== "user") continue;
    labels.set(nodeId, entry.label);
    origins.set(nodeId, entry.origin);
  }
  return Object.freeze({ labels, origins });
}
