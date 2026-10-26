# Integration closure — 2026-10-16

## Vercel build replay — 2026-10-26

PR #136 is merged as `f22a3a1`; its required CI passed, including 340 browser
journeys with 18 intentional skips and compiled recovery N1–N5. The GitHub-linked
production deployment failed; existing account access cannot read its logs.

An isolated replay using the cached official `@vercel/next` 26.0.1 builder
reproduced a concrete build rejection without login or upload. Next compilation
succeeded, but deployment-mode output adds two Wiki runtime cold-entry failures
(35,175 / 34,816 gzip bytes) to the three known diagnostics. The wrapper's
three-diagnostic allow-list rejected them, returning exit 1 before packaging.
The correction accepts only those two exact existing caller paths, retains every
ceiling and version expiry, and still rejects unknown callers or other failures.
This is a local reproduction, not access to the hosted failure log or proof of
a successful deployment. Raw replay output is local under
`/private/tmp/matter-vercel-replay-20261026/`.

After the narrow correction, the same official builder completes server tracing,
serverless function generation and static collection (155 output entries).
The replay uses an isolated tracked-source snapshot with existing local
dependencies, not a clean Linux install; no account was authenticated and no
artifact uploaded. Policy/config tests 19/19, focused ESLint and local Markdown
links pass. The unchanged budget checker continues to report the five failures.

## PR continuation — 2026-10-25

PR: [#136](https://github.com/p-to-q/matter/pull/136), ready for review on
`codex/engineering-closure`. CI is running. CodeRabbit reports a successful
status but explicitly **skipped review**: 416 changed files exceed its 100-file
limit. No CodeRabbit review is claimed; local independent passes remain their
own evidence. The owner subsequently prioritized main integration with explicit
budget debt.

Latest owner correction: the entry reads **绘图** / **繪圖**; the unavailable
explanation uses the existing lower-left paper outcome line, with no visible
footer beneath the field. Focus, exact field dimensions and zero image requests
are held by the new browser assertion. Five focused unit suites (113 tests),
TypeScript and eight browser journeys pass.

Complete local browser first run: 334 passed, 18 skipped, six failed. Those six
exposed stale health-read ownership, pre-drawing-control width expectations and
V7 export-field assumptions. Their assertions now retain the correct owner,
reserved geometry and strict V8 shape; all are covered in the eight passing
journeys. This combined evidence is not a fresh all-green full matrix.

Hosted CI exposed the new Node test missing from Vitest's exclusion list; it is
now explicitly owned by `node --test` in both runner lists. Latest-head hosted
results are required. Vercel has failed before an accessible build log is
available: current local browser/CLI account lacks the deployment team's scope.
The same dedicated-domain build succeeds locally with the three declared
budget failures. Do not infer a hosted success or a precise platform error.

Vercel's build entry now uses the bounded integration wrapper. Only the three
recorded Wiki budget diagnostics are accepted, and only for package version
`0.2.0-preview.64`; version changes, unknown/global budgets, malformed diagnostics
and compilation/checker errors still fail. The ordinary local build/check stay
strict. Policy/config checks 19/19 pass. Hosted deployment is still being
verified, rather than inferred from this local policy result.

Status: main integration authorized, prerelease acceptance withheld. The
isolated `codex/engineering-closure` branch incorporates the current main
maintenance change while preserving the original dirty `claude/preview-65`
worktree. The PR will carry the accumulated product and engineering work;
opening it does not qualify the unfinished Wiki campaign or enable image spend.
The owner subsequently accepted explicit runtime-budget debt for main, to be
revisited before the next prerelease. CI keeps a named budget check and warning;
other checks remain blocking. Do not describe the budget as passed.

Fresh independent review passed the deployment observer/reload boundary (139
focused tests), static entry checker (24 tests), and P1-R non-evicting picture
retention. P1-R's builder ran 195 focused cases and TypeScript/lint; a separate
64-case owner rerun passed. A full cache may conservatively refuse replacement;
reclaiming dead or orphan cache entries remains excluded.

The native owner-bundle R1–R5 rerun passed all five cases with zero external
requests and source stability during proof. Its artifact SHA-256 is
`80119ee7630db91a5fe848531568a4bd8d0b44ccec4910f40817f647408f99c4`;
source inventory SHA-256 is
`95e7c05e29d71f67b5000edd614ceccd2f01869cd66c77c10ee43e2c12df6c00`.
It still does not qualify the compiled Next page or a real release vehicle.

The new deployment browser cases initially failed: one counted the independent
image-availability health request as a deployment check, while the other
expected a disabled React button to invoke its handler. Diagnose those fixture
assumptions against the existing owner guards; do not weaken material, spend,
or reload assertions. Final results are recorded separately below when run.

Evidence retention correction: a Playwright invocation without a distinct
`--output` directory cleared the default `test-results/`, including earlier
gitignored logs. Their historical summaries below are not raw evidence still
available locally. Current receipts are regenerated under
`/private/tmp/matter-pr-20261025/`, and subsequent browser invocations use
separate output directories. No source or user material was removed.

The external-generation review counterexample was addressed at the coordinator:
adopting another durable generation advances a transient passive-evidence cutoff,
checked inside each transition/CAS rebase attempt. Old passive applications are
censored; explicit decisions and applications at the refreshed revision remain
eligible. This trades some passive learning across unrelated external writes
for preserving negative human authority. Focused missing-signal/CAS/explicit
intent tests pass. No durable relation-history field was added.

First compiled Next proof: N1/N2/N4/N5 passed; N3 and artifact stability failed.
The counterexamples are retained. The native upgrade's parallel idb completion
promise now has an owner. N3's corrected recovery entry is a genuine browser
reload after removing the synthetic fault: Retry Saving does not adopt an
unread row after failed initial hydration. Artifact identity excludes only
Next's documented-by-source runtime `server/route-cache`; emitted code remains
hash-bound. A fresh full qualification is still required after these changes.

The complete browser matrix, compiled-page recovery and hosted CI/review remain
to be completed. Owner visual acceptance and actual-release-vehicle recovery
remain prerelease gates even after the authorized main integration.

Final-source continuation: Node tests 191/191, Vitest 5,567 passed / 7 skipped,
Wiki qualification 9/9, typegen/types/lint and production compilation pass.
`npm run check` still exits nonzero at the runtime-budget step: Wiki runtime
29,610 / 27,648 gzip bytes; Wiki settings 11,745 / 10,752; settings cold entry
49,420 / 49,152. No cap was raised. The owner's main-only exception is reflected
in the named non-blocking CI step; prerelease qualification still fails.

The fresh compiled-page N1–N5 rerun passes all five cases: artifact and source
stable, zero external/denied API requests, zero page errors, no browser-side
product owner injection. Build ID: `r3A9NMQQ7gGgOMe-Eeemi`; artifact SHA-256:
`27d8823290cbd0ad675e52dcdd6060aecc5d01a06d67f01f22103bd726779c32`.
The 918-input inventory was frozen before compilation and rechecked by the
runner (`716bf1c6c66702b321cd8e0db0ce5a9822725e40b7f639b8f0868bc7238f052a`).
This qualifies the local compiled page, not an actual release vehicle, redeploy
or old binary downgrade. N3's recovery entry is browser reload; Retry Saving
after failed first hydration is explicitly not qualified. Raw failed and passing
receipts remain separate in `/private/tmp/matter-pr-20261025/` and the runner's
gitignored `test-results/recovery-next-*` directories.

Status: implementation and evidence ledger for the owner-authorized wave on
`claude/preview-65`, based at `c3b96c2` plus retained local changes. This is not a
release, a deployed-service receipt or a second roadmap. The active plan owns
execution; existing principles and contracts remain intact.

## Engineering continuation — active, 2026-10-16

The owner subsequently reopened implementation. The closure-only receipt below
is preserved historical evidence, not the current work restriction. Exact
freezes are at the top of the active plan. This continuation is not a release
or an all-green final-source receipt; serialized Wiki and deployment-version
builders are currently active.

| Boundary | Fresh evidence / current state |
| --- | --- |
| Two retained browser failures | Unchanged cases, assertions and deadlines repeated three times each: 6/6 pass. The old English trace spent its budget before geometry assertions; the Chinese trace was damaged. This does not prove a persistent product bug was fixed or a complete matrix passed. |
| Lazy picture-store lifetime | Generation/promise-identity fencing and real-holder refusal implemented. Independent review passed; 64 focused cases and mixed-media timestamp probes passed. Closing during restore refuses import without claiming accepted DB writes were cancelled. |
| Composed import failure | New actual-chunk-failure browser case exposed misleading unsupported-browser copy; the generic action refusal now preserves the document and reports no fabricated session bytes. All five picture Archive journeys pass, zero retries. The two earlier failed attempts remain retained. |
| Static entry budgets | F1b-T now counts exact caller-owned static JS/CSS groups, with cold and initial-subtracted costs separate. Independent Node tests 24/24 pass; no old own-chunk/global cap raised. |
| Mixed-media Archive | Existing 69 tests pass in each of four fresh TZ processes (UTC, Shanghai, Los Angeles, Kiritimati); both local and central ZIP stamps are checked for text, PNG, JPEG and WebP. |
| Resource/spend owners | Existing local tests rerun: 241 lifecycle/bytes/route cases plus 34 pool/admission cases pass. They do not prove distributed spend control, a real provider answer, or safe byte reclamation. Image stays off; zero user bytes deleted. |
| Full engineering batch check | First run passed tests/types but lint included a retained generated recovery bundle. Scoped ESLint output-directory ownership was corrected without source-rule exceptions; recheck passed Node 191, Vitest 5,497/7 skipped, Wiki 9/9, types/lint/build/runtime. Later edits need a final fresh check. |
| Actual Next recovery | P1-N frozen; separate runner under construction for N1–N5 through the compiled page and Archive UI. Existing source-owner R1–R5 remain valid at their recorded identity, not promoted to this proof. |
| Wiki W0 | One serialized unreleased builder under the new exact schema/transition/CAS/byte/policy freeze; not yet qualified. First hearing, new producer authority, accent adaptation and ASR hints are excluded. |
| Deployment-version recovery | Separate F1b-D builder: immutable build identity, bounded idle observer and guarded manual Archive reload. Next automatic skew reload is excluded because it bypasses held-work checks. Not yet qualified. |

Local raw logs are gitignored under
`test-results/engineering-20261016-qh1Oyv/`. `archive-browser.log` and
`archive-browser-recheck.log` preserve failed counterexamples;
`archive-browser-final.log` records 5/5. `check-batch1.log` retains the
generated-output lint failure; `check-batch1-recheck.log` retains the passing
recheck. Do not commit generated proof bundles, raw material, traces or secrets.
The current submitted PR/CI/CodeRabbit and main deployment remain absent for
these dirty changes. Final complete E2E, visual acceptance and real release-
vehicle recovery readiness remain distinct open gates.

## Coverage and evidence boundaries

The table below describes the preceding closure wave. Read the active
continuation above before treating any retained open item as current progress.

| Area | Before this wave | Current implementation / qualification limit |
| --- | --- | --- |
| Earlier lifecycle fixes | First paint, late delivery, Inquiry ownership, pointer focus and ID entropy had focused proofs | Preserve them; include affected paths in final checks. Earlier green runs are not final-source proof. |
| Trail / lens | Adjacent structural paths, inverse-zoom endpoint metrics, stable two-action Preview lens implemented | Preserve geometry and presence tests. Visual acceptance is still the owner's, not conferred by snapshots or unit counts. |
| Copy and context | Shared bounded projection, literal single Copy, nested Markdown + matching HTML, 14 adverse fixtures | Preserve no-hidden-context and exact address semantics; no model-envelope expansion without contrary evidence. |
| Receipt | v1 body and strict verifier; no v2 | v2 writer/verifier implemented: shared human outline, positional relations, canonical hash and size guards; v1 verifier/goldens retained. Included in the passing current full check. |
| Copy delivery | Guards existed before a write but receipt success could outlive document replacement | Both clipboard completion paths revalidate document ownership; stale completion publishes no success on the replacement document. Included in the passing current full check. |
| Database recovery | DB7 upgrade tests, incomplete R1–R5 | R1–R5 passed in fresh native Chromium contexts with actual owners, canonical digests and an identified compiled artifact. A deployable DB7-aware recovery build through the real release vehicle is still unqualified. |
| Drawing discovery | Health-off removed the entry | Plain-text **生图**, inert unavailable reason and stable reserve implemented. Current focused browser run is 7 passed / 2 failed, detailed below; the language-switch result path is not closed. |
| Picture lifetime | Brief → render → preview → Keep/Discard; bytes before tree pointer; Undo and Archive | Preserve these owners. No blob deletion until complete roots, stable cross-tab coordination and rollback proof pass. |
| Budgets/loading | Global artifact cap and lazy owners; incomplete F1b patch | 24 source-accounted capability entries and emitted-asset ceilings pass, including checker counterexamples in full check. Initial gzip 402,437 B / 396 KiB cap. Transitive first-use cost, deployment identity and idle stale-version recovery remain separate open work. |
| Wiki | Qualified current V7; interrupted V8 scaffold | Research and one serialized builder packet below. Do not turn the schema constant to 8 or copy whole old files. |
| Deployment/local models | Image off; private text API support, narrow local Wiki/ASR | Preserve these distinctions. Picture BYOK, qualified local generative models, offline application boot and client packaging are not yet delivered. |

For the six review questions in `workflow.md`: use current owner/source and the
primary sources below for unresolved mechanics; test bounds and late/failure
paths; keep disjoint builder lanes and one integrator for shared contracts;
reuse existing codecs/loaders/effect boundaries; reject a second material model
or service locator; inspect real interaction separately from code proof.

## Drawing: payer, admission and recovery

The owner settled the product policy: a person's own model API is paid by that
person; the Matter-hosted path is paid by Matter. This is not permission for a
client to claim it is self-funded. Today the image route is operator-funded;
the existing private text-provider lease does not include image generation.
Until an explicitly scoped image lease exists, retain that truthful boundary.

Keep the implementation small: the current image route and driver remain the
owners. A future picture lease needs explicit image model/transport capability,
request-local credential scope, separate brief/render deadlines, one paid render
attempt, bounded bytes and identical Keep semantics. No silent fallback from a
failed private/local route to a Matter-paid provider. Do not put credentials,
provider URLs or spending records into material, receipts or public logs.

| Step | Evidence required before promotion | Failure / recovery |
| --- | --- | --- |
| Discovery | Real local page shows text entry and reason with image off | No request; Voice/Rewrite remain usable; no surprise row resize. |
| Fixture chain | Synthetic brief/render, preview, Keep, Undo/Redo, reload and Archive with missing bytes | Bytes may exist without a committed pointer; a pointer is never committed before verified local bytes. |
| Configuration self-check | Existing health/deployment checks identify exact candidate and configured capability | Health is configuration evidence, not a successful provider answer or spend control. |
| Real-service check | Separately authorized synthetic passage, exact source/prompt/provider identities, a fixed call count and private receipt | One brief then at most one paid render; no retries that can charge twice. A timeout may still have cost money. Never print keys or passage/image contents. |
| Operator funding | Independently enforced distributed edge rules, provider-account hard cap, responsible operator and tested alert delivery | Per-instance 3/minute and 2 concurrent are only a first line of defence; no multiplication by an assumed server count. Missing evidence keeps image off. |
| Resource pressure | Existing session/byte capacity and Archive missing-count proof | Preserve durable blobs; failed Keep retains the session result for explicit retry; quota pressure is not permission to delete history-reachable bytes. |
| Reclamation | Complete roots across every snapshot, old journal/Undo/Redo, unsaved state, Keep and import reservations; stable writer coordination, grace and atomic delete proof | Any unknown/newer/malformed root, missing participant or failed transaction means zero deletion. See the existing recovery audit's full matrix. |
| Recovery/redeploy | R1–R5 plus a deployable, identified DB7-aware image-off build and a private redeploy receipt | Disable the image gate; recover forward with a DB7-aware build. Never downgrade the database or clear user storage. |

Existing executable entry points are `npm run check:deployment`,
`npm run proof:persistence`, and the new `node scripts/prove-recovery-indexeddb.mjs`.
The last runner admits loopback artifact requests only and uses fresh synthetic
contexts. It does not qualify a deployable Next build or call a provider. The
existing local image demo may spend a real **text brief** even when image bytes
are faked; it is not a substitute for a fully closed fixture.

Exact currency ceilings and live probe calls have not been authorized or
configured in this wave. Keep image production off. Recovery and reclamation
conditions are durable engineering gates, not a new billing framework.

Archive continues to carry one front-matter `index.md` per passage. The future
`"format":"matter-archive/1"` marker is a separate compatibility slice: freeze
exact legacy/current/newer readers before changing its writer, retain unknown
newer bytes and say “a newer Matter”, not a generic invalid-archive error. This
wave changes no Archive schema, timestamp semantics or restoration authority.

## Claude Wiki continuation packet

This is the next serialized Wiki design/build boundary, not a schema migration
receipt. Physical IndexedDB **7**, Wiki record **7/8**, Archive and material
protocol versions are independent. The current V7 remains authoritative while
the stored shape, true transition owners and byte proof are completed together.

Reuse `persistence/wiki-coordinator.ts`: unchanged transitions return before
compile/save; changed candidates compile, CAS-save, await transaction completion
and only then publish. A CAS conflict may publish separately validated durable
authority, never the failed candidate. No new coordinator or prompt glossary.

| Stored row / action | Frozen safety requirement |
| --- | --- |
| Missing or validated legacy | Load may initialize/normalize only exact record7/state7; optional failed normalization must preserve readable bytes/generation. |
| Exact 7/7 | Read without put; hydrate normalized memory only. Refresh, compile, no-op and censored outcomes cannot promote it. |
| Exact 8/8 | Strict read without put; only after complete V8 schema/behavior qualification. |
| Mixed 7/8 or 8/7 | Refuse and retain; never repair or guess at a load. |
| Newer version | Truthful superseded state; no downgrade/reset. |
| First accepted changed write | Require matching non-null generation and greater revision; atomically commit exact 8/8, then publish. |
| Failed CAS / quota / put / commit | Preserve stored version and failed-candidate publication boundary. |
| Explicit corrupt reset | A deliberate human write, not automatic load repair; V8 writer only after the full lane is qualified. |

The proposed V8 shape preserves current authority/evidence and adds only bounded
provenance/import batch, preferences, maturity and effectful counters. Before
codec work, close these exact constraints in the one Wiki lane:

- Provenance is closed: manual, imported, learned, collected, starter. Import
  batch is required only for imported authority, with a bounded opaque grammar;
  migration cannot infer human intent from unknown past records.
- Preferences have one entry per supported locale and a reviewed finite accent
  vocabulary. No arbitrary unbounded locale/key maps.
- Maturity references live authority/evidence, records at most three actual kept
  settlements, and establishes through a revision-bounded ordinal, not a wall
  clock. Revert/remove/rename must clean the matching records.
- Counters use named bounded integers on real effectful transitions; censored
  outcomes stay transient. A derived diagnostic receipt owns every UI number.
- Producer family and channel are comparable-opportunity facts. Resolve whether
  term authority is shared while its aging counters are channel-local before
  changing evidence representation; the retained patch drops producer scope.
- Reject relation cycles/shadowing at the actual write boundary. Prove strict
  V7 encoding and V7→V8/V8 round trips, old-reader behavior, load spies, failed
  transaction publication and worst-case encoded bytes, not only empty migration.

Acceptance order: exact schema/bounds + transition decisions → codec/repository
and no-op/failure tests → comparable aging and effectful diagnostics → byte
proof → source-bound Wiki qualification → settings/export consumers. Do not
release a schema-only V8 or qualify consumers against a placeholder. Later
runtime changes need a fresh qualification digest. This packet adds no hidden
retrieval, generated-text learning, transcript retention or material Undo mining.

## Primary sources and limits

Borrow stable identity, not Atom's full feed protocol, from
[RFC 4287, atom:id](https://www.rfc-editor.org/rfc/rfc4287#section-4.2.6).
The shared Markdown codec follows a deliberately closed subset informed by
[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/); arbitrary viewers may
display control-character references differently, so exact text round trips
are a Matter codec promise, not a universal renderer claim.
[IndexedDB 3.0](https://www.w3.org/TR/IndexedDB/#abort-a-transaction) supplies the
native abort/versionchange semantics exercised by R2/R3. Source research is not
a replacement for the real-browser receipts or deployable recovery qualification.

## Closure-only verification receipt — 2026-10-16

The owner stopped feature expansion and requested a full engineering check,
the seven previously failed browser scenarios, coverage and handoff. This pass
changes documentation only. No product/test assertion, timeout, retry count,
dependency, storage schema, provider gate or deployment was changed.

The earlier `/private/tmp/matter-closure-2026-10-16-*` logs and recovery artifact
were absent when this pass began. Their remembered counts are not current
receipts. New raw outputs and the recovery artifact are retained locally under
the gitignored `test-results/closure-20261016-TlbUDr/`; do not commit them.
The record below remains meaningful if that disposable directory is later lost,
but its absence would require regeneration before another artifact readback.

| Command / boundary | Current result | Retained output |
| --- | --- | --- |
| `npm run check`, default sandbox | Exit 1: Node 176/184, eight local-image relay cases refused loopback listen with `EPERM`; later stages not reached | `check-sandbox.log` |
| Same complete check with approved local process/loopback permissions | Exit 0: doctor, docs (80 files), Node 184/184, architecture/studio checks, Vitest 5,488 passed / 7 skipped (347 passed / 3 skipped files), Wiki qualification 9/9, type generation/check, lint, production build and runtime checks | `check.log` |
| Serial Chromium subset, port 3139, one worker, zero retries | Exit 1: 7 passed / 2 timed out in 8.1 minutes; not a complete E2E run | `browser.log`, `browser.json`, `browser/` |
| `node scripts/check-runtime-artifact.mjs --json` | Exit 0: static root; initial raw 1,262,097 B / gzip 402,437 B (393.0 KiB), below unchanged 396 KiB cap; 24 budgeted capabilities, 31 dynamic imports and one explicit research exclusion | `capabilities.json` |
| `node scripts/prove-recovery-indexeddb.mjs` | Exit 0: R1–R5 pass, same legacy fixture, source stable during proof, zero external requests and empty stderr | `recovery.jsonl`, `recovery.stderr.log`, retained `recovery-artifact/` copy |

Runtime: Node `v22.20.0`; recovery Chromium `153.0.8010.12`. Long-running
commands used `caffeinate -i` only for their process lifetime; this changes no
system setting.
Loopback permission was explicitly approved; no paid service or production
environment was exercised. The owner review server on 4310 was not taken over.

### Browser coverage and remaining failures

Five historical failures could be mapped exactly from the retained context.
The two parameterized en-US/de-DE failures could not be distinguished as
desktop versus phone without the lost original log. Instead of claiming an
exact recovered seven-test list, this run covered both variants: nine tests,
all in `e2e/picture-control.spec.ts`, with the original assertions and budgets.

| Scenario (source line at this candidate) | Result |
| --- | --- |
| Every language at 390 px (`:643`) | Pass |
| German/Chinese language switch (`:689`) | **Fail**: Chinese `保留` absent at `:704`; captured page still says drawing. Global 60s budget and context teardown also expired; trace reported a truncated ZIP. Cause not established. |
| Desktop en-US normal row (`:887`) | **Fail**: global 60s budget expired in `openField`'s existing 350ms settle wait (`:739`), before geometry assertions. This is not evidence of an incorrect measured width. |
| Desktop de-DE normal row (`:887`) | Pass |
| Desktop en-US dark (`:910`) | Pass |
| Phone en-US and de-DE (`:925`, two cases) | Both pass |
| Late health response leaves open row unchanged (`:1024`) | Pass |
| Returned spoken direction preserves outside focus (`:1100`) | Pass |

The exact subset uses `--project=chromium --workers=1 --retries=0
--trace=retain-on-failure --reporter=line,json` and this grep:

```text
field stays inside|German and Chinese|en-US: one row|de-DE: one row|en-US: 48 px|de-DE: 48 px|en-US: the same holds|an answer that arrives after|a returned spoken direction
```

The truncated ZIP is a Playwright trace/teardown failure, not evidence of a
damaged Matter Archive. No automatic retry or successful unrelated test clears
either behavioral failure. Next executable step is this two-case diagnostic
run, separating fixture/request completion from test-process timing:

```sh
node scripts/run-e2e.mjs e2e/picture-control.spec.ts --project=chromium --workers=1 --retries=0 --grep 'German and Chinese copy appear when the language is switched|en-US: one row'
```

Do not relax Keep, geometry, focus or deadline assertions to obtain a green result.

### Source and artifact identities

The source/test/config inventory is
`c13c893cc972241290243996f8036423186eeefc39bee33f181c43e35a8ccb5e`,
unchanged before and after the checks. `source-files.sha256` retains its inputs.
Reproduce with the inventory command in the handoff; this is a dirty-working-
tree inventory, not an immutable commit or deployed-source receipt.

Production build id: `03lS1F9lLzXguv3nwVZD8`; browser-assets digest:
`6aea288cf59b174c46533ad9003def1d28e4d5cb5483d1465b03cd1fd1b0c856`.
Capability source digest:
`9809a9ddaff4791a84b13e700ff5321b30c13818b1894d8b8f25b38e4101da01`.

Recovery owner-source inventory:
`236a355a709eae8d3ff4bffcc851322d14c0095915935f7c25499c904c359fc6`;
artifact SHA-256:
`0879f0857f2faa001cfb298c61a75ad9cea85a47a0fae1044bacab4a93540532`
(283,217 B). The retained original manifest hashes to
`65f3c45cf33e14d3ec23f77833c598c79547500bb1082da53847fa9e5dae8eef`.
Its original temporary path is recorded in the JSONL; the local retained copy
has identical bytes. R5 exports one available referenced picture, reports one
missing picture, excludes history-only bytes from Archive, then imports into a
fresh database with an empty Undo boundary. The available and history-only
images separately survive R4 readback/Undo/Redo. No user origin was opened.

### Gates deliberately still open

- Both browser failures above; complete final-source E2E and CI.
- Owner visual acceptance, including the trail/lens candidate.
- A deployable, image-off DB7-aware recovery build qualified through the real
  release vehicle; this source-bundled native proof explicitly sets
  `deployableNextRecoveryBuildQualified: false`.
- Distributed image abuse/spend controls, authorized real-provider checks,
  complete-root byte reclamation and its writer/recovery proof. Image stays off.
- Retained work (not all first-release gates): transitive first-use budgets,
  deployment/idle-version recovery, serialized Wiki V8 qualification,
  private-image API and qualified local generative models.

Status is **partial / NOT-GO for merge or release**. Implementation of the
picture entry, Receipt v2, native recovery runner and per-capability budget
checker is recorded separately from these remaining qualifications. No commit,
merge, deployment, database downgrade or user-byte deletion occurred.

Independent final readback approved the evidence and handoff: current source
inventory, all 45 recovery-owner sources, retained artifact/manifest, emitted
capability hashes/gzip counts and browser/full-check results matched. This was
a read-only review, not another test run or approval of the open release gates.
