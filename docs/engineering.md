# Engineering

This is the small implementation contract. Product shape lives in
[`product.md`](product.md); system shape lives in
[`architecture.md`](architecture.md).

## Change shape

Before a non-trivial slice, write five lines in the active plan or pull request:

```text
Outcome:    what a person can do afterwards
Boundary:   the smallest system surface changed
Invariants: what must remain true
Proof:      focused tests and browser evidence
Non-goals:  nearby work deliberately excluded
```

`Boundary` names the owning module, fact or lifecycle, and any public surface
added or widened; it is not only a list of files. If one slice crosses several
owners, state why they form one atomic change rather than convenient nearby
work.

Read before writing. Extend one active path, keep the diff coherent, and avoid
dependency upgrades, file moves, formatting churn, and speculative abstractions.
Repository evidence overrides generic practice. A frozen choice reopens only for
a failing test, browser behavior, measurement, provider constraint, or corrected
product intent.

## System rules

- Domain functions receive ids and time as values; they do not read clocks,
  randomness, the DOM, network, or storage.
- The tree engine returns a success or stable failure. It never publishes a
  partially changed candidate and never throws for expected invalid input.
- React and Zustand bind state and events; they do not validate trees, derive
  lineage, construct inverses, segment text, or encode snapshots.
- Async work is an effect. Its result returns with an operation token and is
  synchronously revalidated before a durable commit.
- One owner exists for each fact. Derived views and caches are disposable and
  never become a second document model.
- Parse at browser, HTTP, provider, storage, and archive boundaries. Reject bad
  values whole; do not repair or silently fall back.
- Use stable error codes at boundaries. Provider messages, raw audio, transcript,
  and lineage never enter routine logs.

## Module ownership

Place code with the owner of its invariant, not in the widest module that can
reach it. Before adding behavior to a store, component, controller, repository,
or route, name the authoritative fact, policy, or lifecycle it owns; the public
operation its caller needs; its allowed dependencies; and the proof for its
failure boundary. If no current owner fits, add the smallest named module at the
correct layer rather than making a convenient caller the new owner.

Construction happens at an explicit composition boundary; behavior stays with
its named owner. Product-wide modes and singleton choices belong at the product
root. A resource used by one focused lifecycle may instead be constructed by
that lifecycle's factory, which then owns its cleanup. Neither boundary
validates domain values, derives layout or context, constructs private
mutations, defines persistence semantics, or interprets provider results. Do
not hide dependencies in a service locator or an unbounded `services`, context,
or options bag; pass the narrow port or capability the owner actually uses.

Reach does not decide state ownership. A value belongs in the application store
only when its transition is application-level, not merely because several
components need to read it. Render-local state stays at the rendering edge;
resource-internal state stays with its session or adapter; a derived value is
recomputed or kept in an explicitly disposable cache. The store exposes
observable application state, public actions, and receipts. It does not create
providers, workers, repositories, or fixtures, and it does not reimplement
tree, codec, lineage, layout, or protocol rules.

Modules are private by default. A new cross-module export needs a current
consumer and exposes a narrow operation, port, or strict value rather than
mutable internal state or a concrete adapter. Do not add a barrel that merely
re-exports an implementation. A helper stays beside the policy that owns it;
undifferentiated `common`, `shared`, `utils`, `services`, and `managers` are not
owners. Extract a shared concept only when at least two current owners need the
same stable behavior, then name it for that concept and preserve dependency
direction.

Recheck ownership before a module gains any of the following:

- another durable fact with a different commit, invalidation, or failure policy;
- another external resource with an independent cancel, retry, or cleanup path;
- platform, storage, or provider adaptation beside pure policy;
- test setup or reset machinery unrelated to its existing invariant;
- a public export added only so another layer can reach an internal helper.

These are review triggers, not automatic split rules. State that shares one
invariant and lifecycle may stay together. When the owners differ, freeze the
behavior and extract one owner at a time. Line count, hook count, import count,
and fan-in are concentration signals only; none is a refactoring requirement.

## Architecture fitness

These are the rules a change is held to, and `npm run check:architecture` now
holds the four of them that are syntactic: layers point inward, the protocol
stays neutral, only server code reaches a provider, and the runtime import graph
has no cycle. It runs inside `npm test`, so CI enforces it. The exceptions that used
to live here — an import cycle between the two voice transports, browser code
reaching into `server/*-contract`, and a fixture on a production path — were
cleared before the check landed, because a check that fails on the day it
arrives is a check someone silences.

The runtime import graph must be acyclic. Dependencies point from composition
and adapters toward application and domain code; a lower layer must not import
the store, a component, a browser adapter, a route, or a provider. Test and demo
fixtures are leaves and must not supply behavior to a production path.

Code shared by browser and server must be a neutral, strict, serializable
contract. It does not belong in a provider module. Provider modules are
server-only and browser adapters are client-only. A concrete adapter is chosen
at an explicit composition boundary: the product root for product-wide modes,
or the owning lifecycle factory for a lifecycle-local resource. Domain and
application policy never discovers or silently selects fixture versus live
behavior.

Every external resource has one lifecycle owner. A microphone, worker, request,
timer, animation frame, database handle, or subscription has an explicit start,
cancel or stop, and idempotent cleanup. A late completion is a no-op unless its
operation, document, revision, and addressed material still match.

Every cache states its owner, authority class, key, size or time bound,
invalidation trigger, read-time revalidation, and failure fallback. A snapshot,
active-document pointer, manual name, or other human decision is durable state,
not a cache, and cannot be hidden behind best-effort cache failure semantics.
Do not introduce a generic cache service merely to make these policies look
uniform.

Objective boundaries such as cycles, forbidden layer edges, and fixture or
provider leaks belong in `npm run check`. Concentration metrics remain review
signals because they cannot identify an invariant or lifecycle owner. Every
architecture rule names an owner and has either a mechanical check or a focused
proof; prose alone is guidance, not enforcement. Placement and extraction still
require engineering judgment: record the present evidence and the signal that
would reverse the choice instead of pretending an AST can decide ownership.

## Comments

Comments in source code are written in English. Add them where they preserve
information that types and names cannot carry by themselves:

- the product invariant or ownership boundary a module protects;
- why an apparently simpler implementation is unsafe;
- a non-obvious failure, cancellation, recovery, or browser behavior;
- a protocol unit, security assumption, or performance constraint that a later
  change could accidentally violate.

At the entry to a core feature, a short module comment may state what it owns,
what it must not own, and which boundary calls it. Do not narrate syntax, repeat
the function name, keep dead alternatives, or turn comments into a second
specification. When behavior changes, update or remove the comment in the same
change.

Do not add a general transaction system, service hierarchy, event log, CRDT,
worker, or platform SDK to solve a single first-release slice. Extract a shared
abstraction only when two current call sites need the same stable concept.

## Proof

Proof is proportional to the risk and protects the observable contract, not the
current implementation shape. Tests hold outputs, durable authority, failure,
cancellation, recovery, bounds, and compatibility where those matter. They do
not freeze file counts, hook counts, helper names, private state shape, internal
call order, or a particular adapter unless one of those is itself the boundary.

A choice may be the best fit for the current browser, provider, roadmap, or
measured workload without being universal. When that choice cannot be checked
mechanically, record its evidence, the plausible alternative, and the condition
that would reopen it; use a focused test, receipt, or review check rather than an
artificial exhaustive gate. More tests are not automatically stronger proof.

Generated Next route declarations are build state, not repository state.
`next-env.d.ts` stays ignored; `npm run typegen` creates the declarations needed
by a clean checkout before standalone typecheck. The Playwright development
server may use `.next-e2e` only when both its reserved directory and explicit
runner marker are present. Its wrapper removes that generated directory before
each run so stale Server Action and chunk manifests cannot cross a test boundary.
An exclusive owner lock rejects concurrent runners before either can touch that
directory. Its canonical process-and-token record is removed only by the same
inode and owner. Malformed metadata and a lock whose recorded process no longer
exists fail closed rather than attempting an unsafe automatic recovery; after
confirming no runner is active, a person may remove that one stale generated
lock and retry. The wrapper owns the spawned process group on POSIX, restores
generated references after every exit path, preserves the test process's
failure when cleanup also fails, and treats a file that was never generated as
normal cleanup.

Run the narrowest test first. Changes to commands prove forward result, exact
inverse, invalid atomic rejection, and revision behavior. Protocol changes prove
valid, malformed, bounded, and stale inputs. Interaction changes prove cancel,
interrupt, late result, cleanup, and pointer recovery. Persistence changes prove
round-trip, conflict, corrupt input, failed write, and retry.

Before merge, run `npm run check` and `npm run test:e2e`. Interaction work also
gets a pointer-only fixture walk at laptop and narrow widths. A verifier checks
the frozen outcome, diff boundary, actual command output, and remaining risks;
it does not accept the builder's summary as evidence.
