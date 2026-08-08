# Architecture Governance

Status: evidence note for protocol `0.2`, reviewed 2026-08-09. The current
contract remains [`../architecture.md`](../architecture.md) and
[`../engineering.md`](../engineering.md); this note records why those rules
exist, where the implementation currently departs from them, and how to improve
the system without importing a generic engine architecture.

## Judgment

Matter does not have an architecture-selection problem. Its product-shaped
kernel is already the right choice: one authoritative `ThoughtTree`, one durable
mutation engine, exact inverses, pure projections, bounded network values, and
transient interaction state outside the document. That resembles the useful
parts of mature engines and editors more than replacing it with ECS, a scene
graph, a service hierarchy, or a collaborative database would.

The maintenance risk is that repository law is ahead of repository mechanics.
Several important boundaries are prose-only; one runtime import cycle exists;
browser code imports contracts from the provider-owned `server/` directory;
fixture behavior reaches a production action; user-authored names share a
best-effort cache; and three view modules own several independent lifecycles.
The next architecture phase should therefore make ownership executable and
repair named seams. It should not be a broad rewrite.

This is a code-quality judgment, not evidence that people repeatedly use the
product. The repository proves that the product is substantial and seriously
tested; repeat use and the core path's real-world reliability still require
first-hand product evidence.

## What mature systems are actually buying

The valuable common denominator is not a particular folder tree. Mature systems
pay complexity only to obtain four properties:

1. one owner can answer who may change a fact or release a resource;
2. execution order and commit points are explicit where order affects meaning;
3. an illegal dependency fails mechanically before merge;
4. recovery and stale-result behavior are demonstrated, not inferred.

The following sources are first-party documentation or engineering accounts.
They are prior art, not a request to copy their source or organization.

| Prior art | Why the design is reasonable | Borrow for Matter | Do not copy |
| --- | --- | --- | --- |
| [Unity lifecycle](https://docs.unity3d.com/6000.0/Documentation/Manual/execution-order.html) and [assembly definitions](https://docs.unity3d.com/6000.0/Documentation/Manual/assembly-definitions-intro.html) | A defined loop makes consequential order visible; assembly references constrain module edges and reduce unrelated rebuild work. | Name the prepare, effect, revalidate, commit, publish, and cleanup phases of an async turn; check dependency direction. | A global frame loop, `MonoBehaviour` hierarchy, scene store, or ECS. Matter is event-driven and has one ordered tree, not thousands of homogeneous per-frame entities. |
| [Bevy schedules](https://docs.rs/bevy/latest/bevy/ecs/schedule/) and [deferred commands](https://docs.rs/bevy/latest/bevy/ecs/system/struct.Commands.html) | Systems declare ordering and structural changes cross a deliberate application barrier. | Keep public intent smaller than private mutation and let only the tree engine cross the durable commit barrier. | An ECS, plugin registry, or global scheduler. They add indirection without giving this document model data-locality benefits. |
| [VS Code source organization](https://github.com/microsoft/vscode/wiki/source-code-organization) | Core layers point in one direction, environment-specific code is separated, and extensions see a narrow public surface. | Separate pure domain, application ports, browser/server adapters, presentation, and composition; expose deliberate entry points. | Its dependency-injection service graph, extension host, or process topology at the current scale. |
| [Chromium dependency checks](https://chromium.googlesource.com/chromium/src/+/main/docs/dependencies.md) and [task ownership](https://chromium.googlesource.com/chromium/src/+/main/docs/threading_and_tasks.md) | `DEPS`/`checkdeps` turns modularity into a build property; sequence ownership makes late callbacks and destruction explicit. | Add an import fitness check; require token, cancellation, idempotent cleanup, and late-result no-op tests for external resources. | Browser process isolation, locks, task runners, or a general threading framework. |
| [SQLite architecture](https://www.sqlite.org/arch.html) and [write-ahead logging](https://www.sqlite.org/wal.html) | The pager owns cache, locking, and atomic durability so the B-tree does not; WAL documentation is explicit about checkpoint and growth costs. | Keep IndexedDB atomicity and conflict recovery behind the document repository; measure full-history save and hydration costs. | Calling undo history a WAL or adding checkpoint/compaction before a failure model and measured need exist. |
| [Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/) and [API resource versions](https://kubernetes.io/docs/reference/using-api/api-concepts/) | Small reconcilers compare desired and observed state; version checks reject updates based on stale observations. | Keep persistence retryable and idempotent; preserve revision/CAS checks for another tab and operation tokens for async work. | A controller for every module, watches, etcd, microservices, or eventual consistency inside one browser document. |
| [React state structure](https://react.dev/learn/choosing-the-state-structure), [Effect lifecycle](https://react.dev/learn/lifecycle-of-reactive-effects), and [Next client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Derived state is not duplicated; each Effect is one independent synchronization process; a client entry defines a whole client module graph. | Classify every fact; split view code by owned lifecycle; make provider code server-only and cross-boundary values serializable. | Moving domain rules into hooks or relying on `'use client'` itself as a security boundary. |
| [Redux normalized state](https://redux.js.org/usage/structuring-reducers/normalizing-state-shape) | Stable identities and single ownership avoid contradictory copies; side effects stay outside pure reducers. | Keep the normalized tree, pure mutation engine, and async effect/commit separation. | Putting pointer, audio, transcript, focus, or every cache into one global store. |
| [Figma multiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/), [Figma reliability](https://www.figma.com/blog/making-multiplayer-more-reliable/), and [Linear sync](https://linear.app/now/scaling-the-linear-sync-engine) | Both evolved a problem-shaped sync boundary from real collaboration and scale constraints; Figma explicitly chose a simpler algorithm where generic OT was unnecessary. | Use replay-equivalence and recovery proofs; define a separate sync contract only if collaboration becomes a real product requirement. | Prebuilding CRDT, cloud authority, event sourcing, or a sync engine for the current local single-document release. |
| [Bazel dependency visibility](https://bazel.build/concepts/visibility) and [Google small changes](https://google.github.io/eng-practices/review/developer/small-cls.html) | Illegal dependency edges fail during analysis, while small coherent changes make review and rollback tractable. | Enforce a lightweight local DAG and repair one ownership seam per change. | Migrating this application to Bazel or adding large-organization approval ceremony. |

## Target ownership model

This is a logical dependency model, not a demand that every box become a package.
Arrows mean “may depend on.” Composition is allowed to know concrete adapters;
inner modules are not.

```mermaid
flowchart TD
  C["Composition: app, routes, store factory"] --> P["Presentation: components"]
  C --> A["Adapters: DOM, audio, worker, HTTP, IDB, providers"]
  C --> U["Application: use cases, sessions, public actions"]
  P --> U
  P --> Q["Pure projections: layout, context, tools, indexes"]
  A --> R["Ports and versioned protocol"]
  U --> R
  U --> Q
  Q --> D["Domain: tree, text, geometry, command engine"]
  U --> D
  R --> D
```

Consequences:

- the composition root selects fixture or live adapters; production use cases
  never import a fixture;
- browser clients and server routes share a neutral protocol module, not a
  provider directory;
- presentation invokes public application actions and renders projections; it
  does not construct private mutations or own durable recovery;
- adapters depend inward on ports and domain values; domain code never imports
  React, Zustand, DOM, browser, storage, route, or provider code;
- a directory move is warranted only when it makes one of these ownership rules
  enforceable. It is not an end in itself.

## State ownership ledger

Every state item belongs to exactly one class. “Stored in IndexedDB” does not by
itself decide whether something is a cache.

| Class | Examples | Owner and required failure behavior |
| --- | --- | --- |
| Authoritative document | `ThoughtTree`, title, revision | Tree engine constructs changes; document repository publishes atomically; conflicts and failed writes are visible. |
| Durable local choice | active-document pointer; a manual node name if the product promises it survives | A named repository with versioning, rollback, and non-silent failure. It is not evicted as cache pressure. |
| Durable recovery journal | exact inverses and persistence metadata | Persistence owns atomicity and recovery. A supported size/session boundary is measured and explicit; physical quota is not a policy. |
| Transient interaction | pointer capture, lasso, stretch, focus, fold, audio, interim transcript, inquiry exchange | One session/controller owns start, cancel, cleanup, and document-epoch invalidation. Never enters snapshots or command history. |
| Derived projection | visible tree, layout, file rows, context, deterministic labels | Pure or reproducible from authoritative input. Safe to discard and recompute. |
| Derived cache | measured layout maps, provider label result, row projection | Must satisfy the cache contract below. A miss or loss changes cost/latency, never truth. |
| External operation | worker inference, HTTP request, microphone, timer, animation frame | One adapter owns the resource; completion carries an operation token and is revalidated before any commit. |

## Cache contract

Do not create a generic cache layer. For each actual cache, record these fields
next to its implementation or focused reference note:

```text
Owner:          module that creates, reads, invalidates, and observes it
Authority:      always derived; name the authoritative input
Key:            every value whose change makes an entry stale
Bound:          entries, bytes, TTL, or weak reachability
Invalidation:   event or epoch that removes/abandons an entry
Revalidation:   checks repeated on a hit before it is trusted
Fallback:       safe behavior after miss, corruption, or write failure
Observation:    measurement that would justify a more expensive cache
```

Current layout WeakMaps and bounded Maps, and the server label cache with
fingerprint/prompt-version checks, fit this model. The document snapshot is not
a cache. A model-generated label may be a best-effort cache; a manual name is a
human decision and must not share the same silent failure contract.

## Audit snapshot

The following are implementation findings, not architectural guesses.

| Finding | Evidence | Consequence | Direction |
| --- | --- | --- | --- |
| Core mutation boundary is strong | `tree/engine.ts`, `tree/history.ts`, focused command and inverse tests | Durable changes have one authority and stale input can fail atomically. | Preserve; do not replace with a generic transaction or scene system. |
| The import rules are not executable | `eslint.config.mjs` contains only Next defaults; `scripts/doctor.mjs` checks repository posture but not dependencies | New cycles, provider leaks, and fixture imports depend on review memory. | Add a small repository-owned import graph check to `npm run check`. |
| One runtime cycle exists | `browser-voice.ts` constructs the speech adapter; `browser-speech-voice.ts` imports `VoiceError` and port types back from it | Contract and composition ownership are fused. | Extract a neutral voice port/error contract and keep factory wiring at the edge. |
| Production imports fixture behavior | `matter-store.ts` and the Branch path call `fixtures/rooted-material.ts` | A disabled or unfinished capability can silently create fixture material. | Inject initial/demo data at composition; remove fixture mutations from production actions. |
| Browser imports `server/*-contract` | transcription, label, repair, inquiry clients and inquiry UI import those files | The documented provider boundary is not a physical client/server boundary, and future server imports can leak into the client graph. | Move shared DTO/parser code to a neutral protocol surface and add server/client sentinels. |
| A human decision shares cache failure semantics | `label-repository.ts` stores model and user labels and swallows every storage failure | The UI can show a manual name that disappears after reload without reporting an unsaved state. | Split authoritative manual metadata from disposable model-label cache or explicitly change the product promise. |
| Three view modules own many lifecycles | `RootedMaterial.tsx` is 1,832 lines, `CanvasChrome.tsx` 1,343, and `MaterialFiles.tsx` 1,178 | Cancellation, exclusivity, focus, geometry, and network ownership are hard to reason about together. | Freeze behavior, then extract one lifecycle owner at a time; keep hot DOM measurement at the rendering edge. |
| Local inference cancellation is incomplete | the client rejects pending work, while the worker keeps a serialized inference queue with no active-job cancellation | A cancelled long job can consume CPU and delay later work. | Give the worker job lifecycle an owner; terminate/recreate if the library cannot cancel safely. |
| Undo capacity has two stories | implementation retains to physical limits while reference material also describes count/byte bounds | Recovery cost and the supported session length are undefined. | Measure save/hydrate/quota behavior, then freeze one policy before changing the structure. |

The codebase is not a hollow scaffold: it contains substantial product code,
91 focused test files and 14 browser specifications. The audit also found that
the three largest view modules total 4,353 lines. These numbers are evidence of
real implementation and concentrated ownership, not quality scores by
themselves.

## Recommended route

Use a guardrails-first, slice-by-slice route:

1. **Freeze the dependency and state ledger.** Adopt the logical DAG above and
   classify every persisted value before moving files.
2. **Make cheap violations fail.** Detect cycles, forbidden fixture imports,
   provider-to-client edges, and forbidden inner-to-outer imports in CI. Keep an
   explicit short allowlist for known debt, with an issue beside each entry.
3. **Repair semantic seams.** Separate manual names from label cache semantics;
   give local inference a real cancellation lifecycle; remove fixture Branch
   behavior; move shared wire contracts to neutral ownership.
4. **Extract by lifecycle.** Begin with one independently testable controller
   from `RootedMaterial`; do not rewrite all three large components together.
5. **Continue vertical slices.** Active-document boot, fixture transform,
   live-model controls, and viewport DOM each cross these same boundaries and
   should delete an allowlisted exception when they land.
6. **Measure before adding infrastructure.** Only measured journal cost,
   rendering cost, cache miss cost, or collaboration evidence can authorize a
   WAL, remote cache, worker pool, CRDT, package split, or broader platform.

Two alternatives remain legitimate but weaker. A product-loop-first route can
finish the transform slice and add guards within it; it gets user evidence
sooner but leaves current seams exposed longer. A directory-rewrite-first route
can make the target shape visually obvious, but creates the largest regression
surface and the least new product proof, so it is not recommended.

## Tracked work

The audit reuses existing issues where the ownership boundary was already
frozen and creates narrow issues only for newly verified gaps:

| Priority | Work |
| --- | --- |
| P0 | [#34](https://github.com/p-to-q/matter/issues/34) closes distributed live-model abuse and spend controls; [#8](https://github.com/p-to-q/matter/issues/8) establishes the durable active-document pointer. |
| P1 | [#44](https://github.com/p-to-q/matter/issues/44) removes fixture mutations from production actions; [#46](https://github.com/p-to-q/matter/issues/46) separates manual-name durability from label caching; [#45](https://github.com/p-to-q/matter/issues/45) owns local transcription cancellation; [#49](https://github.com/p-to-q/matter/issues/49) restores the single-inquiry boundary; [#50](https://github.com/p-to-q/matter/issues/50) creates the neutral protocol and executable dependency DAG. |
| P2 | [#47](https://github.com/p-to-q/matter/issues/47) measures and freezes undo-journal capacity; [#48](https://github.com/p-to-q/matter/issues/48) extracts one interaction coordinator under behavior proofs. |

The dependency check in #50 should land after or with #44 so the production
fixture edge is removed rather than normalized as a permanent exception. The
component extraction in #48 follows behavior and lifecycle fixes; it is not the
opening move.

## Rule-to-proof matrix

| Rule | Owner | Mechanical proof |
| --- | --- | --- |
| Only the tree engine applies durable material mutations | `tree/` | atomic forward/inverse/stale command tests and forbidden-import check |
| Imports point inward and are acyclic | repository architecture check | production import graph fixture in `npm run check` |
| Fixture code never implements a production capability | composition root | forbidden fixture import plus a browser proof of honest disabled state |
| Provider code never enters the client graph | server and protocol owners | neutral contract tests, `server-only`/`client-only` guard, production build |
| Every external operation has one cleanup owner | adapter that starts it | cancel, timeout, late result, unmount, retry, and idempotent cleanup tests |
| Caches never own human truth | persistence owner | quota/blocked/corrupt tests and visible failure receipt for authoritative writes |
| Persisted and network values are strict and versioned | codec/contract owner | corpus round-trip, malformed, bounded, migration, and replay-equivalence tests |
| Large UI modules are split by lifecycle, not cosmetics | component/application owner | characterization tests before extraction and unchanged pointer/browser receipts |

## Issue policy

An issue should describe one ownership failure or one proof boundary, with an
outcome, scope, invariants, acceptance evidence, and non-goals. Reference notes
hold rationale; issues hold unfinished work; `changes.md` records only decisions
that have actually changed product or system form. Do not use an issue as a
parallel architecture specification, and do not add an abstraction issue
without at least two current call sites or a measured constraint.
