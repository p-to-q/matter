/**
 * Build facts only. Loading triggers, recovery and authority stay with callers.
 * Marker-less adapters retain a diagnostic identity on an exported callable:
 * an unused export could disappear during tree shaking and prove no asset.
 * Entry ceilings include the caller's complete static JS/CSS group. They do
 * not claim later dynamic imports, worker assets or model downloads are free.
 */
export const MATTER_CAPABILITIES = [
  { id: "wiki-occurrences", sentinel: "matter-capability:wiki-occurrences", tier: "gesture", budgetGzip: 5120, entryBudgetGzip: 8192 },
  { id: "picture-store", sentinel: "matter-capability:picture-store", tier: "on-use", budgetGzip: 3328, entryBudgetGzip: 6144 },
  { id: "wiki-takeover", sentinel: "wiki-takeover__heard", tier: "gesture", budgetGzip: 8960, entryBudgetGzip: 18432 },
  { id: "local-transcription", sentinel: "matter-capability:local-transcription", tier: "on-use", budgetGzip: 2816, entryBudgetGzip: 3072 },
  { id: "seeded-branch-copy", sentinel: "matter-capability:seeded-branch-copy", tier: "background", budgetGzip: 5120, entryBudgetGzip: 6144 },
  { id: "transcript-repair", sentinel: "matter-capability:transcript-repair", tier: "background", budgetGzip: 4608, entryBudgetGzip: 5120 },
  { id: "repair-adjudication", sentinel: "matter-capability:repair-adjudication", tier: "background", budgetGzip: 4352, entryBudgetGzip: 5120 },
  { id: "archive-codec", sentinel: "matter-capability:archive-codec", tier: "on-use", budgetGzip: 512, entryBudgetGzip: 9216 },
  { id: "persistence", sentinel: "matter-capability:persistence", tier: "background", budgetGzip: 10752, entryBudgetGzip: 14336 },
  { id: "inquiry-record", sentinel: "matter-capability:inquiry-record", tier: "background", budgetGzip: 1536, entryBudgetGzip: 4096 },
  { id: "labels", sentinel: "matter-capability:labels", tier: "background", budgetGzip: 1536, entryBudgetGzip: 4096 },
  { id: "wiki-runtime", sentinel: "ptoq.matter.wiki-runtime", tier: "background", budgetGzip: 27648, entryBudgetGzip: 34816 },
  { id: "wiki-export", sentinel: "matter-wiki.json", tier: "on-use", budgetGzip: 1024, entryBudgetGzip: 1024 },
  { id: "model-api-settings", sentinel: "matter-capability:model-api-settings", tier: "gesture", budgetGzip: 8448, entryBudgetGzip: 9216 },
  { id: "wiki-settings", sentinel: "matter-wiki-editor-hint", tier: "gesture", budgetGzip: 10752, entryBudgetGzip: 49152 },
  { id: "passage-picture", sentinel: "matter-capability:passage-picture", tier: "on-use", budgetGzip: 2304, entryBudgetGzip: 3072 },
  { id: "archive-transport", sentinel: "ARCHIVE_BLOB_STRUCTURE_INVALID", tier: "background", budgetGzip: 7936, entryBudgetGzip: 8192 },
  { id: "seed-localization", sentinel: "matter-seeded-session-localization", tier: "background", budgetGzip: 5376, entryBudgetGzip: 6144 },
  { id: "files-copy", sentinel: "matter-capability:files-copy", tier: "on-use", budgetGzip: 11776, entryBudgetGzip: 13312 },
  { id: "point-talk", sentinel: "matter-capability:point-talk", tier: "gesture", budgetGzip: 15616, entryBudgetGzip: 34816 },
  { id: "point-talk-composer", sentinel: "--point-talk-control-reserve", tier: "gesture", budgetGzip: 15360, entryBudgetGzip: 18432 },
  { id: "node-actions", sentinel: "node-action-lens", tier: "gesture", budgetGzip: 7680, entryBudgetGzip: 10240 },
  { id: "operation-trail", sentinel: "operation-trail__chevron", tier: "gesture", budgetGzip: 7680, entryBudgetGzip: 9216 },
  { id: "material-index", sentinel: "matter-capability:material-index", tier: "background", budgetGzip: 28160, entryBudgetGzip: 52224 },
  { id: "deployment-version", sentinel: "matter-capability:deployment-version", tier: "background", budgetGzip: 2048, entryBudgetGzip: 4096 },
] as const;
