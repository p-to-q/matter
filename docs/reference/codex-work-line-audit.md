# Codex Work Line Audit

> **Date**: 2026-09-17
> **Policy**: merge-or-stash, never abandon (`spec-v3 §Phase 4`, user policy)
> **Auditor**: maintainer role

## Summary

| Work line | Unique commits | Conflicts | Verdict | Action |
| --- | --- | --- | --- | --- |
| `codex/preview-46-ai-harness` | 2 | 48 | stash | Tag `codex-wip-preview-46-ai-harness` created |
| `codex/selected-material-recovery` | 1 | 2 (add/add docs) | stash | Tag `codex-wip-selected-material-recovery` created |
| `cloud/address-restore` | 0 | 0 | already-in-main | No action — HEAD `8d2d56a` is in main |
| `tmp/action-lasso-api-hardening/` | 94 uncommitted files | n/a | adapt (pending) | Clone preserved in gitignored `tmp/`; needs scope split |
| Stash `preview54-excluded-local-video` | n/a | n/a | isolate | Launch-video policy; not touched |

## Details

### `codex/preview-46-ai-harness`

- **Commits**: `966b5f0` (wip: preserve selected-material harness research), `09b50c6` (wip: freeze preview 46 harness review snapshot)
- **Scope**: 127 files, +1542/-9135 (massive deletions)
- **Content**: Unfinished architectural refactor from Preview.46 era. Removes selected-material-address, material-address-outline, projected-layout-receipt, use-native-material-selection, use-structural-material-selection. Changes model-pool.ts, harness.ts, label-harness.ts, repair-harness.ts.
- **Conflicts**: 48 with current main — too many to resolve safely
- **Verdict**: stash
- **Preservation**: Tag `codex-wip-preview-46-ai-harness` at `966b5f0` with descriptive annotation. Branch `codex/preview-46-ai-harness` remains.
- **Recovery**: Evaluate for merge after architecture settles. The deleted files may have been reworked in main since Preview.46.

### `codex/selected-material-recovery`

- **Commits**: `b987ebb` (wip: preserve selected-material research)
- **Scope**: 45 files, +531/-5096 (massive deletions)
- **Content**: Similar to above but smaller scope. Unfinished refactor.
- **Conflicts**: 2 (add/add in `docs/reference/selected-material-language.md` and `docs/reference/selected-material-presentation.md`)
- **Verdict**: stash
- **Preservation**: Tag `codex-wip-selected-material-recovery` at `b987ebb` with descriptive annotation. Branch `codex/selected-material-recovery` remains.
- **Recovery**: Conflicts are resolvable (doc files, add/add — keep main's version). But -5096 deletions may remove still-needed code. Full evaluation needed before merge.

### `cloud/address-restore`

- **Commits**: HEAD `8d2d56a` (Tune selected material optical edges)
- **Scope**: 34 files, +668/-2074 vs main (two-dot diff)
- **Content**: UI/visual adjustment for selected material optical edges
- **Conflicts**: 0
- **Verdict**: already-in-main
- **Action**: No action needed. `git merge-base --is-ancestor 8d2d56a origin/main` confirms HEAD is in main. The two-dot diff shows main's changes that the branch doesn't have, not unique work.
- **Note**: Branch is stale (behind main). Can be deleted safely, but left in place per no-abandon policy.

### `tmp/action-lasso-api-hardening/`

- **Structure**: Full clone of repo at `af7b1c1` with 94 uncommitted files
- **Scope**: +3854/-801
- **Content**: Significant doc changes (architecture.md +101, protocol.md +134, product.md +59, changes.md +76) and code changes (CanvasChrome.tsx +186, RootedMaterial.tsx +290, CanvasChrome.module.css +227)
- **Concern**: Touches `docs/principles.md` (+11) and `docs/product.md` (+59) — protected by user policy ("不修改")
- **Verdict**: adapt (pending)
- **Preservation**: Clone preserved in gitignored `tmp/action-lasso-api-hardening/`. Work is not lost.
- **Next steps**: Split scope into (a) protected-doc changes to exclude, (b) non-protected doc changes to evaluate, (c) code changes to evaluate. Requires careful review before any merge.

### Stash `preview54-excluded-local-video`

- **Content**: Launch-video work from Preview.54 era
- **Verdict**: isolate
- **Action**: Not touched per launch-video isolation policy