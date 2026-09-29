/**
 * How the material commit boundary answered one delivered Elastic or Text Swap
 * result. Only `committed` changed material; `stale` means the document or the
 * exact target changed first, and `rejected` means the result itself was not
 * admissible. Turn owners must make each outcome perceivable.
 */
export type MaterialTurnCommitResult<TCommitted> =
  | Readonly<{ status: "committed"; change: TCommitted }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "rejected" }>;
