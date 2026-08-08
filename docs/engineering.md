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

## Architecture fitness

The runtime import graph is acyclic. Dependencies point from composition and
adapters toward application and domain code; a lower layer never imports the
store, a component, a browser adapter, a route, or a provider. Test and demo
fixtures are leaves and never supply behavior to a production path.

Code shared by browser and server is a neutral, strict, serializable contract.
It does not live in a provider module. Provider modules are server-only, browser
adapters are client-only, and the composition root is the only place allowed to
choose concrete adapters.

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

Split a module when it owns several independent lifecycles or facts, not when it
crosses an arbitrary line count. Preserve behavior first with focused tests,
then extract one owner at a time. Once a dependency or ownership rule is stable
and syntactic, encode it in `npm run check`; prose and review are not its final
enforcement mechanism.

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

Generated Next route declarations are build state, not repository state.
`next-env.d.ts` stays ignored; `npm run typegen` creates the declarations needed
by a clean checkout before standalone typecheck. The Playwright development
server may use `.next-e2e` only when both its reserved directory and explicit
runner marker are present. Its wrapper owns the spawned process group on POSIX,
restores generated references after every exit path, and treats a file that was
never generated as normal cleanup.

Run the narrowest test first. Changes to commands prove forward result, exact
inverse, invalid atomic rejection, and revision behavior. Protocol changes prove
valid, malformed, bounded, and stale inputs. Interaction changes prove cancel,
interrupt, late result, cleanup, and pointer recovery. Persistence changes prove
round-trip, conflict, corrupt input, failed write, and retry.

Before merge, run `npm run check` and `npm run test:e2e`. Interaction work also
gets a pointer-only fixture walk at laptop and narrow widths. A verifier checks
the frozen outcome, diff boundary, actual command output, and remaining risks;
it does not accept the builder's summary as evidence.
