# Codex Work Line Audit

> **Date**: 2026-09-17
> **Scope**: evidence snapshot, not repository policy or current instruction
> **Auditor**: maintainer role

## Summary

| Work line | Unique commits | Conflicts | Verdict | Action |
| --- | --- | --- | --- | --- |
| `codex/preview-46-ai-harness` | 2 | 48 | stash | Tag `codex-wip-preview-46-ai-harness` created |
| `codex/selected-material-recovery` | 1 | 2 (add/add docs) | stash | Tag `codex-wip-selected-material-recovery` created |
| `cloud/address-restore` | 0 | 0 | already-in-main | No action — HEAD `8d2d56a` is in main |
| `codex/action-lasso-api-hardening` | 17 candidate commits through `260b16d`, followed by remote-state records | 0 after rebase | merged via PR #102 | Implementation `fb37ef8` and browser diagnostic `2f3d506` were accepted through PR #102; later successors require their own proof |
| Stash `preview54-excluded-local-video` | n/a | n/a | isolate | Mixed 79-file historical snapshot; never restore or drop wholesale |

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

### `codex/action-lasso-api-hardening`

- **Structure**: linked Git worktree, not a clone; it originally started at
  `af7b1c1` while `main` had advanced to `9eb169b`.
- **Content**: submitted-action ownership, lasso/Elastic/mobile interaction,
  modal presentation ownership, a two-field sealed Model API, bounded provider
  discovery, and request-local model fallback.
- **Review correction**: `docs/product.md` and `docs/principles.md` are governed
  by `AGENTS.md` and were required reading; there was no repository instruction
  forbidding their maintenance. The relevant changes preserve rather than
  replace their product invariants.
- **Resolution**: the dirty worktree was split into reviewable implementation,
  verification, and release-evidence commits, then rebased without conflict
  onto `9eb169b`. Exact implementation `fb37ef8` passed the repository and
  focused browser gates; browser-diagnostic-only successor `2f3d506` passed the
  complete serial Chromium matrix. The candidate through `260b16d` was pushed
  as PR #102. Any later documentation-only successor must pass its own exact
  PR-head gates before merge. Launch Video remains outside the branch.
- **Recovery evidence**: the original Codex JSONL conversation and the local
  Code Arts SQLite session tree, memory, task, and spec caches were inspected as
  historical evidence. None was copied into the repository. That review
  corrected the earlier “separate clone”, “no runtime BYOK”, and blanket
  protected-document conclusions before implementation was accepted.

### Stash `preview54-excluded-local-video`

- **Content**: despite its name, a 79-file mixed historical snapshot containing
  launch captures alongside overlapping product, protocol, E2E, local-AI, and
  documentation changes
- **Verdict**: isolate
- **Action**: Not touched. Never pop, drop, or cherry-pick it wholesale; recover
  a specifically audited path only if later work establishes independent need.

## 2026-09-18 status update

- `codex/action-lasso-api-hardening` merged through PR #102 at `a6b8f91`; it is
  no longer adapt-pending or merely reviewable.
- The release-probe correction merged through PR #103 at `fca0558`.
- `codex/provider-action-reliability` contains committed follow-ups `9ba808e`,
  `abc1d05`, and provider-compatibility candidate `919743b`. The exact provider
  commit passed the repository gate, the complete Chromium matrix with all
  concurrent-run failures repeated serially, and an independent verifier with
  no P0–P3 finding. It remains unmerged until its public PR passes exact-head CI;
  local proof does not promote it to `main` or authorize a release.
- The preservation verdicts for `codex/preview-46-ai-harness`,
  `codex/selected-material-recovery`, `cloud/address-restore`, and the isolated
  Launch Video work remain unchanged. Do not wholesale cherry-pick, restore, or
  revert those historical lines.
