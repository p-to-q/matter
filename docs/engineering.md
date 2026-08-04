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

Run the narrowest test first. Changes to commands prove forward result, exact
inverse, invalid atomic rejection, and revision behavior. Protocol changes prove
valid, malformed, bounded, and stale inputs. Interaction changes prove cancel,
interrupt, late result, cleanup, and pointer recovery. Persistence changes prove
round-trip, conflict, corrupt input, failed write, and retry.

Before merge, run `npm run check` and `npm run test:e2e`. Interaction work also
gets a pointer-only fixture walk at laptop and narrow widths. A verifier checks
the frozen outcome, diff boundary, actual command output, and remaining risks;
it does not accept the builder's summary as evidence.
