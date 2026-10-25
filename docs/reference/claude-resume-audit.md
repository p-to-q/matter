# Claude campaign recovery — 2026-10-16

This is a read-only recovery audit, not permission to merge an interrupted
patch. The active plan remains the only execution queue. Current source and
tests outrank branch names, historical transcripts and builder intent. Private
local progress records were inspected; no transcript or user material is copied
into this public repository.

## What survived

Q0 (`beaf7cc`), F1a (`ef1d6e3`) and N1 (`c060204`) are integrated ancestors of
the current candidate. F1b and W0 stopped without a final builder receipt or
independent verification. Both interrupted worktree HEADs are ancestors of the
candidate with no unique committed work; their value is in unstaged patches.
Do not reset, clean, archive, overwrite or treat them as completed branches.

| Interrupted lane | Audited patch | What it does not establish |
| --- | --- | --- |
| F1b, base `ba4d21a` | 21 tracked changes and one untracked file; mostly lazy-module `CHUNK_SENTINEL` additions and an `fflate-chunk.ts` wrapper | No capability manifest owner, artifact checker/test, deployment identity or stale-version proof |
| W0, base `9015fdb` | 15 tracked changes; V8 model/codec/default fields, coarse bounds and mechanical provenance/fixture changes | No qualified schema migration, effectful maturity/counters, comparable aging, diagnostic receipt, complete adversarial tests or byte proof |

Separate film worktrees remain separate. A divergent dependency experiment is
not a missing product commit. These observations describe this audit snapshot;
recheck worktree status before a future transplant. Do not resume by copying an
old complete file over a newer owner.

## F1b: capability loading is not a sentinel list

The interrupted patch names chunks but does not prove the capability contract.
Resume against the current import graph after the active integration freezes:

1. Inventory actual dynamic imports and current loading/first-use consumers.
2. Keep the retained manifest contract limited to build-checkable facts:
   `id`, `sentinel`, tier and `budgetGzip`. Inventory the prefetch trigger and
   owning entry, but leave triggers in their owning code rather than adding
   runtime dispatch to the manifest. Do not create a service locator or plugin
   framework.
3. Implement only the necessary ownership/checker path; evaluate the old
   sentinels individually rather than transplanting every one.
4. Plant violations for missing/duplicate identity, wrong tier/budget and
   initial-graph leakage, then prove the deployed-asset/stale-version boundary.

The existing 396 KiB initial gzip cap does not move. A `CHUNK_SENTINEL` export
alone proves neither correct loading nor safe failure of a stale client.
Allow runtime manifest/checker/tests and approved module annotations only;
exclude the current presence, geometry and material-format lanes while active.

### F1b-R current-source inventory

The TypeScript AST audit found 32 actual dynamic-import calls and 26 unique
literal specifier strings; type queries were excluded. These are source counts,
not a proven count of resolved capability modules or emitted chunks. Existing
owners already schedule intent,
idle/background hydration and on-use work in `idle-preload.ts`,
`preloadable-component.tsx` and `chunk-recovery.ts`. The current loading/failure
table is in [`runtime-cache-and-delivery.md`](runtime-cache-and-delivery.md).
No new loader or scheduler is justified by this inventory.

`scripts/check-runtime-artifact.mjs` already checks the initial graph, hashed
assets, the global budget and two seed sentinels, with planted-failure tests.
Extend that path, preserving seed co-location. Source coverage must distinguish
real `ImportExpression` nodes from `typeof import()` using the existing
TypeScript development dependency, not a new runtime parser. An explicit
performance-fixture-only target needs an honest manifest row or checker
exclusion, never silent promotion to a normal product capability.

Before a manifest build, freeze missing/duplicate/orphan rows, nonliteral
imports, type-query exclusion and fixture treatment. Artifact proof must catch
tree-shaken/missing or repeated sentinels, non-core initial leakage, unhashed
lazy assets and each row's gzip overflow. A shared emitted chunk is not a
duplicate sentinel; every sentinel must occur once and each row's ceiling must
hold. Trigger timing/degraded behavior remain separate owning-code tests.
Use a fresh frozen-source build to choose bounded per-capability headroom;
this source audit supplies no new measured artifact budgets.

The retained `deploymentId` and idle health-version mismatch requirement still
stands, but needs a following separately frozen owner: the audit found no
existing version-health lifecycle to reuse. Do not smuggle a new status/control
plane into the manifest checker or call F1b complete without that remaining
requirement. This split preserves the original intent, not its completion.

## W0: close the persistence contract before new behavior

The proposed **Wiki record V8 is not IndexedDB database v8**. Record format,
physical database upgrade, material snapshot and Archive versions are separate
boundaries. A version constant cannot be the migration design.

The interrupted code added `ruleMaturity`, `outcomeCounters`, preferences,
provenance and optional `importBatchId`, but parsing/defaulting fields does not
give them a transition owner. Its `encodeWikiStateAsV7` has no caller. The
unchanged repository writes the current record version on initialization or
version mismatch during load. Changing its constant to 8 would therefore write
V8 during load, contrary to the retained requirement for V7-on-load and
V8-on-first-effectful-write.

| Recovery slice | Ownership and exact missing proof |
| --- | --- |
| W0a record/repository | Model, codec, repository, record types and their tests. Freeze fresh/legacy/V7/V8/newer-reader behavior; V7-on-load, V8 only at a genuine accepted write; failed CAS and storage refusal cannot publish the failed candidate. Preserve existing validated durable refresh/rebase. Prove load writes with spies, round trips, old-reader/rollback behavior and maximum encoded bytes. |
| W0b identity/invariants | Bound provenance/import-batch values and legal combinations, preferences/locale uniqueness, maturity revision/time consistency, cycle/shadow rejection and truthful superseded outcomes. Defaults are not evidence of valid semantics. |
| W0c comparable opportunities | Producer family and channel belong to the actual opportunity/aging owner. The patch's optional `producers` field is dropped by `agingScopes`; alias/term aging does not yet use it, and term aging is not channel-comparable. Keep per-turn facts transient and test non-comparable opportunities. |
| W0d stored behavior/diagnostics | Add maturity/counters/preferences only with real effectful transitions. Censored evidence stays memory-only. One derived diagnostic receipt, strict capacity bounds and measured headroom precede W7/W8 claims. |

This is a recovery decomposition, not four parallel Wiki builders. Wiki's
source-bound qualification digest requires one serialized lane. W1 depends on
the maturity/provenance contract, W7 on a truthful receipt, and W8 on a complete
strict record. W3a needs its own measured producer boundary; a schema scaffold
does not qualify pronunciation or ASR hints.

Existing runtime authority stays narrow. No prompt glossary, model context,
hidden retrieval, generated-text learning, Material Undo mining or unqualified
producer activation is introduced by recovery. Preserve prior pronunciation,
licence and dictation research in the linked contract notes instead of
repeating it or replacing it with a generic best-practice list.

### W0a current-owner research and freeze prerequisite

The follow-up source audit found an existing effect boundary, not a need for a
new coordinator. `persistence/wiki-coordinator.ts` returns before compile/save
when a transition is unchanged; an accepted change compiles, saves through CAS,
awaits transaction completion, then publishes the new basis. Its tests prove
that failed candidates do not replace the basis; a CAS conflict may rehydrate
and publish independently validated durable authority from another tab.
`wiki-repository.ts`
currently creates or normalizes V7 during load and writes V7 on save. An outer
record constant change alone therefore cannot implement deferred V8 writes.

The next freeze must distinguish these cases explicitly:

| Row/action | Proposed W0a acceptance, not current implementation |
| --- | --- |
| Missing / accepted legacy | Initialize or optionally normalize only record-7/state-7 on load; hydrate one validated new in-memory state. Optional normalization failure retains readable bytes and original generation. |
| Exact 7/7 | Read without put. A refresh, no-op, compile or censored outcome cannot promote it. |
| Exact 8/8 | Strict read without put; subsequent accepted writes stay 8/8. |
| First real changed write | Existing generation and greater state revision required; atomically commit record-8/state-8, await transaction completion, then publish. No creation through ordinary `save(candidate, null)`. |
| CAS / quota / put / commit failure | The failed candidate neither promotes storage nor becomes a published basis. Preserve existing conflict refresh/rebase, which may publish only independently validated durable authority. |
| Newer reader boundary | Never downgrade or reset a newer Wiki; name its refusal separately from physical IndexedDB refusal. |

Do not build this matrix against a placeholder V8. The exact stored shape,
per-field bounds, byte ceiling, and real transition owners for provenance,
maturity, counters and preferences must first be frozen with W0b/W0d's design
owners. That is one serialized, unreleased Wiki lane, not concurrent builders
or permission to ship W0a alone. The existing V7 contract remains authoritative
until that freeze is accepted and deliberately revised.

The proposed packet allows versioned stored types/codec, empty initial-state
construction, repository CAS and focused codec/repository/coordinator tests;
it forbids physical DB version/stores/indexes, coordinator/runtime behavior,
UI, provider/model context, material, protocol, Archive and dependencies.
Strict V7 encoding, V7→V8/V8 round trips, exact raw-writer bounds, maximum
encoded bytes, old-reader behavior, no-op spies and failed-transaction
publication are mandatory proof. Mixed 7/8 pairs and explicit corrupt reset's
writer version still need an explicit decision in that freeze. Prefer retaining
an incompatible mixed pair without automatic repair; do not invent the policy
by changing a parser constant. No schema or data was changed by this audit.

## Dispatch and verification

Before any builder resumes, record the five-line contract in the active plan,
name allowed/forbidden files and inspect the retained patch against the then
current source. Use a fresh isolated implementation lane when needed; do not
reset the interrupted checkout. A separate verifier checks failure behavior and
what was *not* implemented, not merely compile success.

The current integration first closes P0 timing, T0-A geometry and C3-A scope
proof. Next is the W0a persistence freeze and the F1b manifest freeze from this
inventory, rechecking the graph after source freeze, not an
automatic V8 write or an all-at-once Wiki merge. The full campaign remains open
until its focused tests, source-bound qualification and release gates are met.

Relevant contracts and preserved research:
[`../workflow.md`](../workflow.md), [`../engineering.md`](../engineering.md),
[`wiki.md`](wiki.md), [`runtime-cache-and-delivery.md`](runtime-cache-and-delivery.md),
[`local-transcript-repair.md`](local-transcript-repair.md), and
[`../../plans/active-tree-material.md`](../../plans/active-tree-material.md).
