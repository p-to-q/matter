# Plan: Matter first release

Status: Active  
Current phase: 4 — first-release integration. Phase 1 is proven; Phase 2's
slices are proven in fixture mode, with their deployed live-mode path still
owed by the Phase 4 receipt; Phase 3 is proven except its deferred
active-document pointer. Public Elastic and Text Swap surfaces may use a user
lease; managed promotion stays off.  
Destination: the first usable public release at `ptoq.io/matter`

This is the only roadmap. It ends at the first release; it is not a forecast of
Matter as a platform. It holds only work that is active or still open. Proven,
completed, historical, reverted, and superseded sections are trace in
[`../archive/plans-0.2-history.md`](../archive/plans-0.2-history.md); the index
at the end of this plan lists them.

## Active campaign — nothing a person does is silently lost; Wiki becomes addressable

State: frozen 2026-09-29 after a nine-part audit of `c6027c8` and five external
research passes (bounded undo, local durability, exit motion, IME/Escape/pen
input, implicit feedback). Target: Preview.64 on `main`.

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

Slices, in dependency order. T-slices run in parallel; W-slices follow W1.

| Slice | Owner boundary | Delivers |
| --- | --- | --- |
| T1 keyboard and chrome | `composition-safe-keys`, CanvasChrome, PointTalkComposer, Escape owners, MaterialFiles rename | IME-safe Enter/Escape across engines, one Escape per layer, Ask Matter survives detach and breakpoint changes, audible answers, quiet inquiry unavailability |
| T2 voice and presence | admission driver/reducer, browser voice, local transcription, AdmissionFeedback, Point Talk presentation | no silent drop on retry, warm-up timeout, or vanished parent; a kept transcript on stale target; presence exits with minimum dwell; pointer-idle recovery |
| T3 history and storage | tree history, history recovery, matter database v6, document repository, persistence controller | bounded undo, per-entry journal records, constant-cost recovery with use-time validation, material-before-history under quota |
| T4 durability surface | persistence controller, MaterialFiles footer, MatterApp archive copy, generation channel | truthful docked save state, dirty-only `beforeunload`, cross-tab generation broadcast, superseded schema, storage-full import path, bounded `persist()` |
| T5 AI turns | text-swap driver, fixed-expand turn, label driver, store turn commit, material ingress | no redo loss from late turns, no pre-submit invalidation by visibility, locale relocalization waits for turns, Elastic failure is announced and parked delivery is bounded, a valid AI answer survives lexical post-processing, pen-active palm rejection |
| W1 Wiki evidence semantics | `features/matter/wiki` policy, evidence, runtime core | quarter-unit ledgers with V7 migration, comparable-opportunity aging, bounded admission queue, scanned-only partial batches, explicit producer precedence |
| W2 occurrence attribution | material lexical port, material ingress receipt, Wiki occurrence owner | opaque per-edit occurrence tokens in committed coordinates, bounded in-memory occurrence lifecycle, one settlement per occurrence |
| W3 disclosure and takeover | render edge, Custom Highlight, local takeover popover | heard-to-canonical settle, quiet unsettled mark, Keep / heard form / Wiki takeover, revert as a material command |
| W4 informed acceptance | Wiki learning policy and runtime | perceived precondition, settlement triggers, integer weights, retention-only reinforcement, two-strike reversion |
| W5 mixed-script routing | Wiki fitting locale routing | Latin-script spans inside CJK turns reach the English fitting producer under corpus qualification |
| D documents | product, principles, material, architecture, protocol, surfaces, references, changes, this plan | one truthful contract set; historical plan sections archived |

Release gate: every slice verified; three whole-diff verifier rounds pass with
their findings fixed; `npm run check` and `npm run test:e2e` pass locally and in
CI; the owner walks localhost; the pull request merges to `main`; Production
reads back Preview.64. The prerelease tag stays withheld until #104 and the
strict pool probe pass.

## Active correction — invisible local Wiki

State: lexeme-first domain, persistence, neutral patch-based lexical port,
separate human-observation capability, Wiki adapter, material-ingress foundation,
canonical-word settings surface, strict export, cross-tab admission rederivation,
negative-capacity learning latch, bounded automatic term collection, a
runtime-qualified internal-Latin-edit producer, offline-qualified
English/Mandarin pronunciation research producers, and corrupt-row recovery
implemented; high-ambiguity pronunciation projection, error-local attribution,
and recognizer-time bias remain gated.
The settings projection now includes a reversible voice/generated-text scope,
with V2/V3 migration to `both`, scope-aware disposable caches, and no deletion
of disabled-channel lineage. Locale is inferred rather than exposed as another
configuration burden. The offline pronunciation qualification compiler uses
pinned `double-metaphone` and `pinyin-pro` resources. The product's lazy Wiki
runtime ships neither resource; it does not claim acoustic confidence or feed
lexical context to a recognizer.

```text
Outcome:    repeated recognition and wording mistakes disappear without asking
            a person to operate or approve a dictionary
Boundary:   one origin-local locale × channel authority; deterministic evidence
            capability after proven human admission; one composition-owned Wiki
            adapter behind a neutral captured lexical port; one browser-side
            MaterialIngress facade before an existing tree command; one
            error-local correction escape hatch
Invariants: in this release, no Wiki value enters a model, wire request, archive, public action,
            or material history; generated and repaired output contributes zero
            evidence; old trees are not rescanned without authorship provenance;
            normal hits have no UI; human correction takes over one canonical
            lexeme and every hidden alias; removal cannot be undone by automatic
            relearning; an exceptional configuration path permits explicit
            add/edit/remove/export; a corrupt row can be explicitly reset
            only while it remains corrupt; Wiki failure becomes identity or
            last-good basis and never blocks material; pronunciation work
            compiles bounded aliases on authority change and leaves the
            synchronous material hot path exact-only
Proof:      strict state codec and bounds; locale-isolation and ambiguity tests;
            immutable compiled matcher and operation budget; IndexedDB CAS;
            raw-before-lexical and final-after-lexical validation at every text
            ingress; architecture proof that server, protocol, API, and store
            cannot reach concrete Wiki
Non-goals:  memory, RAG, embeddings, prompt vocabulary in this release, model-managed learning,
            a review queue, permanent dictionary chrome, historical tree mining,
            cross-account sync, dynamic plugins, bulk editing, runtime fuzzy
            phonetic distance, or enabling pronunciation without corpus proof
```

Automatic provisional rules stay release-gated by representative corpora that
prove precision, ambiguity rejection, locale isolation, generated-output
exclusion, capacity, and performance. The exceptional correction surface must
retain only a short-lived,
content-minimal attribution token for the exact applied rule; it must not infer
responsibility later from a changed basis or from a whole-text diff. Applying a
rule does not add an icon or hover action; attribution is disclosed only after
the person invokes correction on the erroneous word.

Maintainer clarification, 2026-09-25: the candidate-local 32-turn quiet horizon
is only a far-horizon aging cadence; it is not a user-intent window. The
production `recent-material` producers receive only a bounded successful human
admission and must not infer intent from generic deletion, Material Undo or
Redo, repetition within one turn, or later whole-text edits. Settings
create/rename/scope/remove decisions are direct human authority and bypass
scoring. Confirm/reject/replace remain the exact domain outlet for a later
error-local correction, but the composition-owned one-shot token and its UI must
land together; no generic decision port is added in advance. The token binds the
applied basis/rule to one visible occurrence and current document/interaction
epoch, carries no surrounding passage, and expires rather than being rebuilt
from a later diff.

Maintainer freeze, 2026-09-26: automatic collection and alias fitting use two
separate bounded ledgers. Canonical recurrence may decide that a word is worth
listing, but it can never prove that one observed form should rewrite to that
canonical word. Alias authority therefore accepts only relation-specific
producer evidence or one addressed human decision. This separation replaces
the mixed `historical + recent + machine` score before either automatic
capability becomes release-default behavior.

Maintainer correction, 2026-09-27: one successful admission may yield both a
broad term event and a more specific fitting event. If exactly one released
internal-edit relation targets an eligible existing canonical, the broad event
for that same source is omitted for that admission; multiple candidate targets
omit nothing and abstain. This is batch arbitration, not shared scoring. It
prevents two-turn term collection from making the four-turn relation
unreachable while keeping every existing canonical a hard no-op veto.

The local learner is a deterministic state machine, not online reinforcement
learning. One successful human admission is one logical environment tick;
generated, repaired, transformed, imported, undone, or rescanned text produces
no tick reward and no evidence. Within one tick, an identical candidate counts
at most once. The first three or four independent turns provide the useful
information. Each candidate owns a bounded quiet counter; there is no global
cohort edge. Term evidence uses one saturating integer support value:

```text
support'   = min(255, support + one bounded observation)
observed  = support', quiet = 0
not observed for 32 successful human admissions:
            support = floor(support / 2), quiet = 0

candidate -> collected when support >= 2
collected -> candidate only when support = 0
```

Two independent human turns therefore surface a name at any position in the
product lifetime; no global boundary can erase the second vote. The one-count
retention band prevents a collected term from flickering out at the first quiet
far-horizon aging; without new evidence it sinks on the next aging, while
repeatedly reinforced support can survive proportionally longer. A fully
decayed machine-only candidate with no authority, alias evidence, or tombstone
may be evicted without creating negative authority. Human-owned terms, product
seeds, and tombstones never participate in automatic eviction.

Alias evidence is relation-specific and carries one versioned producer id. Its
bounded support decays by half only after that candidate has been absent from
32 successful human admissions. A candidate
may rise only when its producer is release-qualified, the weighted winner meets
the activation threshold, and its lead over the runner-up meets an ambiguity
margin. Exact-pronunciation evidence has integer weight `3`; restricted
near-sound and internal-orthographic evidence has weight `2`. The shared
activation score is `8`, so an unopposed exact relation may rise on its third
independent turn and a restricted relation on its fourth. Activation margin `4`
blocks exact `3 versus 2` and near `4 versus 3` contests, while accepting exact
`3 versus 1` and near `4 versus 2`. An active alias uses retention score `5`
and margin `3`, but a challenger must always clear the higher activation gate.
A resource or classifier change changes the producer or fitting version rather
than silently reinterpreting old votes. Disablement removes provisional aliases
from the compiled basis without deleting their evidence. Confirmed human and
product rules remain exact authority.

Counter-evidence is narrow and attributable. A competing canonical for the same
locale/channel/form reduces the winner margin after every successful admission
and may make the resolver abstain immediately, without waiting for aging. One
addressed human reject, replacement, or removal bypasses scoring and becomes
confirmed authority or a tombstone. Passive use may become weak positive
evidence, but only after one exact applied occurrence survives one
foreground-visible, corpus-calibrated horizon. It settles once; a later
reapplication is a new occurrence rather than another reward tier for the first.
Material Undo and Redo remain a completely separate tree-history system. Wiki
neither listens to nor interprets them. If the visible address disappears, the
transient occurrence expires without a Wiki event. A future Wiki reversal, if
needed, owns an independent implementation, explicit decision, and persistence
lifecycle; only strict contract principles may be shared with material history,
never its command types, state, stack, or framework.

Environment, reward, and evaluation stay outside production authority. A pure
trace-replay harness treats `(Wiki state, logical tick)` as the environment and
the deterministic collect, activate, demote, evict, or abstain transition as
the action. Its evaluation is lexicographic rather than a runtime scalar:
false rewrites and protected/generated rewrites must remain zero, then misses
are minimized before correct applications, activation latency, demotion latency,
or churn may improve. Corpus receipts also hold state bytes, compile and match
latency, and cross-tab CAS retries. Runtime
weights remain versioned integers frozen from those receipts; they never adapt
from live user material. A second fixed interaction corpus labels expected
accept, reject, or unknown outcomes and observes exactly one explicit decision,
survived horizon, or censored terminal state per occurrence.
It reports denominated reject and censor rates plus raw survived exposure,
unsafe-attribution, and false implicit-positive counts instead of inventing live
reward weights. Censored exposure never becomes a failed survival. Generated
output contributes no implicit evidence; an explicit addressed human decision
may still become authority. Censoring is neutral.

The implementation order remains explicit:

1. complete: pure integer policy and replay proof;
2. complete: separate term and alias ledgers with strict migration;
3. complete: manifest-owned corpora, raw-artifact hashes, and controlled
   qualification receipts;
4. complete: versioned local term and fitting producers in the offline
   qualification catalog;
5. deferred: one-shot occurrence owner and addressed correction command;
6. complete: truthful runtime release identities plus independent local
   permissions; and
7. complete for automatic collection and bounded internal-edit fitting:
   default-on local automation after positive, adversarial, ambiguity,
   protected, generated, cross-tab, capacity, and performance gates; exact
   homophone and Mandarin pronunciation producers remain offline-only.

The existing Wiki list remains the end-to-end surface. V6 adds only two quiet,
default-on local permission actions in its lower-right footer: automatic term
collection and phonetic fitting. They persist separately from Wiki data and
Material history, and can only restrict a capability that has independently
passed the release gate; they cannot promote an inactive producer. Hidden candidates do not appear there. Collected terms
appear under `Automatically added`; a person edit promotes one to confirmed
authority, and removal creates a tombstone. Routine learning, matching,
survival, and decay remain invisible, so a person can benefit without ever
opening Wiki. Only an obvious error that the person elects to correct exposes
the narrow local takeover. A later UI must derive `exact-only`,
`pronunciation`, `full-auto`, or `paused` from the published runtime capability,
never from an environment variable, starter row, or optimistic preference. The
local actions express permission, not availability. The surface adds no score,
confidence, language picker, review queue, alias table, or confirmation workload.

The bounded product release uses one conservative internal ASCII edit. Exact
Mandarin pinyin identity, the `an`/`ang`, `en`/`eng`, and `in`/`ing` final pairs,
and exact Double Metaphone identity remain reproducible qualification-only
candidates rather than runtime rewrite authority. Single-character polyphones,
unknown names, candidate collisions, cross-locale matches, and protected
literals abstain. Compiled resource versions participate in disposable cache
identity, never durable human authority. Homophone projection, broader phoneme
distance, ASR phrase bias, and acoustic alternatives remain gated behind a
future concrete recognition adapter.

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
| Active delivery — Preview.58 material and mobile interaction correction | review candidate; shipped as Preview.58 | physical iPhone/iPad Safari Voice and multi-touch receipt |
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
| Active correction — one local language interaction | implemented; later Elastic entries in `docs/changes.md` refine it | — |
| Active correction — the material index keeps one local structural grammar | released in Preview.45 | — |
| Active correction — index navigation lands at the visual-attention centre | implemented; proof complete | — |
| Active correction — one bounded Control Fog surface | implemented; proof complete | — |
| Active sub-slice — selected language owns one interstitial lane | closed by the Preview.37 receipt | — |
| Active correction — selected material keeps one address through Elastic | deployed as Preview.53; tag withheld | — |
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
