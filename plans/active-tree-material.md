# Plan: Matter first release

## Deployment replay correction — 2026-10-26

```text
Outcome:    the authorized Wiki budget debt no longer rejects Vercel's build
Boundary:   version-bound integration build wrapper and its policy tests
Invariants: unchanged budget ceilings; no unrelated/global/checker failure is
            waived; version changes expire the exception; no provider gate opens
Proof:      official @vercel/next 26.0.1 replay fails before this fix with two
            additional exact Wiki runtime entry diagnostics; rerun packaging
Non-goals:  Vercel login, project linking, environment edits or a manual upload
```

Vercel's builder supplies deployment-related build environment that the plain
Next build did not exercise. Its measured debt additionally names the existing
`use-wiki-authority.ts` and `wiki-runtime-bridge.ts` callers of
`./wiki-runtime-core`, each over the unchanged 34,816-byte cold-entry ceiling.
Accept these two exact diagnostics under the existing owner authorization,
alongside the three already recorded; do not accept arbitrary Wiki callers.

## PR integration continuation — 2026-10-25

Owner's final surface correction: the Chinese drawing entry is 绘图 (繪圖 in
traditional Chinese). Invoking an unavailable entry reports through the existing
paper outcome line at lower left, keeping the field's size, typed direction and
focus intact; no visible footer or native title hint competes with that line.
The hidden accessible description remains. The closed-gate browser proof checks
zero image requests, exact before/after dimensions and the outcome owner.

The owner subsequently authorized this integration to reach main so the latest
product is visible. Preserve the original dirty worktree and use the isolated
PR branch. Budget failures must remain explicit, but are non-blocking for this
main integration only; restore blocking before the next prerelease. Other
engineering/browser failures still require diagnosis. Older passing receipts do
not qualify the new source, and main integration is not prerelease acceptance.

Deployment exception: Vercel uses `build-main-integration.mjs` for this
integration. It compiles normally, executes the unchanged budget checker, and
accepts only the five recorded Wiki diagnostics at package version
`0.2.0-preview.64`. A new version, unrelated/global budget failure, malformed
output, checker error or compilation failure remains blocking. The strict
`npm run build`/`npm run check` commands are unchanged. Two focused policy tests
hold acceptance/expiry and failure rejection; CI includes them in `npm test`.

External Wiki cutoff amendment: independent review found that an outer queue
flag cannot revoke a passive settlement already inside coordinator CAS rebase.
The coordinator now retains a bounded transient revision cutoff whenever it
adopts another durable generation. Old passive settlements become no-ops at
each transition/rebase attempt; explicit decisions and new applications at the
refreshed revision remain eligible. This deliberately censors some legitimate
passive evidence across unrelated external writes rather than inventing history.
Focused CAS, missing-signal refresh and explicit-intent tests hold this boundary.

Compiled recovery amendment: the first actual Next proof exposed an unobserved
idb upgrade-completion rejection and an incorrect proof assumption about Retry
Saving after failed first hydration. Own the parallel completion rejection;
qualify recovery through an actual browser reload, preserving all stored rows.
Do not claim Retry Saving can adopt a row the first load never read. Next's
runtime `server/route-cache` is separately mutable response data, not executable
artifact identity; all emitted code and other inventoried files stay hash-bound.

P1-R freeze — retain existing picture bytes on refused replacement:

```text
Outcome:    refused Archive import and durable Keep warming preserve every
            existing session-only picture, including a full cache
Boundary:   session-cache atomic non-evicting admission, picture acceptance,
            Archive byte restoration and their existing nullable facade
Invariants: no deletion, eviction of required holders, fake retention counts,
            budget expansion or snapshot rollback over concurrent writers
Proof:      full-cache, failed persistence, delayed/concurrent restoration,
            durable warming and invalid atomic-batch counterexamples
Non-goals:  reclaiming old pictures, retention leases or a new resource service
```

A full cache can conservatively refuse a replacement even if a future tree
would release space. Durable writes completed before a refused import remain
harmless content-addressed orphans; this does not authorize garbage collection.

Status: Active  
Current phase: 4 — first-release integration. Phase 1 is proven; Phase 2's
slices are proven in fixture mode, with their deployed live-mode path still
owed by the Phase 4 receipt; Phase 3 is proven except its deferred
active-document pointer. Public Elastic and Text Swap surfaces may use a user
lease; managed promotion stays off.\
Destination: the first usable public release at `ptoq.io/matter`

This is the only roadmap. It ends at the first release; it is not a forecast of
Matter as a platform. It holds only work that is active or still open. Proven,
completed, historical, reverted, and superseded sections are trace in
[`../archive/plans-0.2-history.md`](../archive/plans-0.2-history.md); the index
at the end of this plan lists them.

## Active integration — coherent material, craft, and release evidence

### Current authorization — engineering completion batches, 2026-10-16

The owner reopened implementation of the retained engineering gaps after the
closure-only receipt: browser failures without relaxed assertions, recovery,
resource/spend boundaries, adverse combinations, narrow robustness fixes,
loading/budgets/version recovery and the interrupted Wiki work. The previous
closure-only record remains history, not a ban on this newly authorized work.
No unrelated modality, manual-link runtime or desktop shell is added.

```text
Outcome:    close known engineering gaps in reviewable, independently proven
            batches before a final candidate can reach main
Boundary:   existing browser journeys and actual failure owners; production-
            artifact recovery proof; resource/spend contracts; capability and
            deployment recovery owners; one serialized Wiki implementation
Invariants: preserve dirty work, original behavioral assertions and budgets;
            tree-only mutation, no hidden context, exact undo and data retention;
            image stays off until independently qualified operational controls
Proof:      narrow counterexamples first, independent review per batch, native
            browser/production-artifact receipts, full check/E2E, then PR CI and
            CodeRabbit against the exact submitted source
Non-goals:  silent blob deletion or DB downgrade, arbitrary billing/sync/loader
            frameworks, schema-only Wiki V8, paid probes or production switch
            changes without a separately bounded operator approval
```

Execution order: diagnose the two browser failures on unchanged source; freeze
and build the smallest evidence-backed correction. Recovery/resource, loader
and Wiki researchers resolve real owners and return disjoint builder packets;
the integrator freezes each before code changes. Do not transplant interrupted
worktrees. Preserve failed receipts as well as corrected proofs. Prepare PR
batches only after their code, secret/artifact boundaries and verification are
reviewable; a green old commit never qualifies new working-tree content.
Final visual acceptance and actual deployment/recovery qualification remain
distinct from screenshots or a source-owner bundle.

F1b-T freeze — static entry-group budgets:

```text
Outcome:    each dynamic capability's emitted static JS/CSS entry cost is
            measured and capped, not only its sentinel-bearing chunk
Boundary:   existing artifact checker/tests and build-only capability manifest;
            read pinned Next react-loadable-manifest JSON and actual assets
Invariants: existing own-chunk/global caps and runtime loading stay unchanged;
            resolve caller/target ownership from AST, never execute manifests;
            fail closed on missing, unsafe or inconsistent asset/entry records
Proof:      real artifact groups and hashes; duplicate/shared/initial/CSS/path/
            missing-entry and over-budget counterexamples; independent review
Non-goals:  runtime registry/plugin, model weights, network timings, later child
            dynamic imports, automatic reload or deployment qualification
```

Keep `budgetGzip`; add `entryBudgetGzip`. Bound each caller's complete static
entry group independently, deduplicate its JS/CSS, and report initial-subtracted
incremental bytes separately without assuming a cache hit. Freeze the initial
new entry ceiling from the current measured groups with ten percent headroom,
rounded up to the next KiB, at least the existing own-chunk cap; record the
measurements rather than raising any established limit. Subsequent increases
require implementation evidence and review as usual.

P1-L freeze — truthful lazy picture-store lifetime:

```text
Outcome:    an unavailable picture-store chunk cannot report bytes as retained
            or let an invalidated pending load recreate a closed resource
Boundary:   picture-store access facade/tests and MatterApp's archive-import
            composition guard; existing store/repository/cache owners retained
Invariants: real durable-write failure still uses the actual session cache;
            no duplicate fallback cache or deletion; close remains reopenable;
            stale loaders cannot overwrite/clear a newer load generation
Proof:      pending close, reentry, late rejection/construction failure and
            unavailable restore before import; existing archive/store tests
Non-goals:  new persistence schema, GC, background import retries, provider
            changes or pretending a cancelled write rolls back committed bytes
```

When no holder can be constructed, facade restore returns a distinct refusal
(`null`), not a fabricated `keptInSession` count. The import composition returns
the existing generic Archive action failure before calling `importMaterial`.
P1-B's actual browser counterexample reopened the first error-code choice:
`ARCHIVE_UNAVAILABLE` claims this browser lacks Archive support, which is false
for a missing lazy chunk. Preserve that browser-capability error's meaning;
the private composition failure uses the existing generic action copy instead.
Ordinary storage refusal after a real cache exists retains current import and
session-only recovery behavior. Guard only the actual facade lifetime; do not
claim this cancels already accepted repository transactions.

P1-B extends that proof at the existing picture Archive browser journey: fail
the actual lazy store chunk by its unique capability marker, require a stated
Archive refusal and no image or material replacement, then export the original
Archive byte-for-byte. A nonzero intercepted fetch count prevents a vacuous
pass. Keep the ordinary real-cache quota-refusal journey unchanged.

P1-K freeze — revoke late Keep commit authority:

```text
Outcome:    disposal or loss of the exact passage basis while bytes are being
            stored cannot later commit a picture into material
Boundary:   PictureDriver accept's existing commit callback and focused tests
Invariants: already accepted byte writes may finish and remain harmless orphans;
            no deletion, duplicate render/retry, late state publication or new
            persistence path; a still-live Keep keeps bytes-before-pointer order
Proof:      delayed put plus disposal/document/text/image/removal change refuses
            tree commit; normal accepted Keep and quota retry remain unchanged
Non-goals:  cancelling a committed transaction, blob GC or provider changes
```

The verifier found that `dispose()` suppressed later UI reporting but still
passed the original commit through an awaited `putImageBlob`. Wrap only that
commit with the driver's live/exact-basis check immediately before mutation;
do not alter the pure byte-store owner or reinterpret the commit's own tree
notification as an external change.

P1-A freeze — Archive mixed-media timestamp proof:

```text
Outcome:    text and binary ZIP entries retain the same fixed calendar stamp
            across UTC, positive-offset and negative-offset time zones
Boundary:   existing mixed-media Archive tests; no transport or grammar change
Invariants: preserve deterministic ordering, byte equality and import checks;
            inspect both local and central headers, not only decoded contents
Proof:      PNG/JPEG/WebP plus text headers at DOS midnight 1980-01-01 in four
            fresh TZ processes; existing malformed/missing-byte tests retained
Non-goals:  new Archive version, exporter rewrite or a wall-clock timestamp
```

P1-N freeze — compiled Next recovery qualification:

```text
Outcome:    the identified production Next page itself loads upgraded material,
            replays recovered history and exports/imports verified picture bytes
Boundary:   separate qualification runner and Node-only fixture/oracle source;
            normal shipped UI, native browser IndexedDB setup and readback
Invariants: no browser product-owner injection or runtime test hook; exact tree
            identity of the frozen initial document; image/provider work off;
            fresh synthetic contexts only, no external requests or user storage
Proof:      N1 upgrade/all stores/replay; N2 real blocked handoff; N3 abort then
            unchanged v6 then normal upgrade; N4 older refusal and image replay;
            N5 UI Archive/fresh confirmed import/reload with exact byte readback
Non-goals:  schema changes, GC, a production redeploy claim or paid-service proof
```

The runner reads an already built `.next`, fingerprints its BUILD_ID, browser,
server and public assets before/after, and owns one bounded loopback child and
all test contexts. It does not rebuild, modify product code or run alongside
another browser qualification. Node may compile/import fixture and oracle
code; the browser never receives that bundle. N3 may inject a native
`createObjectStore("blobs")` version-change abort in that fresh context only;
it must remove the fault before the ordinary page retry and prove no partial
upgrade. Assert visible material and pointer Undo/Redo, not only raw storage.
Keep local production-artifact proof separate from the still-required actual
release-vehicle artifact availability/redeploy receipt.
The W0 record-version change exposes a proof-fixture dependency: both new Next
fixtures and the existing owner-bundle R1–R5 fixture must explicitly encode
record-7/state-7 for their physical-v6 starting database. Do not seed the current
record constant (now 8) and call it a valid older-build fixture. Only that
synthetic fixture constructor/import is amended; recovery owners are unchanged.

Q1 freeze — generated proof output is not authored source:

```text
Outcome:    retaining a recovery bundle does not make the next source lint run
            lint generated dependency code as though it were application source
Boundary:   ESLint global ignores for existing gitignored test-results and
            playwright-report output directories only
Invariants: preserve every source lint rule, assertion and retained artifact;
            no source extension or authored directory is exempted
Proof:      generated recovery.js has no ESLint config; authored script/component
            still has the existing config; full lint and check rerun unchanged
Non-goals:  deleting receipts, suppressing source violations or altering tests
```

W0 freeze — one serialized, unreleased Wiki foundation:

```text
Outcome:    real provenance, current-occurrence maturity/counters, restrictive
            preferences and comparable aging survive CAS-backed persistence
Boundary:   existing Wiki domain → repository transaction → basis publication;
            strict stored state/record V8, not a physical database upgrade
Invariants: load never writes V8; no-op never writes; failed candidates never
            publish; no hidden/model/network context or generated-text learning;
            current producer authority/thresholds and first-hearing gate retained
Proof:      strict codec and V7 rollback matrix, transaction/CAS failures,
            bounded transitions, byte proof and policy-V5 controlled replay,
            followed by independent audit before integration or release
Non-goals:  W1 activation, imported-word UI, W7 panel, accent adaptation, ASR
            hints, new producer/model, material/history/Archive/physical schema
```

The exact additive shape is `ruleMaturity`, `outcomeCounters`, `preferences`.
Maturity uses complete alias identity, kept 0–3, revision-ordinal
`establishedAt` iff kept is 3, and nullable `lastRevertedAtRevision`; it refers
only to live authority/evidence and has a 10,000-row structural union ceiling
(5,000 authorities plus 5,000 legacy alias rows), not the 512 hot-index limit.
Six outcome counters saturate at 2^31−1 and attach only to genuinely changed
accepted states, never solely causing a write. Counted occurrence IDs remain
bounded and deduplicate maturity separately from explicit decision routing.
Confirmed keeps may mature without gaining scoring authority; a revert resets
maturity and records a cutoff so an old occurrence cannot re-mature it.
Three increases per uninterrupted accumulation is the bound, not three writes
for the lifetime of a rule. Reset/rename/removal/lost relations must remove or
reconcile their maturity. Censored/failed/unattributed counts stay in the
existing transient owner; one derived diagnostics receipt combines facts.

Lexeme provenance is `manual | imported | learned | collected | starter`.
Only imported carries a required opaque 1–64-character ASCII batch ID from
`[A-Za-z0-9._:-]`; all other kinds forbid it. Manual/imported/learned share the
existing 5,000 new-human ceiling; legacy structural recovery remains 15,000.
V7 human maps to manual, ordinary aggregate to collected, and only provable
product-owned identities to starter. Human creation/rename is manual; explicit
decision-created words are learned without downgrading existing manual/imported
intent. Rule authority/provenance is a different fact and is not mechanically
renamed. No historical import or acceptance is invented.

Preferences contain a sorted, unique list of at most five supported locale
`nearSound` decisions; default preserves current behavior. They intersect the
existing permission, qualified release and rule conditions for both observation
and provisional projection. Confirmed rules remain available. Routed Latin
uses its target ledger preference. Unsupported accents are strictly `[]` and
hints strictly `null` (deny-only, not implemented capabilities). Preferences
reuse the transition/coordinator decision port and invalidate consumed basis/
fit caches; no unused service or second persistence path.

Comparable opportunities carry a closed, bounded transient producer-family
set from actual full enabled scans, including no-vote scans, using an explicit
mapping. Alias aging compares locale/channel/script/family. The shipped term
ledger observes only successful spoken admissions through the store-owned
human observation port; its clock does not age on written turns. The generic
pure term producer still accepts written human eligible ranges, and its API/
tests are preserved. Do not infer a stored channel history that V7 never held.
Any future written-material admission needs its own clock/storage decision.
Legacy rows retain any comparable
ledger-scan compatibility. Partial, paused, generated/protected-only or censored
turns do not age. This changes policy to V5; scoring remains V4 and producer
eligibility, release gates and thresholds do not change. Preserve the original
18 replay expectations; add family/channel/routing/maturity/cache cases before
deliberate requalification. Never update an expectation just to match output.

Missing/accepted legacy load may initialize/normalize only record-7/state-7,
then return validated V8 in memory. Optional normalization failure keeps the
original readable state and generation. Exact V7 reads do not put; exact V8
reads do not put. First genuinely changed state writes exact 8/8 through the
existing generation/revision CAS and awaited transaction, then publishes.
`save(candidate, null)` cannot create a missing record. Explicit corrupt reset
rechecks corruption in its transaction and may write V8. Future storage/record/
state and incompatible 7/8 pairs are preserved as unsupported/newer, never
resettable corruption. Preserve every legacy pair the current reader accepts.
V7 encoding rejects all nonrepresentable provenance, nonempty maturity,
nonzero counters and nondefault preferences rather than dropping fields.
Physical database stays 7; storage schema stays 1; Wiki export envelope stays 2
with state 8 and truthful newer-reader refusal. Newly written relations reject
self/cycle/canonical-shadow edges; do not retroactively corrupt valid old rows.

The compact migration's measured empty-field increment is 206 UTF-8 bytes;
prove an additive 256-byte ceiling over the V7 maximum of 9,863,168 bytes.
The V8 maximum is 9,863,424 bytes, not a promise that every independent maximum
fits simultaneously. New facts still soft-refuse automatic work or explicitly
refuse human writes at the total byte ceiling. Prove pretty-export bounds
separately. A strict representability encoder avoids a second mutable V7 cache.

One builder owns Wiki model/codec/invariants/transition/evidence/aging/
settlement/admission/collection/fitting/basis/configuration/export/policy and
qualified-policy modules, narrow new pure preferences/diagnostics owners,
Wiki repository/coordinator/runtime-core/runtime-bridge/runtime/occurrence-owner,
Wiki record types/constants only in matter-database, and superseded handling
only in WikiSettingsSection. Existing nearby tests, three new focused tests
(preferences, diagnostics, V8 budget), policy replay V5/qualification wiring and
digest constants mechanically changed by qualification are allowed. No other
UI/layout, dependencies, provider, material or protocol changes. A retained
patch is research only; reconstruct against current owners and report every
out-of-scope prerequisite before editing it.
The first typecheck also proved a mechanical fixture dependency in
`scripts/wiki/qualification/latin-internal-edit-v2.ts` and
`local-language-v1.ts`. Adapt their embedded state/lexeme constructors only;
candidate algorithms, corpus cases, expected votes and runtime producer gates
stay unchanged. Any changed executable digest must be requalified and reviewed,
not treated as new producer authority.

F1b-D freeze — safe manual deployment-version recovery:

```text
Outcome:    a different identified artifact is explained in a safe idle window;
            the person may reload through Archive without losing held work
Boundary:   build-frozen public identity, additive health field, one bounded
            observer and existing guidance/Archive composition owners
Invariants: no automatic navigation/reload, no storage-error fabrication;
            absent/failed identity is unknown; no model request or material sent;
            original loading/budget and terminal-storage recovery stay intact
Proof:      strict identity/bounded-read/late-result/lifecycle/click-time guards,
            draft/unsaved/paid-turn cases, five-locale narrow copy and native UI
Non-goals:  Next automatic skew, CDN routing, old-asset retention, polling service
```

The pinned Next deploymentId guide and source explain hard navigation on skew;
it does not consult Matter's idle/held-draft state. Do not enable that option
in this batch. This evidence reopens the earlier platform-identity requirement
as an explicitly manual product path; automatic skew and CDN retention remain
separate qualification, not completed work. Do not add `?dpl=` to artifacts in
this slice; a future activation first needs checker URL-to-path normalization.

At build time freeze a nonsecret immutable token, explicit `MATTER_BUILD_ID`
first or the platform's public `VERCEL_DEPLOYMENT_ID` if present, into the same
`NEXT_PUBLIC_MATTER_BUILD_ID` literal for client and health server. Reject an
invalid explicit/platform token; missing means null/unknown and no checks.
Accept 1–128 ASCII `[A-Za-z0-9_-]` characters only. No package version, commit
SHA, random value or runtime-only override. Vercel documents deployment ID as
unique and available at build/runtime; disabled system variables and prebuilt
deployments can lack it, so the real release receipt must verify the frozen
token rather than infer it from source. See its official system-environment-
variables documentation; no secret/credential variable is exposed.

Observe on initial safe idle and focus/visible/online/busy→idle demand, one
flight and at least 60 seconds between attempts, no recurring polling timer.
Same-origin health only, no-store, redirect error, 3-second deadline, 8 KiB byte
bound, strict protocol/identity. Hidden, blurred, busy, exit or unmount aborts
and invalidates the flight; a transport ignoring abort cannot publish late.
Failure/non-200/malformed/absent identity stays unknown, not a mismatch.
Identities are opaque and unordered: say Matter changed, not necessarily newer.
One quiet guidance yields to interaction, outcome, parked result and recovery;
do not steal focus, add chrome, or hide a current material action.

The Archive manual reload callback synchronously rechecks live material idle,
initial hydration completion, no unsaved material, visible owner and Archive
not busy before using location.reload. A stale enabled button grants nothing.
Use the existing root activity and persistence facts, not a second draft model;
do not change the old terminal-storage recovery action in this slice.
Build identity/config, health, observer/hook, MatterApp/RootedMaterial/Files
composition, existing guidance/copy, adjacent tests and one focused browser
journey are allowed. No Wiki, CSS/layout, provider, storage or material changes.
No dependency or budget increase; measure the real artifact before acceptance.

Q2 freeze — CI exercises the new recovery boundary:

```text
Outcome:    PR/main CI cannot pass without the compiled-page recovery proof or
            silently skip the explicit-identity deployment browser journey
Boundary:   existing CI job only; existing Git/sha256sum and qualification scripts
Invariants: one serial browser owner, fixed budgets/assertions, synthetic data,
            no paid/provider/production action or new third-party dependency
Proof:      build-input inventory before build and readback afterward; production
            recovery before the existing complete fixture E2E; exact PR-head CI
Non-goals:  publishing artifacts/secrets, deployment, CodeRabbit impersonation
```

Use a public run/attempt artifact token for this CI build, not a package/commit
fallback. Freeze tracked source/test/config/public inputs before build; verify
them afterward and supply that inventory to the recovery runner. The owner
receipt, not adjacency of source and `.next`, ties the build to those inputs.
Install Chromium through the existing step and run production recovery before
fixture E2E, never concurrently. Actual hosted CI remains unproven until the
submitted head runs it; a local YAML review is not that result.

State: owner-authorized continuation, 2026-10-16. The current integration
baseline is `c3b96c2` on `claude/preview-65`, not a released Preview.65.
Production remains Preview.64. This section is the resume point; the earlier
Wiki campaign below remains unfinished and retained, not silently completed.

The product purpose remains one person-held material tree, with coherent
projections into the index, canvas, deliberate copy, receipts, and bounded AI
context. Private APIs and qualified local models are replaceable capabilities.
Keep the existing principles; evolve the implementation without making a
renderer, provider, transcript, or receipt another material authority.

```text
Outcome:    one coherent candidate whose material relations are legible,
            portable, reversible, and accurately documented
Boundary:   current-truth documentation; canvas trail design and geometry;
            projection conformance and identifiers; independent robustness
            review; final candidate and database-upgrade proof
Invariants: tree-only durable mutation; no hidden context; transient UI stays
            transient; current Copy/Under behavior; image production gate off;
            existing runtime budget; no loss of interrupted or historical work
Proof:      the six review questions in docs/workflow.md, focused behavior
            tests, real-page visual candidates, independent verifiers, then
            complete check and E2E on the final candidate before merge
Non-goals:  new modalities, a desktop shell, sync/CRDT, broad composition
            refactoring, paid provider promotion, model downloads, or a release
            without the database v7 recovery decision and deployment receipt
```

| Slice | Current scope and completion condition |
| --- | --- |
| R0 current truth | Align this plan, the handoff entry, material/protocol/architecture/surfaces, and projection ownership with code. Preserve prior intent and mark historical decisions. A fresh verifier can identify implemented, visually unaccepted, production-closed, and incomplete work without reading a conversation. |
| T0 trail | Preserve selection/operation/selected-Inquiry ownership and epoch checks. Draw actual adjacent parent-child relationships. Prepare lighter, legible, sidebar-related visual candidates at laptop/narrow widths and light/dark themes. Geometry correctness and visual acceptance are separate receipts; final symbol/weight choice still needs the owner's visual review. |
| T1 connection design only | Define quiet/reveal/connect/dismiss behavior, structural point/line meanings, and a future manual dashed association with distant-target and curve rules. See `docs/reference/material-connections-design.md`. Keep both structural visual candidates; no manual-link schema, control or mutation is authorized. |
| C3 projections | Start with shared adverse-tree fixtures and an explicit output/scope matrix. Copy, Receipt and Archive share meaning, not necessarily bytes. Receipt has no Mermaid. Freeze any v2 grammar separately and preserve v1 verification; no generic registry without current consumers. |
| N2 identifiers | Audit and freeze the narrow identity owner, picture Keep attribution, inquiry voice identity, digest-derived receipt filename, and SessionRef meaning. Domain code still receives identity as a value; identity is not authorization or a stored chat session. |
| V0 robustness | Independent audits of context exclusion, malformed input, stale/late results, cross-tab ownership, archive compatibility, and paid-picture recovery. Fix concrete findings in their owners with focused counterexamples. |
| R1 release evidence | Choose the release vehicle and database v7 recovery path, integrate current main maintenance, run full check/E2E and CI, and walk the real product. Image remains closed until spend/edge controls, real-relay proof, unused-byte compaction and copy review are complete. |

Build one frozen slice at a time. The integrator owns shared contract edits;
researchers and verifiers report evidence, and builders receive disjoint code
lanes. Use existing research when it still answers the question, and inspect
primary documentation or source only for unknowns that can change the choice.
Record alternatives and reopening conditions rather than claiming a universal
best implementation. The detailed context is
[`../docs/handoff-post-preview-direction.md`](../docs/handoff-post-preview-direction.md).

### Owner-authorized closure wave — 2026-10-16

The owner explicitly authorized recovery proofs, projection/export exceptional
paths, Receipt v2, a visible picture entry, capability budgets and continuation
of the retained Wiki campaign. This does not authorize a release, paid probes,
production environment changes, user-byte deletion or a model download.

```text
Outcome:    reviewable closure evidence and working narrow improvements, not
            another assertion that the unfinished campaign is complete
Boundary:   synthetic DB7 recovery runner; additive Receipt v2; picture entry
            visibility/availability and existing popup sizing; capability
            inventory/budgets; one serialized Wiki contract and implementation
Invariants: preserve dirty work and v1 verification; literal Copy stays intact;
            no Mermaid; no hidden model context; image production remains off;
            existing runtime cap; no schema downgrade or user-data reclamation
Proof:      independent lane review; focused units and actual browser fixture
            paths; source/artifact-identified recovery receipts; precise ledger
            of implemented, tested, qualified and remaining release conditions
Non-goals:  new sync/desktop framework, a generic capability registry, automatic
            blob deletion, an unfrozen Wiki V8 writer or paid-service promotion
```

Picture entry correction: a drawable addressed passage exposes the existing
plain-text entry between Voice and Rewrite even when the image service is off.
Unavailable service/browser/store remains inert and names its reason; seeing
the entry grants no network or spend capability. Preserve the measured width
reserve, button sizing, reduced motion, focus and viewport bounds. The Chinese
entry is **生图**, as requested. Health still controls admission, not discovery.

Recovery proof uses fresh synthetic storage only. R1–R5 are the exact cases in
`docs/reference/persistence-recovery-audit.md`; a compiled source-owner fixture
artifact is not a deployable Next recovery release or proof of live redeploy.
Receipt v2's exact grammar is frozen separately before changing its writer;
v1 remains a verifiable historical format. Capability and Wiki research must
resolve their real owners and byte limits before either builder changes them.

Receipt v2 freeze: fixed front matter (`format: matter-receipt/2`, projection,
tree, revision, address, thoughts, clipped), shared escaped Markdown-list body,
then a positional closed JSON block (`depth`, `i`, `id`, `parent`, `truncated`)
and final SHA-256 over exact UTF-8 prefix. Body nesting counts carried parents,
not hidden ancestors. An explicit receipt always has a list; ordinary single
Copy remains literal. Preserve strict v1 parsing and goldens; exact-version
dispatch does not guess unknown formats. No timestamps, Mermaid, model-wire
changes, duplicate material authority or Archive migration. Validate canonical
rerender, separator/escape inverse, size before allocation, corruption/refusal,
Clipboard denial and document replacement. See the exact grammar in
[`context-receipt.md`](../docs/reference/context-receipt.md).

F1b manifest freeze: four build-only fields (`id`, `sentinel`, `tier`,
`budgetGzip`), real TypeScript ImportExpression inventory, one emitted hashed
asset per identity, explicit fixture-only handling, measured per-row budgets
and unchanged global caps. Keep source trigger/loading/recovery owners and seed
co-location. Prove missing/duplicate/orphan/nonliteral, wrong tier, initial
leakage and over-budget failures. No product registry or health/status lifecycle
is added; deployment identity and idle stale-version behavior remain a separate
uncompleted requirement, not silently covered by this checker.

Closure evidence, operational gates and the serialized Wiki builder packet are
recorded in [`closure-wave.md`](../docs/reference/closure-wave.md). This is a
coverage ledger, not a second roadmap.

Projection reading clarification — owner follow-up, 2026-10-16:

```text
Outcome:    people and machines can understand what Copy, Receipt and Archive
            preserve, omit and allow, without another document format
Boundary:   existing projection/receipt notes, Receipt helper copy and focused
            conformance tests; no codec, storage or model-envelope change
Invariants: literal Copy, v1/v2 receipt bytes and Archive import stay unchanged;
            no hidden ancestors, inferred dialogue or automatic context upload
Proof:      exact nested/skipped-parent output fixtures, localized helper tests,
            documentation checks and an independent semantic review
Non-goals:  Receipt v3, Mermaid, arbitrary Markdown import, new controls,
            model prompts, conversation export or a wider release qualification
```

### Current narrow builds

Closure-only verification — owner follow-up, 2026-10-16:

```text
Outcome:    close this wave with current-source check results and an honest
            coverage ledger and handoff, without adding product functionality
Boundary:   full engineering check; the seven previously failing browser cases;
            recovery/budget evidence readback; existing closure/handoff notes
Invariants: preserve all local work, runtime assertions and image-off gates;
            absent temporary logs are not fresh proof; no user storage changes
Proof:      exact commands, source identity and retained logs; separate review;
            explicitly retain failures and missing release qualifications
Non-goals:  new features, unrelated refactoring, Wiki V8, paid probes, deployment,
            merging, committing or declaring a full browser matrix passed
```

Result: full check passes (Node 184, Vitest 5,488 / 7 skipped, Wiki 9/9,
types/lint/build/runtime); 24 capability budgets pass at 393.0 KiB initial gzip.
Nine conservatively selected browser cases cover the prior seven failure
categories: seven pass, two remain failed, with no retries or changed assertions.
Native owner-bundle R1–R5 pass, but deployable recovery qualification stays open.
Exact source/artifact identities and local logs are in
[`closure-wave.md`](../docs/reference/closure-wave.md). No feature was added in
this closing pass; full E2E/CI and the two failures remain gates, not completed work.

**B0 — restore the retained Branch sample in the owner's review build**

Historical build record: the later B0-R owner decision below supersedes this
hover entry. The rail sample remains; do not re-add hover growth from this record.

The owner corrected the assumed product intent: sample extension and future
adjacent context are not human Voice admission under a passage. History confirms
that `01c631a` introduced a hover Branch entry, `c25712b` removed it from the
lens, and `7058a51` later hid the main rail Branch and added the Under mark.
The existing Branch command and sample copy remain present; restore that path
without reverting the surrounding product or opening a model capability.

```text
Outcome:    this local Preview Branch build offers AI → Branch → −/+ on a
            passage and Branch in the rail, with reversible sample extension
Boundary:   preview-gated NodeActionLens entry and RootedMaterial composition;
            both entries share the existing insert-child/store/tree owner
Invariants: exact addressed active full-view passage; pending/held/depth/capacity
            guards and current-intent checks; default Under remains intact;
            fixture source, ordinary persistence/export and pointer Undo
Proof:      hover and rail use the exact parent and last direct-child slot;
            Undo/Redo, unavailable targets and zero model/transcription calls;
            independent review and a real local Preview Branch page
Non-goals:  changing the deployed default, deleting human admission, real
            adjacent-context generation, new prompts, tree/wire/schema or layout
```

`NEXT_PUBLIC_MATTER_PREVIEW_BRANCH=true` selects this review build. It must not
be represented as a permanent product resolution or silently enabled on a
deployment. Seed parents have local continuation samples; an arbitrary passage
receives only the existing locale fallback, which does not inspect that
passage's text. The future direction is adjacent context, ideas and references;
its bounded context and acceptance contract still need a separate freeze.
The owner's correction reopens the earlier retirement/placement decision; this
review restoration is not acceptance of a permanently retired Branch or a
permanent Under slot. The formal default placement remains an explicit owner
choice after the restored behavior is visible, not something tests or a build
flag decide by implication.

**B0-G — restore stable local controls and put their fog behind material**

Historical intermediate review: fixed sizing and the separate background fog
remain; B0-R below explicitly rejects the 14px clearance experiment.

The owner's preview review identifies inconsistent control sizes and an optical
layer that reads above, rather than behind, material. `968ce4e` used fixed
44/48px targets; `7472240` introduced ink-height scaling and the measured corner
contact together. Restore stable instrument sizing without reverting modern
target authority, lifecycle guards, or the tree. The historical Branch mark is
kept in the explicit preview: unlike the later add-child `+`, it shares the rail
vocabulary without colliding with held-root recovery. “物” is provisionally read
as the fog effect, not a request to move or change generated material.

```text
Outcome:    a passage's controls stay the same screen size across depth and
            camera zoom; the quiet fog sits behind readable material
Boundary:   NodeActionLens render-edge metrics and its two paint planes, sharing
            one measured placement; no new controller or persisted state
Invariants: fixed 44px desktop / 48px compact-or-coarse targets; existing corner
            first-line horizontal anchor, collision suppression, lifecycle and focus rules; one
            pointer-inert fog behind the world and one interactive toolbar above
Proof:      pure size/placement tests; native browser depth/zoom, paint order,
            pointer passage-to-control, narrow/coarse, theme and no-orphan checks
Non-goals:  changing the formal Branch/Under entry, tree growth/fixtures, text,
            prompts, trail geometry, palette, or release authorization
```

The fog's backdrop sampling follows painting order, not a descendant's negative
`z-index`: see the [CSS Filter Effects 2 draft](https://drafts.csswg.org/filter-effects-2/#backdrop-root).
This is implementation research, not a cross-browser qualification claim.
The first real middle-button hover capture reopens the six-pixel overlap:
the dense button core and its glow visibly cross the selected first line,
despite the main fog being behind it. Keep the measured horizontal corner but
place button boxes 14px above first-line ink, with the whole interactive carrier
clear of material. This is one stable placement, not a hover-induced jump or a
second mirrored feedback state. It restores clear instruments without moving
material. Real preview screenshots still require owner acceptance.

**B0-R — recover the quiet two-action preview and its original contact**

The owner explicitly wants overlap, and then selected the stable pre-Under
two-action hover. `6b70e794` (2026-09-30) is the last lens revision before
`7058a51`: active material shows AI and `−`, a held root shows disabled AI and
restore `+`; optional Wiki reviews retain their existing bounded keyboard/touch
contract. This restores the interaction, not every historical pixel: fixed
44/48px sizing and the earlier requested behind-material background fog remain
explicit present-day overrides. The screenshot's detached 14px gap is rejected.

```text
Outcome:    Preview hover returns to AI + working-context mark, with the
            original bounded corner contact on small and large material
Boundary:   NodeActionLens presentation and RootedMaterial preview composition;
            remove unused hover-growth ports, not the retained rail command
Invariants: fixed 44/48px targets; 6px corner button-box overlap only; detached
            fallbacks/chrome still clear; one target, fog and toolbar lifecycle;
            preview rail Branch and formal-default Under remain intact
Proof:      fixed-size/contact units; preview two marks and rail exact-parent
            Undo/Redo; hover/focus/selection/close/pending/chrome and scaled views
Non-goals:  deleting runtime admission/growth, changing the formal default,
            material text, schema, model calls or a whole-file Git rollback
```

Intentional corner contact is not a defect merely because a button's feedback
overlaps the first line. Verify its actual readability in both sizes and themes;
do not reintroduce a detached gap to satisfy a test frozen to the rejected design.

**B0-R lifecycle correction — release hover without erasing selection**

A native preview counterexample waits beyond the 200ms departure grace after
moving from a retained selection into its toolbar and back out. The timer called
hard close, erased the placement, and left an unchanged selected target with no
reason to measure again. Immediate visibility assertions had missed this race.

```text
Outcome:    departure releases transient hover/focus while a valid selected
            passage retains its lens, including repeated toolbar departures
Boundary:   existing NodeActionLens cleanup callbacks and native lifecycle proof
Invariants: no selection still disappears; exact placement ownership remains;
            Escape, actions, suppression and outside presses keep hard close;
            no new state owner, timer, durable mutation or hidden target
Proof:      reproduce the expired-grace failure; selection retention, retarget
            and reentry, unselected departure and explicit dismissal journeys
Non-goals:  placement, motion, topology, product/default entry or new gestures
```

**T0-C — remove the typographic dogleg without restoring suspended anchors**

The owner's latest real page shows a short stair before the first child. T0-B
independently centred a large parent row and a small child row, turning their
typographic difference into a bend. The old committed trail's suspended ports
and guessed edge pins are not a safe restoration baseline.

```text
Outcome:    top-aligned adjacent passages share a straight bridge when their
            real first-row interiors admit one; endpoints read more clearly
Boundary:   pure trail attachment policy and existing marker sizes, consuming
            the current strict material receipt; no DOM or layout redesign
Invariants: actual parent-child gap only; shared Y stays in both measured rows;
            one outgoing port per parent in the resolved drawing; line, dots
            and target bead consume the same resolved ports; stale basis cuts
Proof:      large/small rows, disjoint/Elastic rows, multiple siblings, targets,
            zoom/DPR and existing invalidation/exit/pointer-passivity journeys
Non-goals:  forced flattening, authored coordinates, another graph or receipt,
            new hover/click controls, palette/exit changes or new icon vocabulary
```

Only a truly top-aligned first-child pair may establish a shared ordinate.
Other siblings start at that same source port but retain their genuine gap
turns. When no measured compatible pair exists, keep real row-centre ports;
never infer an unmeasured sibling. Marker diameters become 4.5px / 6px for
ordinary / target points and 2.5px for the existing downward three-dot cue.
Viewport continuation keeps its existing open chevron; a cue never implies a
new navigation or fold action. Rendered geometry changes with its exact current
projection, not a stored or guessed cross-selection anchor.

**T0-D — coherent endpoint grammar and one screen-metric owner**

The owner authorized implementation after the endpoint review. Round points
mark real material attachments, not terminal leaves or draggable handles;
open arrows keep their existing continuation/comparison role. A 5px ordinary
point and 7px target are the next real-page candidate, not prior visual approval.
Keep the 2.5px stroke, 4px bounded turns, 8px text-to-centre clearance and all
current lifecycle, palette and omission rules. Larger geometry does not move
an attachment or invent a replacement point at a clipped boundary.

```text
Outcome:    slightly clearer attachment/target points with one editable source
            of screen dimensions across pure geometry, SVG and stylesheet
Boundary:   existing OPERATION_TRAIL_PX and its current render-edge consumers;
            project stroke/bead/more-dot metrics, derive the cue half-size
Invariants: ordinary/target diameters 5/7px at every zoom; line 2.5px; no new
            target, graph, measurement, hit region or lifecycle; no arrow/dot
            stacking; stale/fold/hold exclusions and truthful clipping remain
Proof:      pure geometry/style ownership, computed native dimensions and
            clearance at permitted zoom/DPR, existing passive/exit/invalid-
            basis cases; light/dark/narrow real frames and independent review
Non-goals:  mask/palette/motion redesign, runtime style preferences, canvas
            disclosure, manual links, new dependencies or a release decision
```

`OPERATION_TRAIL_PX` remains the only dimensional owner; CSS custom properties
are a projection on the existing passive host, with no competing numeric
defaults or new token service. Screen stroke sizes do not take inverse zoom
again; SVG point/cue coordinates still do. Geometry correctness and visual
acceptance remain distinct; the owner reviews the final page rather than
coordinating implementation choices.

**N2 / ID-1 — adapter request identity**

```text
Outcome:    Inquiry and Text Swap use secure request/interaction identities;
            unavailable entropy preserves the draft and sends no request
Boundary:   one interaction-layer mint owner, its two current consumers and
            their existing failure recovery; no domain/persistence ID migration
Invariants: domain receives values; no weak random fallback; no uncaught UI
            error; no new dependency, registry, wire shape or logged material
Proof:      deterministic entropy/failure tests plus existing client/driver
            behavior tests and architecture checks; independent verifier
Non-goals:  migrating every ID, changing Wiki capabilities, or treating an ID
            as distributed idempotency or authorization
```

**V0 / lock-1 — a failed browser lock cannot authorize paid work**

```text
Outcome:    an exposed Web Locks API that throws or rejects admits no drawing
Boundary:   picture-in-flight-gate and focused gate/driver counterexamples
Invariants: successful locks retain/release once; unavailable API's existing
            per-page fallback stays explicit; production image gate remains off
Proof:      synchronous throw and asynchronous rejection both deny acquisition
            and start no fetch; ordinary contention/retry/cleanup still work
Non-goals:  distributed spend enforcement, cancellation of a paid relay, or a
            new cross-device lock service; those remain release gates
```

### Current proof boundary — 2026-10-16

#### Execution pass — inventory, finish, then extend

The owner authorized continuing unfinished research, audit, verification and
development, including the earlier Claude campaign. This is not permission to
discard interrupted patches, open image production, migrate a user's database,
or promote design-only manual associations. The integrator owns this queue;
parallel workers get disjoint files and an independent verification pass.

| Order / lane | Work and stop condition |
| --- | --- |
| P0 / presentation | Reproduce and resolve completion/presence timing in its actual presentation/delivery owner. Preserve the first paint and pending floors without holding an already dismissed result. Fix the focus journey's synchronization only if supported by evidence; do not relax its ring/order assertions. |
| T0-A / bridge geometry | Apply the frozen correction below, without selecting A/B style or adding fold/link controls. Prove state/geometry and update real-page endpoint assertions. |
| C3-A / conformance | Extend the shared fixture across omitted ancestors, fold/hold, clipping, repeated ranges, empty addresses and image pointers without bytes. Compare promised properties, not identical scopes or wire shape. |
| W-RESUME / Claude audit | Inventory retained F1b/W0 work and campaign dependencies against current source; preserve patches and research. Report the smallest resumable slice and exact missing proof before integrating anything. |
| R1 / integration | Separate local code completion, visual acceptance, Wiki qualification, migration/recovery and external release gates. Serialize browser work; rerun final checks and the full fixture matrix after source freezes. |

**T0-B — visible material ports, not column-container ports (reopened by owner review)**

The owner rejected the earlier screenshots' craft. Review found a concrete
miss: centred short text occupies only part of the full-width column, so T0-A
connected correct containers while leaving large visible gaps. Neither those
tests nor A/B CSS overlays proved visible-material attachment.

```text
Outcome:    each true adjacent bridge meets two explicit ports just outside
            the actual visible passage, with one quiet line/point vocabulary
Boundary:   OperationTrail render-edge measurements, pure trail geometry and
            focused tests/styles; integrator owns real-page E2E/screenshots
Invariants: published parent-child topology/gap corridor, epoch/current owner,
            caps/continuation, passive pointer and existing presence; no DOM
            state enters layout/tree/history/context or changes typography
Proof:      centred short text, wrapped/Unicode/RTL text, text+image/missing
            plate, stale/missing bounds, fonts/resize, clipping, zoom/DPR,
            selected/operating/Inquiry and real light/dark/FX screenshots
Non-goals:  manual associations, fold/Under icon changes, new graph/router,
            dependencies, global theme/font/layout or production promotion
```

Reuse existing canonical Range/rectangle measurement at the rendering edge.
Measure only the existing resolved lineage/descendant set (bounded by the
tree depth, target and descendant limits), convert to plain canvas values and
bind them to the exact current tree/layout publication. Missing, stale or
invalid visible-material bounds cannot fall back to a column boundary.
The layout's validated adjacent edges remain the relationship and bend-corridor
authority; visible bounds only own attachments. Preserve a truthful clipped
continuation and descendant-cap cue, never a fake clipped node.

Provisional craft direction: existing `--ink`, `--muted`, `--paper` tokens only
(light #161d27 / #58616a / #f5f5f2; dark #f3f4f1 / #c0c5ca / #202831), existing
material/utility typefaces and centred columns unchanged. Start from an opaque
paper-mixed ink, one 2.5 CSS-pixel line, small same-family source/target points,
and no target halo or solid triangles. Selected/operating are two ink strengths,
not new colours. Both no-arrow and open-arrow comparison remain available in
test-only previews; this is a local review candidate, not visual acceptance.
First frame both endpoints at readable zoom with FX off; then prove light/dark,
FX on, narrow, clipped/offscreen and pointer-hit behavior. No screenshot cropped
through its parent may be used as the endpoint acceptance receipt.

The owner's next real-page review reopens only the attachment and stroke
details: ports meet the first visible canonical text row at its actual left or
right edge, with eight CSS pixels from first-row ink to attachment centre.
The complete text/picture
envelope still bounds measurement and collision checks; its midpoint is not a
text port. Preserve the published orthogonal gap corridor, use four-CSS-pixel
soft corners, and do not manufacture a vertical jog when both measured rows
share a centre. Keep the existing paper-mixed colours and departure motion.
Elastic's visible split projection, font changes and transient node dragging
must not leave a line attached to hidden or obsolete geometry. The document
epoch fence is the existing keyed OperationTrail remount, not a second owner.
Containment has one explicit CSSOM allowance: at most one unzoomed canvas unit
outside the source/published bottom (at most two CSS pixels at the maximum
zoom). This bounds rectangle rounding; it never widens topology, selects a
different row or changes the gap corridor. Both the measured envelope and the
source bottom plus declared expansion must respect that same limit. A shorter
valid split flow retains the existing `max(0, flow − source)` growth policy.

**T0-A — existing structural bridges use actual layout edges (preceding geometry slice)**

```text
Outcome:    each addressed parent-child step joins real passage boundaries,
            not the old suspended above-passage anchors
Boundary:   layout/operation-trail.ts and geometry tests; integrator owns
            e2e/operation-trail.spec.ts endpoint assertions
Invariants: operation/Inquiry/selection ownership, epoch, limits, clipping,
            target presence and pointer passivity; no implicit context change
Proof:      first-child chains, variable heights, shared ancestry, invalid or
            missing edges, zoom/DPR and clipping; existing state/presence suites
Non-goals:  final A/B styling, manual associations, new disclosure actions,
            wire/storage changes, authored positions, dependencies or a router
```

**C3-A — cross-output adverse-scope characterization**

```text
Outcome:    shared authored fixtures prove each output's promised scope and
            losslessness without pretending different addresses are identical
Boundary:   material/projection-conformance.test.ts only; existing projection,
            Inquiry, Copy, Receipt v1 and ZIP/snapshot public functions
Invariants: no production/format/wire change, no hidden widening or omitted-id
            leak, Archive remains full recovery, v1 separator refusal retained
Proof:      omitted parents, held/folded views, repeated ranges, code-point
            clipping, empty addresses, and missing image bytes through ZIP
Non-goals:  Receipt v2, new registry, provider prompts, generated fixtures or
            full qualification of every maximum-size/transport counterexample
```

**P0 — one perceivable completion across pending and first-paint dwell**

```text
Outcome:    presented rewrite delivery waits for both pending + 600 ms and the
            actual first-paint + 800 ms; an older field adds no extra 200 ms
Boundary:   presence's first-paint receipt/handoff, PointTalkTurn/Exit wiring,
            and useTextSwap's existing React delivery window; focused tests
Invariants: no clock/presentation fact reaches driver/domain/tree; dismissal
            clears UI time gates without cancelling or duplicating submitted work
Proof:      early and delayed paint, old field, no receipt, identity replacement,
            detach while resolved, and original finished/close E2E assertions
Non-goals:  raising timing constants, weakening the result-is-ending assertion,
            general scheduler/framework, new UI, protocol, storage or dependencies
```

Presence owns and publishes its first frame once for the current identity.
The existing UI adapter combines that absolute deadline with its pending clock,
then gives the driver only the existing boolean delivery window. Gate refs must
update together before refresh, so a render cannot open delivery with an old
deadline. A detached/unpresented turn owes neither surface dwell nor pending
cue; visibility, pointer-idle and exact target validation still apply. The
separate focus test may wait for Rewrite enablement before asserting unchanged
Tab order/rings; that wait is not proof the old failure can be dismissed.

**P0-F — opening autofocus cannot override a newer focus choice**

```text
Outcome:    the existing delayed default focus yields to a person's newer
            field control or outside target, without changing keyboard order
Boundary:   PointTalkComposer's opening effect and picture-control E2E only
Invariants: no new timer/owner; ordinary opening, recording return and picture
            step focus remain; no change to ring or Tab-order assertions
Proof:      a placement observer chooses Voice before opening rAF; reproduce
            late focus theft before the fix, then preserve Voice and About;
            a resolved spoken direction with refused request identity keeps
            an outside focus choice while retaining the direction as ready
Non-goals:  focus framework, trapping, new controls, timing policy or wire state
```

The full execution matrix still reproduced the focus case after waiting for
Rewrite enablement (323 passed / 16 skipped / 1 failed). That wait is not an
opening receipt. Confirm the delayed-autofocus hypothesis before changing the
owner, then use actual input focus to start the unchanged ring journey.
The placement-observer Voice counterexample failed before the guard. Capture
the opener in the placed commit's layout phase, before observers/new input,
then let the existing rAF yield to any newer field or outside target. The
outside About case also passes; do not mislabel it as a reproduced old failure.
Independent lifecycle review identified a second schedule when voice returns
to a ready form after request-ID refusal. The first opening may inherit the
opener; a later return may default from lost/body focus but must not inherit an
unrelated outside target. Record that first-opening distinction only at the
existing callback's execution, so Strict Mode setup/cleanup cannot consume it.

**V0-L — isolated owner localhost preview**

```text
Outcome:    the owner can keep localhost:4310 open while check/E2E run
Boundary:   next.config.ts dist-dir resolver, its tests, exact gitignore/lint
            exclusions and generated TypeScript-directory includes
Invariants: dev-only exact named owner+directory; production stays .next;
            existing Playwright .next-e2e and leaked-env refusal stay strict
Proof:      accepted review pair, missing/wrong owner, other path and production
            refusal; actual preview starts separately and returns Matter
Non-goals:  arbitrary dist paths, config framework, dependencies or deployment
```

The existing resolver deliberately ignores arbitrary `MATTER_NEXT_DIST_DIR`;
the first owner-preview attempt therefore still used `.next`. Add only one
explicit local-review pair (`MATTER_REVIEW_RUNNER=owner-review` with
`.next-review`), not a relaxed arbitrary directory override. Restart the same
4310 URL with fixture AI and drawing off. The URL is for local review, not a
release or model-quality claim.
The first full check with that server alive exposed generated `.next-review`
JavaScript entering ESLint. Exclude only that reserved generated directory,
like `.next` and `.next-e2e`, and prove all three are ignored while actual
product source remains linted. Do not weaken lint rules or clean user material.

**P0-I — the index owns its own test readiness**

```text
Outcome:    the lineage journey waits for the lazy index's complete fixture
Boundary:   e2e/material-files.spec.ts path-highlighting case only
Invariants: canvas readiness is not index readiness; retain deep-node guard,
            active/lineage/selection/CSS assertions and all production behavior
Proof:      open + non-stale + exact ten-row index, then original assertions
Non-goals:  sleep, assertion removal, product timing/layout/storage changes
```

The 343-case full run exposed this immediate-read race. The failure snapshot
later contains all ten rows; it does not show what existed at the exact read.
`MaterialFilesWithLabels` is client-only lazy code and the index opens through
its own desk-width effect. Its existing same-file fixture precedent waits for
the complete small projection. This is test synchronization, not evidence that
the document or lineage engine lost descendants.

**Claude recovery queue — audit, not transplanted completion**

Historical audit baseline: F1b's source-accounted manifest/checker and native
recovery runner were subsequently implemented and verified in the closure wave
above. The deployment/idle-version, deployable-recovery and Wiki gates were not
completed by that narrower work. The retained patch assessment below is not a
claim that today's manifest or R1–R5 source-owner proof is still absent.

The retained patches have now been audited read-only. The exact recovery packet
and their missing proof are in
[`../docs/reference/claude-resume-audit.md`](../docs/reference/claude-resume-audit.md).
F1b is a sentinel fragment, not a manifest/checker receipt. W0 is a V8 schema
scaffold with an unchanged repository that would write the current version
during load; it is not safe to integrate as the accepted V7-on-load design.
Keep both interrupted worktrees unchanged.

| Next lane | Activation / acceptance |
| --- | --- |
| W0a | First freeze the exact V8 stored shape, maxima and transition owners with W0b/W0d's design; then freeze and build codec/repository load/write/rollback behavior. One serialized unreleased Wiki lane, no placeholder V8 or standalone W0a release. Wiki record V8 is distinct from IndexedDB database v7. No migration is authorized by the retained patch. |
| W0b → W0c → W0d | Strict provenance/batch/invariants, then producer/channel comparable aging, then real effectful maturity/counters/diagnostics and byte proof. One serialized Wiki lane; qualify only after semantics stabilize. |
| F1b | Re-inventory current dynamic imports after integration freezes; build the smallest capability manifest/checker with planted violations and unchanged budgets. Reuse old sentinels only after reviewing each current owner. |
| N2 remainder | Picture Keep attribution, Inquiry voice identity, digest-derived receipt naming and SessionRef still need their own narrow freezes; ID-1 is not their completion. |
| Image/recovery | Plan reachability across stored snapshots, retained Undo/Redo, unsaved material and active Keep/import before blob compaction. Decide v7 recovery/older-build refusal before release. Browser locks are not distributed spend control. |
| Real-use/local/media | Under/rail discovery, film recapture, qualified local inference, sync and other modalities retain their existing explicit activation gates; do not infer them from a local document or a closed drawing lifecycle. |

R1's read-only source audit is now in
[`../docs/reference/persistence-recovery-audit.md`](../docs/reference/persistence-recovery-audit.md).
It found a real-browser upgrade script, but `npm run check` does not run it;
the existing script now passed its seven journal/upgrade/image checks and both
quota scenarios on a fresh temporary Chromium origin. That is not the complete
physical recovery packet. The next recovery
packet must prove all-store/history preservation, blocked handoff, aborted
upgrade, v6 refusal followed by v7 readback, and a frozen DB7-aware recovery
build's Archive export/import. Recovery is a forward DB7-aware deployment,
never an old v6 build or database downgrade. No release is authorized here.
Blob compaction is absent, not merely unqualified: freeze the complete durable
and live root set and cross-tab coordination before building it. The research
note intentionally leaves the lease transport unselected, respecting the
existing persistence rule against long-held locks for ordinary writes. Until
those proofs pass, preserve orphan bytes rather than risk Undo/import loss.

**Current T0-D execution receipt — local candidate, not release**

5px attachments and the 7px target now share the existing dimensional owner
across geometry, SVG and projected CSS. No extra state, measurement, graph,
interaction, palette, presence or material authority was added. Independent
source review and two focused 89-test runs passed. Default trail/geometry
Chromium: 31/31; explicit Preview: 9 passed / 1 default-only skip. The new DPR
1/2 journeys prove the actual 0.6/1.8 zoom clamps and approximately 1, target
size, non-scaling round dot stroke, shared line/point ports and remaining ink
clearance without offscreen skips. `npm run check` passes Node 177/177, Vitest
5,428 / 7 skipped, Wiki qualification 9/9, types/lint/build/runtime. Initial JS
remains 393.0 KiB gzip / unchanged 396 KiB cap. Exact logs, local inventory and
visual limitations are in the handoff. The live review page reports 5/7px.
Owner visual acceptance, complete full-matrix/CI and existing release gates
remain open; manual links remain design only.

**Earlier B0-R/T0-C execution receipt — before T0-D, not release**

Preview ordinary hover is AI/context only; rail sample Branch remains and the
formal-default Under path is unchanged. Fixed 44/48px targets retain the
intentional 6px corner contact. Actual compatible first-child rows share a
bridge ordinate; disjoint or unmeasured rows keep real fallback geometry.
Larger passive endpoints and existing omission/viewport cues keep their
distinct meanings. A reproduced post-grace selection failure is fixed by
releasing transient hover without erasing valid selection-owned placement.
Independent lens, lifecycle, trail and documentation review passed; stale
two-entry and zero-overlap current-doc claims were corrected, not historical
principles deleted.

Latest `npm run check` passes: Node 177/177, Vitest 5,426 passed / 7 skipped,
Wiki qualification 9/9, types/lint/build and runtime checks; initial JS is
393.0 KiB gzip / unchanged 396 KiB cap. Default focused browser matrix:
61 passed / 3 preview skips; explicit Preview matrix: 16 passed / 1 default
skip. Exact logs, inventory digest and candidate frames are in the handoff.
The older whole 348-case matrix was not rerun for this correction. Owner visual
approval, formal entry choice, full-matrix/CI and existing DB7/release gates
remain open. No deployment, migration or new model capability was made.

**Earlier T0-B/B0 execution receipt — superseded by B0-R/T0-C, not release**

P0's first-paint/pending delivery gate, P0-F's opening/ready-return focus guard,
T0-A's real adjacent bridges and C3-A's 14-case conformance characterization
are built and independently reviewed. P0-F reproduced both opening focus theft
and ready-return theft after spoken request-ID refusal before correction.
The final six browser journeys passed ten repetitions each (60/60). The earlier
343-case matrix ended with one index-readiness failure; P0-I's narrow wait
passed ten repeats. That T0-B/B0/V0-L candidate passed complete
`npm run check`: 5,417 unit cases (7 skipped), qualification 9/9, types,
lint, build and runtime checks; initial JS is 392.8 KiB gzip / unchanged 396 KiB
cap. The complete 348-case fixture Chromium matrix passed 331 with 17
intentional skips in 13.7 minutes. A separate explicit Preview Branch build
passed the then-restored hover/rail actions and the comparison gallery (3/3).
T0-B's independent source/pure review passed 111 cases. Exact logs and the final
source/test/config digest are in the current handoff. Manual associations and
both visual styles remain unaccepted/design-only as applicable. No interrupted
worktree, dependency, physical schema or production gate was changed here.

**Previous pass receipt (earlier on 2026-10-16, not the current build status)**

R0 independently passed after current/historical deployment and projection
owner corrections. ID-1 and lock-1 are implemented with focused refusal and
cleanup counterexamples; no wire/storage migration or production gate changed.
C3 has a conformance seed, not a complete adverse-tree proof. T0 research found
the suspended-anchor mismatch but left trail source unchanged. T1 is a reviewed
design proposal only; both visual candidates remain unaccepted.

Full serial fixture E2E: 320 passed, 16 skipped, 2 failed. Repeating each failing
case five times passed focus 5/5 but reproduced completion/presence once (4/5).
The new-material/old-pending-field timing conflict must become a separately
frozen narrow slice, not a weakened assertion. Exact validation, evidence paths
and the final static/unit/build receipt belong to the current handoff. R1 is
NOT-GO; this local integration is not permission to merge, migrate or deploy.

### Retained campaign — Wiki made whole, on trustworthy ground (Preview.65–66)

Current status (2026-10-16): Q0, F1a and N1 are integrated. F1b and W0 retain
uncommitted, unverified work in their existing Claude worktrees after an
interrupted run; current Wiki records remain V7. W0/W1/W3a/W7/W8 must not be
inferred complete from their frozen contracts below. Re-audit those patches
against the integration baseline before a separate builder resumes them.

State: frozen 2026-09-30 after Preview.64 shipped (`7383783`). The research
this round covered code and asset loading, dictation products (闪电说,
Superwhisper, Typeless, Wispr Flow and others), open-source recognition
pipelines, IME dictionary engineering, and licences. An adversarial review then
checked the plan, and each of its blockers was verified in code. The maintainer
plan and its decision log are in the Preview.65 handoff once it is written.

Owner decisions of 2026-09-30 that reopen earlier freezes:

1. **Ordinary use is evidence, and activation may be aggressive.**
   - Dwell, not deleting, not undoing, copying, ordinary silence, and leaving
     the page count as informed acceptance.
   - Rules may activate early because correction at the word and in Wiki is
     cheap.
   - Audits, including Codex's, are advisory.
2. **Correct… at the word is added.** A small field at a selected word takes a
   typed spelling or a short voice input. The result commits one human,
   undoable edit and teaches Wiki the pair. This is a secondary keyboard path.
   It is accepted and documented as a tension with principle 5, and its voice
   input keeps it keyboard-optional.
3. **No review queue, and no wrong→right rows.** The word list may filter
   auto-added canonical words.
4. **Near-sound ships,** for Chinese and English, with multi-word names,
   import from the person's own dictionaries, recognizer hints once measured,
   and a Wiki data panel. No neural model enters the Wiki path.
5. **Loading follows the person's path.** The core carries only first paint
   and the first gesture. Every enhancement is declared, budgeted,
   preloaded one step before it is needed, and removable.
6. **Development and Production release come first.** The voice lab that
   measures Chrome recognition follows.

Facts verified in code that shape the slices:
- Material has no free-text editing surface, and a node records no origin.
- Han characters are word constituents, so a Han rule must be segment-aligned:
  a literal 才料→材料 would rewrite 刚才料到.
- A locale-less second normalization drops attribution but still commits the
  canonical text (`material-ingress.ts:225-235`).
- The qualification digest hashes the Wiki policy files, so Wiki slices build
  in one serialized lane.
- `pinyin-pro`'s data is not licence-clean. Readings come from Unicode
  Unihan.

```text
Outcome:    Wiki corrects a person's own names and terms from the first
            hearing, in Chinese and English, including multi-word names, and
            every rewrite is attributed, disclosed by maturity, and refusable
            at the word; a person can correct any misheard word where it
            stands; the person's own dictionaries import; loading follows the
            person's path under build-proven budgets
Boundary:   normalization ownership at admission, material lexical ingress,
            Wiki evidence/activation/settlement policy, the Wiki matcher's
            boundaries, pronunciation producers and their Unihan asset, the
            takeover layer, Wiki settings (filter, panel, import), the
            capability manifest and runtime artifact checks, and the documents
            that state these contracts
Invariants: only the tree engine commits material; Wiki never enters a model
            prompt, wire request, archive, or history; Wiki never observes
            Material Undo; a provisional rewrite that cannot be attributed is
            withheld; ambiguity abstains; generated text never teaches; every
            enhancement is removable; the initial runtime budget is not raised
Proof:      per-slice focused tests and a Sonnet verifier; qualify:wiki
            --check; in-context matcher corpora; Chromium e2e per changed
            journey at laptop and narrow widths; npm run check; npm run
            test:e2e; three whole-diff verifier rounds per release
Non-goals:  neural models or LLM correction in the Wiki path, similarity-score
            fuzzy matching, CC-CEDICT or pinyin-pro data, Traditional/
            Simplified folding, `.scel`/`.dat` import, a service worker,
            voice-model tiering, RootedMaterial decomposition, and the #104
            key ring
```

Preview.65 slices, in dependency order. The Wiki lane is serialized;
the loading and voice slices run beside it.

| Slice | Frozen contract (outcome · boundary · key invariants) |
| --- | --- |
| C0 cleanup | See the table after this one. |
| Q0 qualification tooling | `qualify:wiki -- --check` fails on drift and names the changed identity fields. `--print-update` rewrites the `wiki-qualified-*` constants. The updater refuses while any manifest expectation fails, and a second run is a no-op. |
| F0 attribution | A measured list of initial-graph modules and their import chains. This is input to F1c. It changes no code. |
| N1 normalization owner | The admission driver owns one locale-bound normalization, and `runtime/admission.ts` stops re-normalizing as `"und"`. Wiki withholds any provisional edit it cannot attribute, and only confirmed rules may ever apply unmarked. Web Speech final results and `onend` restarts join with one space only where two word characters of a spaced script would touch: never for CJK, and never doubling a space. A malformed Whisper chunk drops only its own gap; this is a recorded contract change to `transcript-punctuation.md`. Near-silent audio is not transcribed on the local path, and held words still hold. |
| W0 Wiki record V8 | Producer family joins the comparable-opportunity key, and channel joins term aging. Both are computed per turn, not stored. Stored: provenance `manual \| imported \| learned \| collected \| starter`, import batch id, `establishedAt`, preferences (near-sound per language, accents, hints), and effectful outcome counters; censored outcomes are counted in memory only. Relation cycles and shadowing are rejected at write time. A newer row becomes a truthful `superseded` state. Load never writes V8; the first real write does, so a rollback to Preview.64 keeps working for anyone who only read. The byte allowance is proven. One in-memory diagnostics receipt owns every panel number. |
| W1 graded authority | Pronunciation and near-spelling targets are `manual`, `imported`, `starter`, and shape-specific lexemes; collected terms are never targets. A heard form that `Intl.Segmenter` yields as one word-like segment, or that is a Wiki lexeme, is a real word: it never applies on first hearing and needs repeated evidence. A `manual` target applies **at admission on first hearing** when exactly one exact producer key matches and the boundary holds. It is provisional and disclosed with the full morph, and settlement creates the relation. `imported` targets activate on the second observation. While a strike exists, early activation is closed, and the first revert or reject of an early-activated rule tombstones it. Established means three kept settlements without a revert, recorded in `establishedAt`. Provisional rules show morph and mark; established rules show the mark only. The takeover adds **Don't change this** (`explicit-reject`: restore the heard form as one undoable edit, zero the rule, tombstone it). A rename during Wiki… consult settles `inspected-kept`, and after the dialog releases rewrites that word as one undoable edit. A remove settles `explicit-reject`. The word list filters All / Added / Imported / Auto-added, showing canonical words only. |
| W3a boundaries | A new `segment` boundary: both edges of a match sit on `Intl.Segmenter` word edges of the surrounding text. Han↔Latin script transitions are boundaries, so `我喜欢P to Q的设计` matches. Qualification gains in-context matcher cases: straddling, adjacency, and punctuation. |
| W7 panel and capability line | **Details** in Wiki settings renders the W0 receipt as numbers only. One truthful capability line: exact-only / near-sound [languages] / full-auto / paused, plus saturated or degraded. Toggles expose `aria-pressed`. |
| W8 hardening | Export refreshes first and records generation and revision. A strict `matter-wiki.json` import round-trips its own export, and replacing newer state asks for confirmation. Seeded property and state-machine tests cover permutation, same-tick dedupe, language isolation, saturation, migration, concurrent CAS with failing storage, and cross-tab burst. Storage and producer budgets. |
| F1a honest loaders | No lazy loader swallows a failure silently: each resolves to its documented degraded behaviour plus a content-free receipt. The persistence engine keeps its documented retry contract and shares only the online/visible listener. |
| F1b capability manifest | `runtime/capability-manifest.ts` holds only build-checkable facts: `id`, `sentinel`, `tier` (`core \| gesture \| on-use \| background \| asset`), and `budgetGzip`. Triggers stay in their owning code. The runtime-artifact check proves each sentinel sits in exactly one chunk, that the chunk is initial only for `core`, and that it is within budget; a planted violation must fail. Every dynamic `import()` targets a manifest module. `deploymentId` is set. A stale-version line ("Matter was updated — reload when ready") appears only on a health-version mismatch and only while material is idle. |
| D1a principle 7 | Two or three sentences on evidence, early activation, and owning our semantics, plus the product sentence. `changes.md` supersessions are written in the same merge as the code they describe. |

Freeze corrections from the W0/W1/W3a design review (2026-09-30). These are
binding and amend the rows above:
1. The `Intl.Segmenter` real-word test applies to Han and kana only. A Latin
   letter run is always one segment. Latin real words are the folded
   canonicals of lexemes, plus term evidence with support ≥ 4.
2. Load may still write V7 (a fresh profile, or a migration from records
   1–6). Only V8 is never written on load. The database and storage schema
   versions do not change.
3. "While a strike exists" is scoped per ledger × channel × form, never
   globally.
4. Maturity counts kept settlements on confirmed rules too, with at most three
   maturity writes per rule. This amends "neutral outcomes cost no write".
5. Legacy producers age on any scan of their ledger. Only the new
   producer-family key narrows aging.
6. A rename from Wiki… consult retargets the occurrence's attribution before
   it settles.
7. The `imported` tier and the CJK real-word path are unreachable until W6
   and W2 ship. Preview.65's first hearing is Latin only
   (`latin-internal-edit-v2`).
8. The Han↔Latin boundary applies only to CJK own-locale turns. `segment`
   rules segment the whole capped text once, lazily.
9. `firstHearing.enabled` stays false on any branch that does not already
   contain N1's withhold rule.

C0 cleanup, owner-approved:

| Area | Action |
| --- | --- |
| Dependencies | Merge #109 and #110 to `main`. #111 ships inside the Preview.65 pull request with a worker receipt. |
| Issues | Close #12, #49, and #68. Re-audit #82, then close it and split any live items. Rewrite #63 and relabel #8. Add current-truth notes to #104, #52, and #34. |
| Branches and worktrees | Delete merged local and remote branches. Remove finished agent worktrees and merged `tmp/` worktrees. Keep the film branches. |
| Settings | Auto-delete merged branches. `main` requires `check`. Enable secret scanning and push protection. |

Preview.66 slices, frozen when Preview.65 ships:
- W2 Chinese near-sound: a Unihan `kMandarin` table of about 32 KB gzip.
  Polyphones abstain. Tone-exact keys; nasal pairs on by default for manual
  targets; opt-in accent toggles.
- W3b: `en-metaphone-v2`, with the sentinel swap recorded, and multi-word
  names.
- W6 import: phrases as terms; IME pinyin codes as readings; pairs only from
  plain text; import batches removable as a whole.
- W4 Correct…, with its voice input.
- F1c: an initial-graph diet. The Ask Matter composer moves to the gesture
  tier.
- D1b: the system principle and the Capability tiers section.
- D2: research notes.

After that come the voice lab (L0), recognizer hints (W5: on-device only,
opt-in, measured), and voice text shape (Preview.67).

## Completed campaign — nothing a person does is silently lost; Wiki becomes addressable

Shipped as Preview.64 (`7383783`, 2026-09-30).
Handoff: [`../docs/handoff-preview-64.md`](../docs/handoff-preview-64.md).

State: frozen 2026-09-29 after a nine-part audit of `c6027c8` and five external
research passes (bounded undo, local durability, exit motion, IME/Escape/pen
input, implicit feedback). Every code slice except the bundle budget is merged
on `claude/material-trust` with its round-1 fixes; whole-diff verifier rounds 2
and 3 and the release gate below remain. Target: Preview.64 on `main`.

Owner decisions of 2026-09-29 that reopen earlier freezes:

1. Wiki may disclose an applied change. The first perceivable arrival of a
   Wiki-applied word receives one restrained heard-to-canonical settle, and an
   unsettled occurrence carries a quiet mark the person may tap to take over.
2. Informed implicit acceptance is approval. After a disclosure was
   perceivable, continued use, dwell, copy or export, leaving the page, and the
   occurrence surviving without correction settle that occurrence as accepted.
   Each occurrence settles once. Wiki still never observes Material Undo.
3. Undo is bounded: 1,000 steps and 32 MiB of exact inverses across both
   stacks. The byte bound exceeds the largest legal single inverse, so no valid
   change is refused. Older steps are released; long-term recovery is Archive.
4. Transient voice and turn surfaces leave crisply instead of vanishing in one
   frame.

```text
Outcome:    a person never loses spoken words, a submitted AI request, unsaved
            material, or a typed direction without a visible, recoverable state;
            Wiki corrections become perceivable, addressable at the word, and
            learn from informed acceptance and explicit takeover
Boundary:   admission and turn lifecycles, keyboard/IME dismissal, persistence
            and history storage, transient presentation exits, the material
            lexical port receipt, one Wiki occurrence owner, Wiki evidence
            policy, and the documents that state these contracts
Invariants: only the tree engine commits material; the model still returns only
            text; Wiki never becomes model context, never observes Material
            Undo, and never publishes a command; every correction the person
            makes is an ordinary pointer-undoable material change; bounds reject
            rather than truncate material; transient state never enters the
            document or history
Proof:      focused unit tests per slice, Chromium e2e for each changed journey
            at laptop and narrow widths, npm run check, npm run test:e2e, one
            verifier per slice, then three whole-diff verifier rounds
Non-goals:  RootedMaterial decomposition and pan/fold render cost (next
            campaign), nested-radius canvas audit, Ask Matter record surface,
            issue/branch housekeeping, pronunciation producers without corpus
            proof, managed provider promotion, and the #104 key ring
```

Slices, in dependency order. Each landed on `claude/material-trust` as one
merge; round-1 whole-diff verifier findings were fixed in three more merges.

| Slice | Delivered | Receipt |
| --- | --- | --- |
| T6 server | admission refusal is `RATE_LIMITED`; rejected receipts name their declared rule | `bb214b8` |
| T5 AI turns | delivered results keep the replayable redo future; an unprovable canonicalization is withheld, not refused; unchanged Elastic ends are said once; a parked result has Discard | `db65d37` |
| T1 keyboard and chrome | IME-safe Enter/Escape; one Escape owner; Escape never cancels a submitted request; Ask Matter carries a question in flight and offers Cancel; one canvas gesture owner with palm rejection (moved here from T5) | `e55477c` |
| W1 Wiki evidence | record V7 quarter units, comparable-opportunity aging, informed-acceptance policy, two-strike reversion | `f781cb7` |
| T2 voice and presence | held words on every failed commit; presence timings; released rewrites said once; a stalled worker is retired | `75cc8b5` |
| D0 documents | truthful surfaces; plan and release receipts moved to `archive/` | `5e19a78` |
| T3 + T4 persistence | bounded per-step undo at database v6; durability line; cross-tab generation channel; terminal superseded state; material-idle adoption gate; bounded `persist()` | `00fc30a`, browser fixes `16b3be0` |
| W5 script routing | Latin spans of CJK turns reach the `en-US` ledger | `7e4b247` |
| W2–W4 addressable Wiki | occurrence attribution, disclosure and takeover, informed acceptance at runtime | `a792d33` |
| Round-1 fixes | durability and history (`bc49b9b`); Wiki and server (`cd07573`); client interaction (`3aca868`) | merged |
| B bundle budget | lazy-load boundaries back under the artifact budget | in progress |
| D1 documents | one truthful contract set | this change |

Release gate: every slice verified; three whole-diff verifier rounds pass with
their findings fixed; `npm run check` and `npm run test:e2e` pass locally and in
CI; the owner walks localhost; the pull request merges to `main`; Production
reads back Preview.64. The prerelease tag stays withheld until #104 and the
strict pool probe pass.

## Active correction — addressable local Wiki

State: implemented at record V7. The lexeme-first domain, strict persistence,
neutral patch-based lexical port, settings surface with reversible scope and
export, two local permission actions, bounded automatic term collection, and
one release-qualified internal-Latin-edit producer run by default. Latin words
inside Chinese and Japanese turns reach that producer by script routing. Every
applied change is disclosed once and marked until its occurrence settles; the
takeover at the word offers Keep, the heard form, or Wiki…; informed silence
settles as retention-only approval; two reverts end an automatic relation. The
contract is [`../docs/reference/wiki.md`](../docs/reference/wiki.md). The
invisible-Wiki text this section replaced, including its superseded “no mark”
rule and whole-observation units, is trace in
[`../archive/plans-0.2-history.md`](../archive/plans-0.2-history.md).

```text
Outcome:    repeated recognition and wording mistakes disappear, and every
            change Wiki makes is perceivable once and addressable at the word,
            without asking a person to operate or approve a dictionary
Boundary:   one origin-local locale × channel authority with script routing;
            one composition-owned adapter behind the neutral lexical port; one
            occurrence driver from disclosure to settlement; the settings
            surface as the configuration path
Invariants: no Wiki value enters a model, wire request, archive, public action,
            or material history; generated and repaired text contributes no
            admission evidence; old trees are not rescanned; informed
            acceptance only retains a rule and never creates, activates, or
            confirms one; Wiki never observes Material Undo; a suggestion that
            would break a valid result is withheld; Wiki failure becomes
            identity or last-good basis and never blocks material
Non-goals:  memory, RAG, embeddings, prompt vocabulary, model-managed learning,
            a review queue, permanent dictionary chrome, historical tree mining,
            cross-account sync, runtime fuzzy phonetic distance, or enabling
            pronunciation without corpus proof
```

Still open. Each item is now owned by a slice of the active campaign above:

1. Rejecting or replacing the responsible mapping from the word → W1.
2. `我喜欢P to Q的设计` does not match → W3a.
3. A newer Matter's row reports `PERSISTENCE_UNAVAILABLE` → W0's `superseded`
   state.
4. Every weight and memory remains a calibration candidate. Under W1, a real
   name one internal edit from a manual canonical (`Engelhart` beside
   `Engelbart`) may be rewritten once on first hearing. It is disclosed with
   the morph, and one Don't change tombstones it.
5. Pronunciation producers → W2 and W3b, which ship in Preview.66.
   Recognizer-time phrase bias → W5, after the voice lab, on-device and
   opt-in only.

## Active correction — user-supplied material model surfaces

State: source configuration and deployment verifier implemented; production
readback remains required after merge and deployment.

```text
Outcome:    Elastic and Text Swap remain usable product actions when a person
            attaches one verified Model API lease, without promoting or paying
            for a Matter-managed material provider
Boundary:   separate server-owned product-surface gates, request-local provider
            candidate construction, managed-adapter gates, no-store health, and
            one deployment profile
Invariants: both product surfaces are public; both managed adapters remain off;
            a closed surface never decrypts or uses a user lease; a public
            surface without a lease has no provider candidate; health reports
            user-configurable without claiming credential presence, provider
            reachability, output quality, or managed promotion
Proof:      surface-gate and request-pool matrices; health and deployment-profile
            tests; committed Vercel shape check; one post-deploy no-store health
            readback and one explicit lease-owned strict turn per material action
Non-goals:  managed Elastic or Text Swap promotion, weakening either harness,
            treating user spend as Matter's promotion evidence, or restoring the
            rejected paired material-live profile
```

`material-user-provider` is the current default deployment profile.
`browser-preview` and `elastic-live` remain historical profile readers only.
Their receipts continue to describe the deployments that produced them and
must not be reused as proof of this source shape.

Status note, 2026-09-29: the Preview.63 Production readback still reports both
material surfaces `unavailable` and an anonymous `provider-session/4` receipt
with `available: false`, because issue #104's deployment-owned session-sealing
ring is not installed. The strict checker therefore fails this profile by
design; the remaining step is that owner action, one fresh deployment, and the
readback above. See [`../docs/release-readiness.md`](../docs/release-readiness.md).

## Release line

The release is complete when a person can, without a keyboard:

1. speak a root thought and another thought beneath a selected node;
2. move between the full tree and one exact root-to-focus working path;
3. lasso one contiguous current segment run inside one passage, stretch it,
   release to settle any positive degree after the pointer deadzone, tap inside
   the shaped address to confirm, and receive one
   fixed expand-in-place material change; a loop that
   resolves several passage ranges remains selection-only;
4. undo the change with the pointer;
5. reload and recover the same tree;
6. export it and later restore that same document on a supported browser;
7. complete the same path in fixture and live modes on the deployed origin.

The release ends there. Accounts, sync, collaboration, path-dependent gestures,
streaming, split/merge, cross-links, tool prediction,
retrieval, and a public SDK are not later phases of this plan. They remain
outside the first release.

## Current delivery lens

The product is one interface for unfinished thought, not a bundle of AI
surfaces. The next release work must make this one loop plain to a new person:

```text
admit a thought → lasso one contiguous passage range without leaving the current view
  → stretch + release to settle degree → confirm inside the shaped address
  → one reversible material change → pointer undo (keyboard redo) → reload
```

Ask Matter remains a closed secondary orientation surface. Its local completed
record is a persistence concern, not a dashboard, memory product, or new visual
language. System files, accounts, sync, collaboration, and native shells may
arrive only after this loop has a live deployed receipt and a separate ownership
contract.

## Active sub-slice — promotion truth before provider promotion

State: Elastic tooling is implemented for health/profile separation,
tablet/strict-local recovery, a 180-case candidate corpus, a default-dry-run
origin sampler, and privacy-safe terminal observation. Its paid run, independent
review, distributed control, approved spend, and origin/browser receipts remain
open. Point-and-Talk's separate Text Swap live-promotion evidence is not a release
condition.

Status note, 2026-09-29: this section governs promotion of Matter's *managed*
Elastic adapter. Since 2026-09-25 Elastic and Text Swap are public product
surfaces that a verified user Model API lease may supply (see
"user-supplied material model surfaces" above), while both managed adapters
stay off. Read "live adapter" and "live gate" below as the managed adapter and
its gate.

```text
Outcome:    a release receipt distinguishes a safe browser preview from live
            Elastic, and a configured pool cannot impersonate a proven turn.
Boundary:   no-store health projection, deployment receipt profiles, strict
            local Elastic refusal recovery, one tablet/coarse browser proof,
            the Elastic synthetic corpus and evaluation policy,
            an explicitly authorized deployed-origin API sampler, and one
            server-only allow-listed terminal observation owner.
Invariants: health exposes no provider or material; browser-preview requires
            Elastic unavailable; elastic-live requires Elastic configured but
            cannot replace corpus, rate/spend, latency, rollback, or successful
            origin proof. Text Swap's independent public live gate remains off.
Proof:      exact health envelope and profile tests; over-capacity lineage
            start refusal with zero request/history; 834×1112 touch lasso,
            Elastic commit and pointer Undo; full source and Chromium release
            suites before promotion; 5 locales ×
            12 classes × 3 axes whose current corpus reconstructs one exact
            punctuation segment and whose source-length stratum is recomputed
            from real graphemes; contiguous multi-segment coverage must be added
            and digest-bound before elastic-live; two no-retry repeats, zero-network
            defaults, digest-bound private plan/review artifacts, strict origin
            authorization, a versioned/digest-bound origin suite with
            pre-health running manifest and awaited safe journal, shared
            8-second pacing, bounded response parsing, and low-cardinality
            aggregate tests; hostile-sentinel, exact policy-rejection, admission,
            invalid, unavailable, busy, timeout, cancellation, and one-terminal
            route tests for routine production observations.
Non-goals:  enabling the live adapter, promoting Text Swap, inventing a spend
            amount, copying an external asset into the repository, changing
            tree/history, or weakening adjudication to improve acceptance.
```

## How a phase moves

Each phase has three states. It does not create a new plan or document set.

### Research

Research only questions that can change the next build slice. Inspect the
existing code, a relevant reference, or a small prototype; stop when one
implementable answer and its proof are clear. The output is a short update to
this plan or an existing reference, not a research report.

### Freeze

A freeze names what the build may rely on: boundary, data shape, interaction,
acceptance proof, and non-goals. During build, frozen choices are not reopened
because another architecture is interesting.

A freeze may reopen only when one of these produces contrary evidence:

- a focused test or browser behavior;
- a measured performance, durability, or security failure;
- a provider contract that cannot satisfy the frozen boundary;
- a correction to the product intent.

Record the evidence and revised choice in the same reference or
[`docs/changes.md`](../docs/changes.md), then freeze again. Preference alone is
not evidence.

### Build and proof

Build one end-to-end slice through the real boundary. A phase finishes with its
receipt passing, the fixture still usable, and no temporary parallel model left
behind. Run the narrow focused checks while working; finish with `npm run check`
and the relevant Playwright flow.

Only the current phase is implementation-detailed. The next phases state their
outcome and freeze boundary so they do not accumulate speculative phase debt.

## Freeze ledger

| Area | State | Frozen answer |
| --- | --- | --- |
| Product loop | Re-frozen | Voice admission; then one contiguous one-node range stretch + release to settle degree + explicit shaped-address confirmation for fixed expansion; two or more passage ranges remain selection-only; one atomic pointer-undoable change. Point and Talk is visible; managed Text Swap promotion remains outside the release promise. |
| Material model surfaces | Re-frozen 2026-09-25 | Elastic (`transform/2`) and Text Swap (`text-swap/2`) are separately gated public product surfaces; a verified user Model API lease may supply either one request-local candidate. Both managed adapters stay off; a surface without a lease has no candidate and never borrows the managed pool or a fixture. |
| Document | Frozen | one normalized `ThoughtTree`, empty root state, monotonic revision |
| Agent boundary | Frozen | exact lineage in; model returns `{ text }`; server constructs one action |
| Text address | Re-frozen | adjacent current segments in one node merge into one Elastic range; disconnected or cross-node runs form a transient selection set with no transform authority; Point and Talk currently addresses one whole node while the Text Swap protocol retains one exact segment as an address no current surface publishes |
| Presentation | Re-frozen | top-anchored columnar tree; measured text, pure derived geometry, no authored coordinate |
| Editing tools | Frozen | closed context projection; right/bottom rail owns no runtime or tree state |
| Local return | Frozen | Markdown `SnapshotBundle`, IndexedDB durability, ZIP export/import |
| Deployment probe | Frozen | `/matter/api/health` (`/api/health` on the dedicated domain) reports coarse gated surface states without provider or material data |
| Visual composition | Local to each phase | quiet Matter form; refine from the running interface, not a second design system |
| Right paper chrome | Frozen | anonymized private composition study; the rounded paper owns ambient media, right rail, and corner utilities |
| Left material field | Re-frozen | 304 px manuscript index; structural depth steps, local disclosure, flat search, copy selection, archive, and local-only identity; drawer below 960 px |
| Lightweight inquiry | Re-frozen | one secondary bounded question surface with a local completed record only within that surface; no mutation, archive inclusion, or model-memory retrieval; answer adapter may be unavailable |
| Structural reparenting | Frozen | selected non-root node drops on a visible parent or explicit sibling slot; cross-parent and same-parent authored order use one exact pointer-undoable command; no authored coordinates |

Preview.8 title/document freeze:

```text
Outcome:    the preview has one seeded demo document with an independently renameable title
Boundary:   document-root metadata, title command/inverse, local persistence and archive round-trip
Invariants: material text never derives or overwrites the title; blank rename resets to the demo title;
            title changes are durable and pointer-undoable; no new-document UI is implied
Proof:      title command forward/inverse, blank-reset, reload, and archive tests
Non-goals:  document picker, multiple active documents, accounts, sync, or title generation
```

Post-preview maintenance freeze:

```text
Outcome:    a clean checkout and an interrupted local proof leave no tracked build output,
            orphaned POSIX dev server, or provider work owned by a cancelled request
Boundary:   Next type generation, Playwright process ownership, and one-request model scenarios
Invariants: generated declarations stay untracked; normal dev cannot inherit the E2E distDir;
            inquiry/repair cancellation reaches the provider without creating cooldown debt;
            one label caller still cannot cancel a shared deduplicated provider flight
Proof:      clean typegen/typecheck, runner missing-file/signal tests, route/client cancellation tests,
            full check and browser suite
Non-goals:  Windows process-tree supervision, deployment orchestration, transform implementation,
            or changing the measured 2,000-node rendering model
```

The foundation freeze was completed on 2026-08-03 after source research and a
second adversarial review. Its evidence lives in
[`docs/reference/foundation.md`](../docs/reference/foundation.md) and the nearby
references. It does not need another foundation phase.

Structural reparenting keeps this proof boundary:

```text
Outcome:    a selected non-root node can be reparented or reordered by pointer
Boundary:   pure drop projection -> move translator -> tree engine -> history
Invariants: one mutation, exact source/target order, bounded depth/children, exact undo
Proof:      policy bounds, stale/invalid atomic rejection, reorder/reparent inverse, browser drop/cancel
Non-goals:  authored coordinates, root movement, cross-document drag, generic drag-and-drop
```

## Phase 4 — First release

State: Integration in progress after Phase 3 proof.

Outcome: the three slices behave as one quiet, dependable product on the deployed
origin.

Work is limited to integration defects, error language, accessibility of the
existing controls, performance at specified bounds, provider configuration,
responsive polish, and release verification. No new gesture or durable concept
enters this phase.

Receipt:

```bash
npm run check
npm run test:e2e
```

Then complete the no-keyboard path in fixture and live modes at laptop and narrow
widths: admit root, admit child, focus, transform, undo, reload, export, import,
and confirm no page or console errors. Passing this receipt is the end of this
roadmap.

### Shared model kernel — common execution, scenario-owned meaning

State: Built. Exact release proof pending.

```text
Outcome:    one typed prompt and provider-execution kernel serves the existing
            model scenarios without collapsing their product semantics
Boundary:   prompt spine, scenario harnesses, provider-pool completion outcome,
            anonymous terminal observation, language-evaluation authority, and
            neutral inquiry bounds
Invariants: reference material is never instruction; bounded human intent cannot
            widen scope or output authority; each scenario keeps its own public
            protocol, projector, adjudicator, governor, gate, and settlement;
            late output never rebases, merges, records, or mutates material
Proof:      focused prompt-order and escaping tests; exact compiled-prompt and
            execution-contract reconstruction; completion-terminator matrix; candidate fallback,
            timeout, cancellation, late-drain, and closed telemetry tests; full
            source and browser receipts on the versioned candidate
Non-goals:  a generic /api/ai route, a session or retrieval layer, model-authored
            tree commands, provider streaming into material, or enabling the
            currently closed Elastic and Text Swap live gates
```

One request may fall through ordered provider candidates, but it still has one
scenario deadline, one active basis, and at most one accepted result. A result
that arrives after an attempt boundary may have its response body cancelled for
resource cleanup; it cannot be combined with the winning candidate. A result
that arrives after overall timeout, surface close, target or revision change,
document replacement, or explicit retry is inert even when its text looks
useful. Material mutations are never silently rebased: the current tree engine
and pointer Undo remain the only durable settlement path.

The prompt artifact versions advance independently of the public wire versions.
That separation is deliberate: the wire describes client/server syntax, while
the prompt artifact identifies the exact model-readable program. Paid language
authority binds every compiled prompt plus candidate thinking mode,
deterministic policy/completion identities, pool limits, and per-case budgets,
so a prompt or execution edit cannot inherit an older receipt under an
unchanged scenario label.

### Inquiry authority and record ownership — one operation, one basis

State: Built. Exact release proof pending.

```text
Outcome:    Ask Matter can be closed, suspended or displaced without a delayed
            answer entering UI or storage; completed exchanges survive a later
            view change in the record of the tree that accepted them
Boundary:   CanvasChrome inquiry authority, the material-root AI-operation
            coordinator, bounded working-context projection, request identity,
            and the serialized InquiryRecordWriter
Invariants: neutral lasso may remain Inquiry context; Point and Talk, active
            Elastic and Inquiry own one transient AI-operation slot; close,
            context change, page suspension and document replacement revoke
            request authority synchronously; late answers never render or
            persist; accepted durable work never changes tree owners; clear
            epochs cannot be resurrected
Proof:      request-received delayed close, suspension and context-change
            browser tests; Point-and-Talk and keyboard Elastic ownership; clean
            reopen identities; deferred-load tree switch, rapid append,
            clear/append and stale-epoch unit tests; 2,000-node bounded-read
            projection proof
Non-goals:  chat memory, a cross-tree session, automatic late-result merging,
            hidden retrieval, one generic AI state machine, or putting record
            writes in material history
```

The coordinator starts at the product root because exclusivity is a surface
fact, not a provider abstraction. The three business lifecycles remain
separate: Elastic and Point and Talk may settle one pointer-undoable tree
mutation; Inquiry may settle only one read-only exchange. A selection by itself
does not take the slot because it is still valid as Inquiry's explicit context.
Elastic takes it at the first accepted grip adjustment, when generation is
actually about to own that address.

### Inquiry context address — one field is answering four questions

State: Specified. Blocked on a product decision about stored records.

```text
Outcome:    the model is told which part of the tree a person addressed, in the
            person's own terms, and the type stops carrying a number that means
            something different depending on a sibling field
Boundary:   InquiryContext, the inquiry wire contract, the stored exchange
            basis, the two E2E inquiry mocks, the pool probe, and docs/protocol.md
Invariants: material is still projected exactly as it is today — focus already
            narrows to the root-to-focus lineage and held-aside and folded
            material is already absent; only the naming changes. No new address
            may be inferred by a model; every one comes from a gesture
Proof:      per-kind projection tests, expanded contract parse/roundtrip tests,
            a stored-record migration
            receipt, and both E2E mocks reproducing inquiryReceipt exactly
Non-goals:  a subtree address, retrieval, a session or context-set layer, or
            any change to what material is sent
```

`scope: "selection" | "tree"` is one field standing for three real addresses. A
person in focus asked along one authored path; a person in full view asked
against the working projection; a person with a lasso asked about exact
passages. Two of those arrive as `"tree"` and are described to the model in the
same sentence, so it cannot tell a deliberately narrowed thread — where siblings
and cousins are absent *because the person said so* — from a complete projection
where absence means something else.

The type is already accreting the difference elsewhere: `parseContext` forbids
duplicate node ids only in tree scope, requires an empty lineage to agree with a
zero thought count only in tree scope, and requires the first node to be at depth
zero. Those are three per-address laws maintained by hand on a flat shape.

Three addresses exist and no more: `selection`, `lineage`, `working-tree`.
`subtree` is not among them — it appears in this repository only as a tree
*mutation* (`remove-subtree`), never as something a person addresses, and adding
it would be designing past the roadmap.

What makes this a separate change rather than part of the `inquiry/3` freeze:
`matter-database.ts` persists `basis.scope` in IndexedDB, and
`isStoredInquiryExchange` rejects a row whose scope it does not recognize. A new
vocabulary therefore silently discards a person's saved inquiry record unless it
is migrated or mapped. That is a durability question with its own proof
obligation, and it does not belong inside a prompt freeze.

The one model-visible harm has already been removed without touching any of
this: a selection no longer reports `depth` to a model, because there it only
ever meant visible material order. The wire still carries the field; the stored
look-back record keeps coarse scope only, with no lineage or depth.

Open decision for the owner: migrate stored rows to the new vocabulary, or keep
the stored basis on the current two values and map the three addresses onto them
for look-back only. The second keeps every saved record and costs one documented
lossy mapping; the first is cleaner and needs a migration receipt.

### Attempt window versus answer length — reopened by Preview.57 evidence

State: Repair correction implemented locally on 2026-09-18; deployment proof
remains required.

Inquiry asks for up to 720 output tokens and takes `maxAttemptShare: 0.5` of a
16s deadline, so two ordered candidates may each receive a real window. Repair
previously kept a 0.95 exception after its provider deadline grew to 6–8s. The
2026-08-28 correction replaced it with the shared 0.5 ceiling on the assumption
that two three-to-four-second attempts were real fallback. Preview.57 supplied
the missing counter-evidence: the 6,504 ms Repair canary returned
`MODEL_TIMEOUT` 6/6, while Label reached the provider 6/6 with roughly six
seconds available per candidate and Inquiry returned accepted answers 6/6.

Repair therefore again owns a 0.95 first-attempt ceiling, plus a one-second
minimum useful attempt. A fast refusal or transport failure still leaves nearly
the complete remainder for the next candidate. A relay that spends the usable
window cannot buy a second sub-second attempt merely to say fallback occurred;
the already-visible deterministic transcript settles this request and the pool
cools that scenario/candidate for nearby work. Label, Inquiry, and the shared
default remain at 0.5. No deadline or twelve-second mutation lease grew.

Inquiry's split buys two attempts, which is the right trade when a bad relay
fails fast: the second candidate still gets a real turn. It is the wrong trade
when a bad relay *hangs*, because two 8s hangs spend the whole budget and the
person waits the full sixteen seconds for nothing.

The hazard worth writing down is not the split but what it would look like. If a
healthy inquiry answer ever grew past 8s — a longer material bound, a slower
relay, a model that reasons before answering — inquiry would fail permanently
and would present as `MODEL_TIMEOUT`, which is indistinguishable in the receipt
from a relay that is simply down. The condition is real and invisible.

**This was not the 2026-08-28 Production incident.** Measured healthy inquiry
latency is 915ms, so 8s is roughly eight times the headroom actually needed;
widening the Inquiry window would have changed nothing, and doing it would have
been a change that looked responsive while fixing nothing. The new evidence is
specific to Repair's much shorter, heavier call and does not reopen Inquiry's
share. See the incident section in `docs/deployment-owner-handoff.md`. Reopen
Inquiry only with a measurement showing a healthy answer approaching its own
window, not after an unrelated timeout.

## Active freeze — blank-to-material launch-film master

State: Reopened on 2026-09-17 by explicit editorial revision. The V5 renderer
and offline A+B composition proof pass; a fresh V5 product take, final visual
review, and archival-audio publication decision remain.

```text
Outcome:    one 52-second launch master makes Matter's founding promise legible:
            an empty paper receives human voice, structure grows from it, and
            bounded AI appears only where a person points, stretches, or asks
Boundary:   a 1600×900 operator-only Playwright take rendered to 1440×810 at
            30 fps; explicit empty light-paper startup; one renderer-owned title;
            early About and settings; real FX into daylight leaf motion; Voice
            recording, transcription, and first admission; two Branch/index changes;
            Point Talk; explicitly confirmed Elastic; one live Inquiry; Undo;
            real appearance change into dark night leaf motion; real durable
            canvas title “被允许想象的其他生活”; five
            DOM-bounds-derived camera moves; one real eased canvas zoom-out;
            slower curved pointer routes; renderer-owned focus return and a
            five-second night-paper-to-material-signal close; external archival audio
Invariants: the recorded interface is the product interface; Voice remains human
            admission; every material-changing AI result is one perceivable,
            pointer-undoable commit; only Inquiry may receive explicit live-
            provider authority; all other generated results remain fixtures;
            the opening title and closing signal field belong to the film renderer,
            never the product DOM; the close begins from the actual night frame
            and contains no invented control or title scan; no prompt panel,
            invented product overlay, key, external
            audio, recording, transcript, provider answer, or user material enters git
Proof:      the accepted V4 1600×900 take passed exact structural-selection
            line-geometry equality and emitted a receipt with two
            Transcription requests plus one Transform, Text Swap, and Inquiry;
            story events remained ordered and the opening/daylight/night states
            matched. Offline continuation rendered a 52.000-second 1440×810,
            30 fps H.264/AAC master. Fresh full-film and six sectional contact
            sheets, five transition sheets, loudness inspection, and a warning-
            free complete decode passed; the private master SHA-256 begins
            ae847cd6422a2cb4. The V5 renderer contract, title receipt, pointer and
            camera timing changes pass focused tests, typecheck, and zero-warning
            lint. An offline hybrid render of that accepted raw take produced a
            52.000-second 1440×810, 30 fps H.264/AAC proof and a reviewed full-film
            contact sheet. That derivative is composition evidence, not a V5 take.
Non-goals:  adding a new-document product flow, changing provider or protocol
            policy, showing every available interaction, adding literal UI foley,
            adding a title scan, presenting the closing network as product UI,
            shipping archival audio, or treating a staged film as availability proof
```

The pitch's retained proposition is the selection rule for this edit: Voice
expresses intent, gesture gives language a body, and AI behaves as connective
tissue inside material. About and settings establish provenance before material
arrives; branching proves structure through both paper and index; Point and Talk,
Elastic, and Inquiry receive bounded close camera treatment, while Voice receives
one strong control close-up and one gentler material close-up. The five moves use
separate semantic motion contracts; the paper zooms out only through its own
canvas navigation. Structural selection must preserve every measured text-line
rectangle before the first branch or the take aborts. Navigation,
archive, node drag, focus, folding, and hold-aside remain real product
capabilities but are omitted when they do not advance that single causal
sentence.

## Moved to plan history

On 2026-09-29 these sections moved verbatim, in this order, to
[`../archive/plans-0.2-history.md`](../archive/plans-0.2-history.md). The file
is trace, not instruction. "Still open" names the only follow-up a moved
section carries; everything else it describes is done or superseded.

| Section | State when moved | Still open |
| --- | --- | --- |
| Active delivery — Preview.58 material and mobile interaction correction | review candidate; merged to `main`, but no Preview.58 Production receipt was recorded (Preview.63 is the current readback) | physical iPhone/iPad Safari Voice and multi-touch receipt |
| Active correction — Pan reports its canonical camera scale | Proven | — |
| Active correction — Label evidence is precommitted before spend | implemented and verified locally | no paid run or quality promotion is authorized |
| Historical correction — bounded localhost AI demonstration | historical receipt | — |
| Active correction — submitted intent, precise lasso, and private provider session | merged and deployed at Preview.57; successor hardening merged | issue #104 sealing ring and the strict pool gate, tracked in release readiness |
| ↳ mobile Pan keeps one continuous touch owner (subsection of the above) | implemented and verified locally | physical-device receipt, non-blocking |
| Active correction — one material icon across platform surfaces | implemented and proven | — |
| Active correction — paper-bounded narrow index disclosure | implemented; proof complete | — |
| Active correction — system seed follows the five-locale interface | implemented; proof complete | — |
| Active correction — desktop corner optical clearance | implemented and proven | — |
| Active correction — native leaf media across quiet corner Chrome | implemented; proof complete | — |
| Active correction — one local language interaction | implemented; its own source and browser proof was never closed as a separate receipt; later Elastic entries in `docs/changes.md` refine it | none of its own; later Elastic releases, through the Preview.53 receipt, carry and refine the behavior |
| Active correction — the material index keeps one local structural grammar | released in Preview.45 | — |
| Active correction — index navigation lands at the visual-attention centre | implemented; proof complete | — |
| Active correction — one bounded Control Fog surface | implemented; proof complete | — |
| Active sub-slice — selected language owns one interstitial lane | closed by the Preview.37 receipt | — |
| Active correction — selected material keeps one address through Elastic | deployed as Preview.53; tag withheld | per-row capsule shape, radius, and step rhythm: a deliberately deferred calibration |
| Deferred freeze — Text Swap / text-swap/1 | deferred; superseded by `text-swap/2` Point and Talk | — |
| Active freeze — Elastic Language 2 / transform/2 | implemented and proven; the contract lives in `docs/protocol.md` | — |
| Historical phase — Preview.39 release convergence, with its eleven subsections | historical | its 2026-08-28 corrupt-history recovery risk is taken up by the campaign's bounded-undo decision and slice T3 |
| Archived preview implementation notes: Preview.12, Preview.13, post-Preview.12, Preview.10, durable inquiry record | archived; the inquiry record contract lives in `docs/reference/inquiry-record.md` | — |
| Phase 1 — Rooted Matter | Proven | — |
| Phase 2 — Thought can be handled | slices proven in fixture mode | Slice 2A.1 deployed HTTPS Chrome/Safari device receipts; the live-mode path is owed by the Phase 4 receipt |
| Phase 3 — Material can return, including the viewport-DOM research | proven except the active-document pointer | the deferred active-document pointer; viewport-DOM stages C4–C5 stay closed and no campaign has reopened them; the strict 2,000-node gate is tracked in release readiness |
| ↳ Fixture lineage and selected material affordance (from Phase 4) | Proven | — |
| ↳ Public discovery boundary (from Phase 4) | Proven | — |
| Current risks: maintainer corrections, Preview.55 and Preview.56 publication records and audits, the synthetic speech receipt, and the original risk list | implemented and verified, or historical | the synthetic speech receipt stays capability-gated |
| Active freeze — label gate attribution conclusion | concluded from the A4 run | a repeat ≥ 3 run before any Label repair is promoted |
| Active correction — invisible local Wiki (moved later on 2026-09-29) | superseded by the addressable Wiki campaign | the open items now listed under “Active correction — addressable local Wiki” |
